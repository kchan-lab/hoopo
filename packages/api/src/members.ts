import {
  childAvailabilities,
  children,
  formatInviteCode,
  guardianChildren,
  withTeam,
} from "@hoopo/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Gender, Relation } from "./registration-shared";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if ((kind !== "child" && kind !== "link") || !UUID.test(childId)) {
    return { ok: false, error: "対象の指定が不正です" };
  }
  if (kind === "link") {
    const guardianId = typeof r.guardianId === "string" ? r.guardianId : "";
    if (!UUID.test(guardianId)) {
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
