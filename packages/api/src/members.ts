import {
  auditLogs,
  childAvailabilities,
  children,
  formatInviteCode,
  guardianChildren,
  guardians,
  withTeam,
} from "@hoopo/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Gender, Relation } from "./registration-shared";
import { isUuid } from "./uuid";

// 管理側の認定管理・部員管理(child-registration/plan.md 12b)。
// 「コーチへ通知」の実体は認定履歴の一覧(設計判断1)。経由元はレコード種別から導出する(判断2)

export type RegistrationKind = "child" | "link";

export interface RegistrationEntry {
  /** child: children.id / link: `${guardianId}:${childId}` */
  key: string;
  kind: RegistrationKind;
  childId: string;
  childName: string;
  grade: number;
  /** link のときの連携した保護者(child は登録した保護者) */
  guardianId: string | null;
  relation: Relation | null;
  status: "active" | "revoked";
  createdAt: string;
}

// 認定履歴: 新規登録(children)と家族連携(2人目以降の guardian_children)を新着順にマージする。
// 最初の guardian_children(登録者本人の紐づけ)は children 側の1件に含める
export async function listRegistrations(
  teamId: string,
): Promise<RegistrationEntry[]> {
  return withTeam(teamId, async (tx) => {
    const kids = await tx
      .select({
        id: children.id,
        name: children.name,
        grade: children.grade,
        status: children.status,
        createdAt: children.createdAt,
      })
      .from(children)
      .where(eq(children.archived, false))
      // 同時登録の兄弟は created_at が同一なので学年降順→名前で安定させる(registration.ts と同じ規則)
      .orderBy(
        asc(children.createdAt),
        desc(children.grade),
        asc(children.name),
      );
    const links = await tx
      .select({
        guardianId: guardianChildren.guardianId,
        childId: guardianChildren.childId,
        relation: guardianChildren.relation,
        status: guardianChildren.status,
        createdAt: guardianChildren.createdAt,
      })
      .from(guardianChildren)
      .orderBy(asc(guardianChildren.createdAt));

    const entries: RegistrationEntry[] = [];
    for (const k of kids) {
      const mine = links.filter((l) => l.childId === k.id);
      // 登録者 = 子どもと同時に作られた最初の紐づけ
      const registrant = mine[0];
      entries.push({
        key: k.id,
        kind: "child",
        childId: k.id,
        childName: k.name,
        grade: k.grade,
        guardianId: registrant?.guardianId ?? null,
        relation: (registrant?.relation as Relation | undefined) ?? null,
        status: k.status,
        createdAt: k.createdAt.toISOString(),
      });
      for (const l of mine.slice(1)) {
        entries.push({
          key: `${l.guardianId}:${l.childId}`,
          kind: "link",
          childId: k.id,
          childName: k.name,
          grade: k.grade,
          guardianId: l.guardianId,
          relation: l.relation as Relation,
          status: l.status,
          createdAt: l.createdAt.toISOString(),
        });
      }
    }
    // 新着順。同時刻は上の kids / links の取得順(学年降順→名前、連携は作成順)を保つ安定ソート
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export interface RevokeInput {
  kind: RegistrationKind;
  childId: string;
  guardianId?: string;
}

export function parseRevoke(
  body: unknown,
): { ok: true; value: RevokeInput } | { ok: false; error: string } {
  const r =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const kind = r.kind;
  const childId = typeof r.childId === "string" ? r.childId : "";
  if ((kind !== "child" && kind !== "link") || !isUuid(childId)) {
    return { ok: false, error: "対象の指定が不正です" };
  }
  if (kind === "link") {
    const guardianId = typeof r.guardianId === "string" ? r.guardianId : "";
    if (!isUuid(guardianId)) {
      return { ok: false, error: "対象の指定が不正です" };
    }
    return { ok: true, value: { kind, childId, guardianId } };
  }
  return { ok: true, value: { kind, childId } };
}

// 無効化(設計判断8): 新規登録 → children.status、家族連携 → guardian_children.status を revoked に。
// 復帰 UI は作らない。戻り値は対象が存在したか
export async function revokeRegistration(
  teamId: string,
  input: RevokeInput,
): Promise<boolean> {
  return withTeam(teamId, async (tx) => {
    if (input.kind === "child") {
      const rows = await tx
        .update(children)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(
          and(eq(children.id, input.childId), eq(children.status, "active")),
        )
        .returning({ id: children.id });
      return rows.length > 0;
    }
    const rows = await tx
      .update(guardianChildren)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(guardianChildren.childId, input.childId),
          eq(guardianChildren.guardianId, input.guardianId ?? ""),
          eq(guardianChildren.status, "active"),
        ),
      )
      .returning({ childId: guardianChildren.childId });
    return rows.length > 0;
  });
}

export interface MemberRow {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
  gender: Gender;
  guardianCount: number;
  coachNote: string | null;
  /** 表示用(5-5 区切り) */
  inviteCode: string;
  availabilities: { weekday: number; startTime: string; endTime: string }[];
}

// 部員一覧(§5.2 部員管理): 有効な部員のみ。詳細(伝達事項全文・曜日/時間・招待コード)も同梱する
export async function listMembers(teamId: string): Promise<MemberRow[]> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select({
        id: children.id,
        name: children.name,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
        gender: children.gender,
        coachNote: children.coachNote,
        inviteCode: children.inviteCode,
        guardianCount: sql<number>`(
          select count(*)::int from guardian_children gc
          where gc.child_id = ${children.id} and gc.status = 'active'
        )`,
      })
      .from(children)
      .where(and(eq(children.archived, false), eq(children.status, "active")))
      .orderBy(desc(children.grade), asc(children.name));
    if (rows.length === 0) return [];
    const slots = await tx
      .select({
        childId: childAvailabilities.childId,
        weekday: childAvailabilities.weekday,
        startTime: childAvailabilities.startTime,
        endTime: childAvailabilities.endTime,
      })
      .from(childAvailabilities)
      .where(
        inArray(
          childAvailabilities.childId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(
        asc(childAvailabilities.weekday),
        asc(childAvailabilities.startTime),
      );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      nicknameKana: r.nicknameKana,
      grade: r.grade,
      gender: r.gender as Gender,
      guardianCount: r.guardianCount,
      coachNote: r.coachNote,
      inviteCode: formatInviteCode(r.inviteCode),
      availabilities: slots
        .filter((s) => s.childId === r.id)
        .map((s) => ({
          weekday: s.weekday,
          startTime: s.startTime.slice(0, 5),
          endTime: s.endTime.slice(0, 5),
        })),
    }));
  });
}

