import {
  childAvailabilities,
  children,
  formatInviteCode,
  guardianChildren,
  resolveInviteCode,
  withInviteCodeRetry,
  withTeam,
} from "@hoopo/db";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type {
  Gender,
  LinkInput,
  RegistrationInput,
  Relation,
} from "./registration-shared";

// 子ども登録・家族連携のドメインロジック(child-registration/plan.md)。
// Hono ルート(app.ts)と portal のサーバーコンポーネントの両方から使う。
// 定数・型・入力バリデーションは registration-shared.ts(クライアントでも使える)
export * from "./registration-shared";

// ---- 参照 ----

export interface ChildSummary {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
  gender: Gender;
}

// 「active な guardian_children 経由で見える子」だけを返す(plan.md 設計判断8)。
// 無効化(revoked)された連携・子どもはここで落ちるため、保護者側の全画面がこれを基準にできる
export async function listChildrenForGuardian(
  teamId: string,
  guardianId: string,
): Promise<ChildSummary[]> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select({
        id: children.id,
        name: children.name,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
        gender: children.gender,
      })
      .from(guardianChildren)
      .innerJoin(children, eq(children.id, guardianChildren.childId))
      .where(
        and(
          eq(guardianChildren.guardianId, guardianId),
          eq(guardianChildren.status, "active"),
          eq(children.status, "active"),
          eq(children.archived, false),
        ),
      )
      // 同時登録した兄弟は created_at が同一(now() はトランザクション開始時刻)なので
      // 学年の高い順 → 名前で安定させる(上の子が先に並ぶ)
      .orderBy(
        asc(children.createdAt),
        desc(children.grade),
        asc(children.name),
      );
    return rows.map((r) => ({ ...r, gender: r.gender as Gender }));
  });
}

export interface RegisteredChild {
  id: string;
  name: string;
  inviteCode: string;
}

// 新規登録(自動認定 status=active)。兄弟は同一の参加情報・伝達事項を適用する(設計判断5)
export async function registerChildren(
  teamId: string,
  guardianId: string,
  input: RegistrationInput,
): Promise<RegisteredChild[]> {
  return withTeam(teamId, async (tx) => {
    const created: RegisteredChild[] = [];
    for (const child of input.children) {
      // 一意制約違反はトランザクションを abort するため、ネストした transaction
      // (SAVEPOINT)の中で INSERT し、衝突時はそこまで巻き戻して別コードで再試行する
      const row = await withInviteCodeRetry((inviteCode) =>
        tx.transaction(async (sp) => {
          const [inserted] = await sp
            .insert(children)
            .values({
              teamId,
              name: child.name,
              nicknameKana: child.nicknameKana,
              grade: child.grade,
              gender: child.gender,
              coachNote: input.coachNote,
              inviteCode,
            })
            .returning({ id: children.id, inviteCode: children.inviteCode });
          if (!inserted) throw new Error("子どもの登録に失敗しました");
          return inserted;
        }),
      );
      await tx.insert(guardianChildren).values({
        teamId,
        guardianId,
        childId: row.id,
        relation: input.relation,
      });
      await tx.insert(childAvailabilities).values(
        input.weekdays.map((weekday) => ({
          teamId,
          childId: row.id,
          weekday,
          startTime: input.startTime,
          endTime: input.endTime,
        })),
      );
      created.push({
        id: row.id,
        name: child.name,
        inviteCode: row.inviteCode,
      });
    }
    return created;
  });
}

export type LinkResult =
  | { ok: true; child: { id: string; name: string }; alreadyLinked: boolean }
  | { ok: false; reason: "not_found" | "revoked" };

// 招待コードで既存の子どもと連携する(第二保護者)。
// 他チームのコードは resolve できても not_found として扱い、存在を漏らさない
export async function linkChildByInviteCode(
  teamId: string,
  guardianId: string,
  input: LinkInput,
): Promise<LinkResult> {
  const resolved = await resolveInviteCode(input.code);
  if (!resolved || resolved.teamId !== teamId)
    return { ok: false, reason: "not_found" };
  return withTeam(teamId, async (tx) => {
    const child = await tx.query.children.findFirst({
      where: and(
        eq(children.id, resolved.childId),
        eq(children.archived, false),
      ),
      columns: { id: true, name: true, status: true },
    });
    if (!child) return { ok: false, reason: "not_found" };
    if (child.status !== "active") return { ok: false, reason: "revoked" };
    const existing = await tx.query.guardianChildren.findFirst({
      where: and(
        eq(guardianChildren.guardianId, guardianId),
        eq(guardianChildren.childId, child.id),
      ),
      columns: { status: true, relation: true },
    });
    if (existing?.status === "revoked") return { ok: false, reason: "revoked" };
    if (existing) {
      // 連携済みならコードの再入力は「続柄の修正」として扱う(専用の編集導線が無いため)
      if (existing.relation !== input.relation) {
        await tx
          .update(guardianChildren)
          .set({ relation: input.relation, updatedAt: new Date() })
          .where(
            and(
              eq(guardianChildren.guardianId, guardianId),
              eq(guardianChildren.childId, child.id),
            ),
          );
      }
      return {
        ok: true,
        child: { id: child.id, name: child.name },
        alreadyLinked: true,
      };
    }
    await tx.insert(guardianChildren).values({
      teamId,
      guardianId,
      childId: child.id,
      relation: input.relation,
    });
    return {
      ok: true,
      child: { id: child.id, name: child.name },
      alreadyLinked: false,
    };
  });
}

