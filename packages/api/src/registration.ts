import {
  childAvailabilities,
  children,
  formatInviteCode,
  guardianChildren,
  resolveInviteCode,
  type TeamTx,
  withInviteCodeRetry,
  withTeam,
} from "@hoopo/db";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { gradeFromBirthDate, todayTokyo } from "./grade-shared";
import type {
  ChildDetail,
  ChildPatch,
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
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
  nicknameKana: string | null;
  grade: number;
  gender: Gender;
  /** "YYYY-MM-DD"。0010 より前に登録された部員は null(plan.md 設計判断3) */
  birthDate: string | null;
  heightCm: number | null;
}

/**
 * 生年月日から保存する学年を求める。パース(parseBirthDate)を通っていれば必ず 1..6 に
 * なるので、null は日付をまたいだ等の異常系。黙って古い学年を残さず落とす
 */
function gradeForBirthDate(birthDate: string): number {
  const grade = gradeFromBirthDate(birthDate, todayTokyo());
  if (grade === null) throw new Error("小学生の生年月日を入力してください");
  return grade;
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
        familyName: children.familyName,
        givenName: children.givenName,
        familyNameKana: children.familyNameKana,
        givenNameKana: children.givenNameKana,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
        gender: children.gender,
        birthDate: children.birthDate,
        heightCm: children.heightCm,
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
      // 学年の高い順 → 姓のよみ → 名のよみで安定させる(上の子が先に並ぶ)
      .orderBy(
        asc(children.createdAt),
        desc(children.grade),
        asc(children.familyNameKana),
        asc(children.givenNameKana),
      );
    return rows.map((r) => ({ ...r, gender: r.gender as Gender }));
  });
}

export interface RegisteredChild {
  id: string;
  familyName: string;
  givenName: string;
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
              familyName: child.familyName,
              givenName: child.givenName,
              familyNameKana: child.familyNameKana,
              givenNameKana: child.givenNameKana,
              nicknameKana: child.nicknameKana,
              // 学年は入力ではなく生年月日からの算出値(plan.md 設計判断2)
              grade: gradeForBirthDate(child.birthDate),
              birthDate: child.birthDate,
              heightCm: child.heightCm,
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
        familyName: child.familyName,
        givenName: child.givenName,
        inviteCode: row.inviteCode,
      });
    }
    return created;
  });
}

export type LinkResult =
  | {
      ok: true;
      child: { id: string; familyName: string; givenName: string };
      alreadyLinked: boolean;
    }
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
      columns: { id: true, familyName: true, givenName: true, status: true },
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
        child: {
          id: child.id,
          familyName: child.familyName,
          givenName: child.givenName,
        },
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
      child: {
        id: child.id,
        familyName: child.familyName,
        givenName: child.givenName,
      },
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

export interface FamilyChild extends ChildDetail {
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
      ...c,
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

/**
 * 子ども情報の更新本体。保護者(家族の設定)とコーチ(部員管理)で同じ規則にするため
 * ここに集約する。「見えるか」の判定は呼び出し側の責務。
 * 見つからなければ null(RLS 配下なので他チームの行はそもそも更新できない)
 */
export async function applyChildPatch(
  tx: TeamTx,
  childId: string,
  patch: ChildPatch,
): Promise<ChildDetail | null> {
  const [row] = await tx
    .update(children)
    .set({
      ...patch,
      // 生年月日を直したら学年も追従させる(設計判断2)
      ...(patch.birthDate ? { grade: gradeForBirthDate(patch.birthDate) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(children.id, childId))
    .returning({
      id: children.id,
      familyName: children.familyName,
      givenName: children.givenName,
      familyNameKana: children.familyNameKana,
      givenNameKana: children.givenNameKana,
      nicknameKana: children.nicknameKana,
      grade: children.grade,
      gender: children.gender,
      birthDate: children.birthDate,
      heightCm: children.heightCm,
    });
  return row ? { ...row, gender: row.gender as Gender } : null;
}

export type UpdateChildResult =
  | { ok: true; value: ChildDetail }
  | { ok: false; reason: "not_found" };

/**
 * 家族の設定からの子ども情報の編集(plan.md 設計判断5)。
 * active な連携経由で見える子だけが対象(他チーム・未連携・無効化済みは not_found)。
 * 生年月日を直したときは学年を再計算して保存する(設計判断2)
 */
export async function updateChildByGuardian(
  teamId: string,
  guardianId: string,
  childId: string,
  patch: ChildPatch,
): Promise<UpdateChildResult> {
  return withTeam(teamId, async (tx) => {
    const mine = await tx
      .select({ childId: guardianChildren.childId })
      .from(guardianChildren)
      .innerJoin(children, eq(children.id, guardianChildren.childId))
      .where(
        and(
          eq(guardianChildren.guardianId, guardianId),
          eq(guardianChildren.childId, childId),
          eq(guardianChildren.status, "active"),
          eq(children.status, "active"),
          eq(children.archived, false),
        ),
      )
      .limit(1);
    if (mine.length === 0) return { ok: false, reason: "not_found" };
    const updated = await applyChildPatch(tx, childId, patch);
    return updated
      ? { ok: true, value: updated }
      : { ok: false, reason: "not_found" };
  });
}