// ---- 卒団後のデータ削除(member-deletion/plan.md。REQUIREMENTS §5.2・§7、PRIVACY_POLICY「保持期間と削除」) ----
// 削除できるのは卒団(アーカイブ済み)だけ(設計判断1)。論理削除ではなく物理削除(設計判断4)で、
// attendances / lineups / fee_records / child_availabilities / guardian_children は FK CASCADE で消える。
// 実行ログ(audit_logs)には名前・LINE ID を残さない(設計判断3。CLAUDE.md 絶対原則4)

export interface ArchivedMemberRow {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
  /** 卒団日(ISO)。年度更新を経ずにアーカイブされた古いデータでは null */
  archivedAt: string | null;
}

/** 卒団した部員の一覧(卒団日の新しい順)。削除の対象になる部員だけを返す */
export async function listArchivedMembers(
  teamId: string,
): Promise<ArchivedMemberRow[]> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select({
        id: children.id,
        name: children.name,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
        archivedAt: children.archivedAt,
      })
      .from(children)
      .where(eq(children.archived, true))
      // 同じ年度更新で卒団した部員は archived_at が同一なので名前で安定させる
      .orderBy(desc(children.archivedAt), asc(children.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      nicknameKana: r.nicknameKana,
      grade: r.grade,
      archivedAt: r.archivedAt?.toISOString() ?? null,
    }));
  });
}

export type DeleteArchivedMemberResult =
  | { ok: true; removedGuardians: number }
  | { ok: false; reason: "not_found" | "not_archived" };

/**
 * 卒団した部員のデータ削除(破壊的操作。確認は UI 側の二段階確認)。
 * 1トランザクションで「child を DELETE → 紐づきが 0 になった guardian を DELETE →
 * audit_logs に INSERT」まで行う。guardian を残す理由(LINE ユーザー ID の暗号文)が
 * 無くなるため一緒に消す(設計判断2)。再登録は招待コード/新規登録でやり直せる
 */
export async function deleteArchivedMember(
  teamId: string,
  childId: string,
  performedBy: string,
): Promise<DeleteArchivedMemberResult> {
  return withTeam(teamId, async (tx): Promise<DeleteArchivedMemberResult> => {
    // RLS 配下なので、他チームの部員はそもそも見えない(= not_found)
    const [child] = await tx
      .select({
        id: children.id,
        grade: children.grade,
        archived: children.archived,
        archivedAt: children.archivedAt,
      })
      .from(children)
      .where(eq(children.id, childId))
      .limit(1);
    if (!child) return { ok: false, reason: "not_found" };
    if (!child.archived) return { ok: false, reason: "not_archived" };

    // 紐づく保護者は child の削除(CASCADE)で guardian_children ごと消えるため、先に控える
    const links = await tx
      .select({ guardianId: guardianChildren.guardianId })
      .from(guardianChildren)
      .where(eq(guardianChildren.childId, childId));
    const guardianIds = [...new Set(links.map((l) => l.guardianId))];

    await tx.delete(children).where(eq(children.id, childId));

    // 削除後も他の子と紐づいている保護者は残す(兄弟がいるケース)
    let removedGuardians = 0;
    if (guardianIds.length > 0) {
      const remaining = await tx
        .select({ guardianId: guardianChildren.guardianId })
        .from(guardianChildren)
        .where(inArray(guardianChildren.guardianId, guardianIds));
      const stillLinked = new Set(remaining.map((r) => r.guardianId));
      const orphans = guardianIds.filter((id) => !stillLinked.has(id));
      if (orphans.length > 0) {
        const deleted = await tx
          .delete(guardians)
          .where(inArray(guardians.id, orphans))
          .returning({ id: guardians.id });
        removedGuardians = deleted.length;
      }
    }

    // 名前は入れない(削除の記録が個人情報の保持にならないように。設計判断3)
    await tx.insert(auditLogs).values({
      teamId,
      action: "child_deleted",
      targetId: childId,
      detail: {
        grade: child.grade,
        archivedAt: child.archivedAt?.toISOString() ?? null,
        removedGuardians,
      },
      performedBy,
    });

    return { ok: true, removedGuardians };
  });
}

export interface AuditLogRow {
  id: string;
  action: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** 破壊的操作の実行ログ(新しい順)。部員管理の下に「実行ログ」として出す */
export async function listAuditLogs(
  teamId: string,
  limit = 20,
): Promise<AuditLogRow[]> {
  // 画面から渡る値なので 1〜50 に丸める(NaN は既定の 20 として扱う)
  const take = Number.isFinite(limit)
    ? Math.min(50, Math.max(1, Math.trunc(limit)))
    : 20;
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetId: auditLogs.targetId,
        detail: auditLogs.detail,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(take);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetId: r.targetId,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