export type UnlinkResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "last_guardian" };

// 自分の連携を解除する(family-links/plan.md 設計判断1・2)。
// 物理削除にして、コーチによる無効化(revoked)と区別する(再連携は招待コードで可能)。
// 最後の active な保護者は解除できない(子どもが誰からも見えなくなるのを防ぐ)
export async function unlinkChild(
  teamId: string,
  guardianId: string,
  childId: string,
): Promise<UnlinkResult> {
  return withTeam(teamId, async (tx) => {
    // 父と母が同時に解除すると両方が「他に保護者がいる」と判定して孤児化しうる(TOCTOU)ため、
    // 子ども単位のトランザクション内アドバイザリロックで直列化する(READ COMMITTED でも安全)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${childId}))`);
    // 自分の active な連携だけが対象(他チーム・未連携・無効化済みは存在を漏らさず not_found)
    const mine = await tx.query.guardianChildren.findFirst({
      where: and(
        eq(guardianChildren.guardianId, guardianId),
        eq(guardianChildren.childId, childId),
        eq(guardianChildren.status, "active"),
      ),
      columns: { childId: true },
    });
    if (!mine) return { ok: false, reason: "not_found" };
    const others = await tx
      .select({ guardianId: guardianChildren.guardianId })
      .from(guardianChildren)
      .where(
        and(
          eq(guardianChildren.childId, childId),
          eq(guardianChildren.status, "active"),
          ne(guardianChildren.guardianId, guardianId),
        ),
      )
      .limit(1);
    if (others.length === 0) return { ok: false, reason: "last_guardian" };
    await tx
      .delete(guardianChildren)
      .where(
        and(
          eq(guardianChildren.guardianId, guardianId),
          eq(guardianChildren.childId, childId),
        ),
      );
    return { ok: true };
  });
}

export interface FamilyChild {
  id: string;
  name: string;
  /** 表示用(5-5 ハイフン区切り) */
  inviteCode: string;
  guardians: {
    /** React key 等の識別用(表示名は保持しない) */
    guardianId: string;
    relation: Relation;
    isMe: boolean;
    linkedAt: string;
  }[];
}

// 家族の設定(§4.2-9): 自分の子ごとの招待コードと、連携済み保護者(続柄のみ。名前は保持しない)
export async function getFamily(
  teamId: string,
  guardianId: string,
): Promise<FamilyChild[]> {
  const mine = await listChildrenForGuardian(teamId, guardianId);
  if (mine.length === 0) return [];
  const ids = mine.map((c) => c.id);
  return withTeam(teamId, async (tx) => {
    const codes = await tx
      .select({ id: children.id, inviteCode: children.inviteCode })
      .from(children)
      .where(inArray(children.id, ids));
    const links = await tx
      .select({
        childId: guardianChildren.childId,
        guardianId: guardianChildren.guardianId,
        relation: guardianChildren.relation,
        createdAt: guardianChildren.createdAt,
      })
      .from(guardianChildren)
      .where(
        and(
          inArray(guardianChildren.childId, ids),
          eq(guardianChildren.status, "active"),
        ),
      )
      .orderBy(asc(guardianChildren.createdAt));
    return mine.map((c) => ({
      id: c.id,
      name: c.name,
      inviteCode: formatInviteCode(
        codes.find((x) => x.id === c.id)?.inviteCode ?? "",
      ),
      guardians: links
        .filter((l) => l.childId === c.id)
        .map((l) => ({
          guardianId: l.guardianId,
          relation: l.relation as Relation,
          isMe: l.guardianId === guardianId,
          linkedAt: l.createdAt.toISOString(),
        })),
    }));
  });
}
