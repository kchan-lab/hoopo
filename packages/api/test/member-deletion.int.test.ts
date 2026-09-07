import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { adminDeps } from "./admin-deps";

// 卒団後のデータ削除 API(member-deletion/plan.md。REQUIREMENTS §5.2・§7)を RLS 配下で検証する。
// 削除できるのは卒団(アーカイブ済み)だけ(設計判断1)、関連行は FK CASCADE で消え、
// 紐づきが無くなった保護者も一緒に消える(判断2)。実行ログ(audit_logs)に名前は残さない(判断3)

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});

// 卒団日は detail に入るので、テストでは固定値にして突き合わせる
const ARCHIVED_AT = new Date("2026-03-31T15:00:00.000Z");

let teamId: string;
let otherTeamId: string;
let coachId: string;
let coachHash: string;
let graduated: string; // 卒団 太郎(削除の対象)
let sibling: string; // 在籍中の弟(共有保護者の2人目の子)
let active: string; // 在籍 花子(削除できない)
let otherGraduated: string; // 他チームの卒団済み(RLS で触れない)
let onlyGuardian: string; // 卒団 太郎だけに紐づく保護者(削除される)
let sharedGuardian: string; // 卒団 太郎+弟に紐づく保護者(残る)
let practiceId: string;

const adminApi = (team = teamId) =>
  createAdminApi(adminDeps(team, SESSION_SECRET));

interface CoachClient {
  get: (path: string) => Promise<Response>;
  del: (path: string) => Promise<Response>;
}

async function coachClient(
  app: ReturnType<typeof adminApi>,
  email = "coach@example.com",
): Promise<CoachClient> {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "coach-pass-1" }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${ADMIN_SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("管理者セッション Cookie が発行されていません");
  const cookie = `${ADMIN_SESSION_COOKIE_NAME}=${value}`;
  return {
    get: async (path) =>
      app.request(path, { method: "GET", headers: { Cookie: cookie } }),
    del: async (path) =>
      app.request(path, { method: "DELETE", headers: { Cookie: cookie } }),
  };
}

async function insertChild(
  team: string,
  name: string,
  grade: number,
  code: string,
  options: { archived?: boolean } = {},
): Promise<string> {
  const [row] = await owner`
    INSERT INTO children (team_id, name, grade, gender, invite_code, archived, archived_at)
    VALUES (${team}, ${name}, ${grade}, 'male', ${code},
            ${options.archived ?? false},
            ${options.archived ? ARCHIVED_AT : null})
    RETURNING id`;
  if (!row) throw new Error(`部員の作成に失敗しました: ${name}`);
  return row.id as string;
}

async function insertGuardian(team: string, tag: string): Promise<string> {
  const [row] = await owner`
    INSERT INTO guardians (team_id, line_user_id, line_user_id_lookup)
    VALUES (${team}, ${`enc:${tag}`}, ${`lookup-${tag}`})
    RETURNING id`;
  if (!row) throw new Error(`保護者の作成に失敗しました: ${tag}`);
  return row.id as string;
}

async function link(
  team: string,
  guardianId: string,
  childId: string,
): Promise<void> {
  await owner`
    INSERT INTO guardian_children (team_id, guardian_id, child_id, relation)
    VALUES (${team}, ${guardianId}, ${childId}, 'father')`;
}

async function countOf(table: string, childId: string): Promise<number> {
  const rows = await owner<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${owner(table)} WHERE child_id = ${childId}`;
  return rows[0]?.n ?? 0;
}

async function childExists(id: string): Promise<boolean> {
  const rows = await owner`SELECT 1 FROM children WHERE id = ${id}`;
  return rows.length > 0;
}

async function guardianExists(id: string): Promise<boolean> {
  const rows = await owner`SELECT 1 FROM guardians WHERE id = ${id}`;
  return rows.length > 0;
}

interface AuditRow {
  team_id: string;
  action: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  performed_by: string | null;
}

async function auditRows(): Promise<AuditRow[]> {
  return owner<AuditRow[]>`
    SELECT team_id, action, target_id, detail, performed_by FROM audit_logs
    ORDER BY created_at`;
}

interface ArchivedBody {
  members: {
    id: string;
    name: string;
    nicknameKana: string | null;
    grade: number;
    archivedAt: string | null;
  }[];
}

interface LogsBody {
  logs: {
    id: string;
    action: string;
    targetId: string | null;
    detail: Record<string, unknown>;
    createdAt: string;
  }[];
}

beforeAll(async () => {
  coachHash = await hashPassword("coach-pass-1");
});

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups,
      year_rollovers, audit_logs
      RESTART IDENTITY CASCADE
  `;
  const [a] = await owner`INSERT INTO teams (name) VALUES ('SKC') RETURNING id`;
  const [b] =
    await owner`INSERT INTO teams (name) VALUES ('他チーム') RETURNING id`;
  if (!a || !b) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
  const [c] =
    await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash})
    RETURNING id`;
  if (!c) throw new Error("コーチの作成に失敗しました");
  coachId = c.id;
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${otherTeamId}, 'other@example.com', 'email', ${coachHash})`;

  graduated = await insertChild(teamId, "卒団 太郎", 6, "ZZZZZ0001", {
    archived: true,
  });
  sibling = await insertChild(teamId, "在籍 次郎", 3, "ZZZZZ0002");
  active = await insertChild(teamId, "在籍 花子", 4, "ZZZZZ0003");
  otherGraduated = await insertChild(otherTeamId, "他団 三郎", 6, "ZZZZZ0004", {
    archived: true,
  });

  // 卒団 太郎 = 専属の保護者1人 + 弟と共有の保護者1人
  onlyGuardian = await insertGuardian(teamId, "only");
  sharedGuardian = await insertGuardian(teamId, "shared");
  await link(teamId, onlyGuardian, graduated);
  await link(teamId, sharedGuardian, graduated);
  await link(teamId, sharedGuardian, sibling);

  // CASCADE で消える関連行(出欠・月謝・チーム編成・参加可能曜日)
  const [p] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${teamId}, '2026-03-01', '09:00', '12:00') RETURNING id`;
  if (!p) throw new Error("練習の作成に失敗しました");
  practiceId = p.id;
  await owner`INSERT INTO attendances (team_id, child_id, practice_id, status)
    VALUES (${teamId}, ${graduated}, ${practiceId}, 'full')`;
  await owner`INSERT INTO fee_records (team_id, child_id, year, month, status)
    VALUES (${teamId}, ${graduated}, 2026, 3, 'paid')`;
  await owner`INSERT INTO lineups (team_id, practice_id, child_id, role)
    VALUES (${teamId}, ${practiceId}, ${graduated}, 'starter')`;
  await owner`INSERT INTO child_availabilities (team_id, child_id, weekday, start_time, end_time)
    VALUES (${teamId}, ${graduated}, 6, '09:00', '12:00')`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("卒団した部員の一覧(GET /members/archived)", () => {
  it("未ログインでは一覧も削除も実行ログも見られない", async () => {
    const app = adminApi();
    expect((await app.request("/members/archived")).status).toBe(401);
    expect(
      (await app.request(`/members/${graduated}`, { method: "DELETE" })).status,
    ).toBe(401);
    expect((await app.request("/audit-logs")).status).toBe(401);
    // 401 なら当然データは無傷
    expect(await childExists(graduated)).toBe(true);
  });

  it("卒団済みだけを返し、他チームの卒団済みは見えない(RLS)", async () => {
    const coach = await coachClient(adminApi());
    const body = (await (
      await coach.get("/members/archived")
    ).json()) as ArchivedBody;
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({
      id: graduated,
      name: "卒団 太郎",
      grade: 6,
      archivedAt: ARCHIVED_AT.toISOString(),
    });

    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const otherBody = (await (
      await other.get("/members/archived")
    ).json()) as ArchivedBody;
    expect(otherBody.members.map((m) => m.id)).toEqual([otherGraduated]);
  });
});

describe("卒団した部員のデータ削除(DELETE /members/:childId)", () => {
  it("本人と関連行が消え、専属の保護者だけ消えて実行ログが1件残る", async () => {
    const coach = await coachClient(adminApi());
    const res = await coach.del(`/members/${graduated}`);
    expect(res.status).toBe(204);

    // 本人と CASCADE 対象(出欠・月謝・チーム編成・参加可能曜日・紐づき)が消える
    expect(await childExists(graduated)).toBe(false);
    expect(await countOf("attendances", graduated)).toBe(0);
    expect(await countOf("fee_records", graduated)).toBe(0);
    expect(await countOf("lineups", graduated)).toBe(0);
    expect(await countOf("child_availabilities", graduated)).toBe(0);
    expect(await countOf("guardian_children", graduated)).toBe(0);

    // 紐づきが無くなった保護者だけ消える。弟がいる保護者は残る(設計判断2)
    expect(await guardianExists(onlyGuardian)).toBe(false);
    expect(await guardianExists(sharedGuardian)).toBe(true);
    expect(await childExists(sibling)).toBe(true);
    expect(await countOf("guardian_children", sibling)).toBe(1);
    // 練習そのものは消さない
    const practices =
      await owner`SELECT 1 FROM practices WHERE id = ${practiceId}`;
    expect(practices).toHaveLength(1);

    const logs = await auditRows();
    expect(logs).toHaveLength(1);
    const [log] = logs;
    expect(log).toMatchObject({
      team_id: teamId,
      action: "child_deleted",
      target_id: graduated,
      performed_by: coachId,
    });
    expect(log?.detail).toEqual({
      grade: 6,
      archivedAt: ARCHIVED_AT.toISOString(),
      removedGuardians: 1,
    });
    // 名前・LINE ID は残さない(設計判断3。CLAUDE.md 絶対原則4)
    expect(JSON.stringify(log?.detail)).not.toContain("卒団 太郎");
  });

  it("在籍中の部員は 409 で、データも実行ログも変わらない", async () => {
    const coach = await coachClient(adminApi());
    const res = await coach.del(`/members/${active}`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe(
      "在籍中の部員は削除できません(先に年度更新で卒団させてください)",
    );
    expect(await childExists(active)).toBe(true);
    expect(await auditRows()).toEqual([]);
  });

  it("存在しない id・uuid でない id は 404", async () => {
    const coach = await coachClient(adminApi());
    const unknown = "00000000-0000-4000-8000-000000000000";
    const missing = await coach.del(`/members/${unknown}`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: string }).error).toBe(
      "対象が見つかりません",
    );
    // uuid でなければ DB を触らずに 404(:childId が年度更新のパスを食わないことも兼ねる)
    expect((await coach.del("/members/not-a-uuid")).status).toBe(404);
    expect(await auditRows()).toEqual([]);
  });

  it("他チームの卒団済みは 404 で、対象は無傷のまま(RLS)", async () => {
    const coach = await coachClient(adminApi());
    const res = await coach.del(`/members/${otherGraduated}`);
    expect(res.status).toBe(404);
    expect(await childExists(otherGraduated)).toBe(true);
    expect(await auditRows()).toEqual([]);
  });
});

describe("実行ログ(GET /audit-logs)", () => {
  it("自チームのログだけを新しい順に返す", async () => {
    const coach = await coachClient(adminApi());
    expect((await coach.del(`/members/${graduated}`)).status).toBe(204);

    const body = (await (await coach.get("/audit-logs")).json()) as LogsBody;
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]).toMatchObject({
      action: "child_deleted",
      targetId: graduated,
      detail: {
        grade: 6,
        archivedAt: ARCHIVED_AT.toISOString(),
        removedGuardians: 1,
      },
    });

    // 他チームのコーチには見えない(RLS)
    const other = await coachClient(adminApi(otherTeamId), "other@example.com");
    const otherBody = (await (
      await other.get("/audit-logs")
    ).json()) as LogsBody;
    expect(otherBody.logs).toEqual([]);
  });

  it("limit は 1〜50 に丸める", async () => {
    const coach = await coachClient(adminApi());
    expect((await coach.del(`/members/${graduated}`)).status).toBe(204);
    for (const q of ["0", "-5", "999", "abc", ""]) {
      const res = await coach.get(`/audit-logs?limit=${q}`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as LogsBody).logs).toHaveLength(1);
    }
  });
});
