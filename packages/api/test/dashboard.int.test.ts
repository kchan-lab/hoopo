import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { daysInMonth, monthOf, todayInTokyo } from "../src/tokyo-date";

// 管理ダッシュボード API(admin-dashboard/plan.md 7c)を RLS 配下で検証する。
// 集計は「Tokyo の今日」基準なので、練習日は固定値ではなく今日から組み立てる。
// 保護者側の提出 API は 4a なので、ここでは owner 接続で attendances に直接行を作る

const SESSION_SECRET = "7".repeat(64);
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});

const today = todayInTokyo();
const month = monthOf(today);
const monthNumber = Number(month.slice(5));
const year = Number(today.slice(0, 4));
const day = Number(today.slice(8));
const dateOf = (d: number) => `${month}-${String(d).padStart(2, "0")}`;
// 次回練習を「今日」に固定するため、もう1本は今日より後(月末なら前日)に置く。
// どちらの場合も「今日以降で最初の練習」は今日の練習になる
const otherDay = day < daysInMonth(year, monthNumber) ? day + 1 : day - 1;

let teamId: string;
let otherTeamId: string;
let emptyTeamId: string;
let coachHash: string;
let taro: string; // 粉浜 太郎(6年)= 2件とも回答する
let ichiro: string; // 粉浜 一郎(4年)= 一度も回答しない
let pToday: string; // 今日の練習(= 次回の練習)
let pOtherDay: string; // 同じ月のもう1本

const adminApi = (team = teamId) =>
  createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
  });

async function coachClient(
  app: ReturnType<typeof adminApi>,
  email = "coach@example.com",
) {
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
  return (path: string) =>
    app.request(path, { method: "GET", headers: { Cookie: cookie } });
}

async function insertChild(
  team: string,
  name: string,
  grade: number,
  code: string,
  options: { archived?: boolean; status?: "active" | "revoked" } = {},
): Promise<string> {
  const [row] = await owner`
    INSERT INTO children (team_id, name, nickname_kana, grade, gender, invite_code, status, archived)
    VALUES (${team}, ${name}, ${"たろう"}, ${grade}, 'male', ${code},
            ${options.status ?? "active"}, ${options.archived ?? false})
    RETURNING id`;
  if (!row) throw new Error(`部員の作成に失敗しました: ${name}`);
  return row.id as string;
}

async function insertPractice(team: string, heldOn: string): Promise<string> {
  const [row] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${team}, ${heldOn}, '09:00', '12:00', '粉浜小学校 体育館')
    RETURNING id`;
  if (!row) throw new Error(`練習の作成に失敗しました: ${heldOn}`);
  return row.id as string;
}

async function insertAnswer(
  team: string,
  childId: string,
  practiceId: string,
  status: "full" | "partial" | "absent",
): Promise<void> {
  await owner`
    INSERT INTO attendances (team_id, child_id, practice_id, status)
    VALUES (${team}, ${childId}, ${practiceId}, ${status})`;
}

async function insertFee(
  team: string,
  childId: string,
  status: "paid" | "unpaid",
): Promise<void> {
  await owner`
    INSERT INTO fee_records (team_id, child_id, year, month, status, received_at)
    VALUES (${team}, ${childId}, ${year}, ${monthNumber}, ${status},
            ${status === "paid" ? new Date() : null})`;
}

beforeAll(async () => {
  coachHash = await hashPassword("coach-pass-1");
});

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups
      RESTART IDENTITY CASCADE
  `;
  const [a] = await owner`INSERT INTO teams (name) VALUES ('SKC') RETURNING id`;
  const [b] =
    await owner`INSERT INTO teams (name) VALUES ('他チーム') RETURNING id`;
  const [c] =
    await owner`INSERT INTO teams (name) VALUES ('空チーム') RETURNING id`;
  if (!a || !b || !c) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
  emptyTeamId = c.id;
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash}),
           (${otherTeamId}, 'other@example.com', 'email', ${coachHash}),
           (${emptyTeamId}, 'empty@example.com', 'email', ${coachHash})`;

  taro = await insertChild(teamId, "粉浜 太郎", 6, "AAAAA0001");
  ichiro = await insertChild(teamId, "粉浜 一郎", 4, "AAAAA0002");
  // 集計に混ざってはいけない部員(卒団アーカイブ / 無効化)
  await insertChild(teamId, "卒団 花子", 6, "AAAAA0005", { archived: true });
  await insertChild(teamId, "無効 花子", 5, "AAAAA0006", { status: "revoked" });

  pToday = await insertPractice(teamId, dateOf(day));
  pOtherDay = await insertPractice(teamId, dateOf(otherDay));

  // 太郎だけが2件とも回答する(今日は参加、もう1本は不参加)
  await insertAnswer(teamId, taro, pToday, "full");
  await insertAnswer(teamId, taro, pOtherDay, "absent");

  // 月謝: 太郎=未 / 一郎=済
  await insertFee(teamId, taro, "unpaid");
  await insertFee(teamId, ichiro, "paid");

  // 他チームにも同じ日の練習と部員を置き、混ざらないことを確認できるようにする
  await insertChild(otherTeamId, "他 花子", 5, "BBBBB0001");
  await insertPractice(otherTeamId, dateOf(day));
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

type DashboardBody = {
  month: string;
  currentMonth: string;
  submission: { answered: number; total: number; rate: number };
  nextPractice: {
    practice: { id: string; heldOn: string };
    full: number;
    partial: number;
    absent: number;
    unanswered: number;
  } | null;
  fees: { unpaidCount: number; total: number };
  unansweredMembers: {
    id: string;
    name: string;
    grade: number;
    unanswered: number;
  }[];
};

describe("ダッシュボード(GET /dashboard)", () => {
  it("未ログインは 401", async () => {
    expect((await adminApi().request("/dashboard")).status).toBe(401);
  });

  it("今月の提出率・次回参加人数・月謝未提出・未提出の部員を返す", async () => {
    const client = await coachClient(adminApi());
    const res = await client("/dashboard");
    expect(res.status).toBe(200);
    const body = (await res.json()) as DashboardBody;

    expect(body.month).toBe(month);
    expect(body.currentMonth).toBe(month);

    // 有効な部員2人 × 今月の練習2本 = 4セル。回答済みは太郎の2件
    expect(body.submission).toEqual({ answered: 2, total: 4, rate: 50 });

    // 次回は「今日」の練習。太郎=参加、一郎=未回答
    expect(body.nextPractice?.practice.id).toBe(pToday);
    expect(body.nextPractice?.practice.heldOn).toBe(dateOf(day));
    expect(body.nextPractice?.full).toBe(1);
    expect(body.nextPractice?.partial).toBe(0);
    expect(body.nextPractice?.absent).toBe(0);
    expect(body.nextPractice?.unanswered).toBe(1);

    // 月謝は「未」の部員数。アーカイブ・無効化の部員は分母にも入らない
    expect(body.fees).toEqual({ unpaidCount: 1, total: 2 });

    // 未回答が1件以上ある部員だけを学年降順→名前で返す(全部回答した太郎は出ない)
    expect(body.unansweredMembers).toEqual([
      { id: ichiro, name: "粉浜 一郎", grade: 4, unanswered: 2 },
    ]);
  });

  it("途中参加は次回の内訳と提出率の両方に数える", async () => {
    await insertAnswer(teamId, ichiro, pToday, "partial");
    const client = await coachClient(adminApi());
    const body = (await (await client("/dashboard")).json()) as DashboardBody;
    expect(body.submission).toEqual({ answered: 3, total: 4, rate: 75 });
    expect(body.nextPractice?.full).toBe(1);
    expect(body.nextPractice?.partial).toBe(1);
    expect(body.nextPractice?.unanswered).toBe(0);
    expect(body.unansweredMembers).toEqual([
      { id: ichiro, name: "粉浜 一郎", grade: 4, unanswered: 1 },
    ]);
  });

  it("部員も練習もないチームは 0 と null を返す", async () => {
    const client = await coachClient(
      adminApi(emptyTeamId),
      "empty@example.com",
    );
    const body = (await (await client("/dashboard")).json()) as DashboardBody;
    expect(body.submission).toEqual({ answered: 0, total: 0, rate: 0 });
    expect(body.nextPractice).toBeNull();
    expect(body.fees).toEqual({ unpaidCount: 0, total: 0 });
    expect(body.unansweredMembers).toEqual([]);
  });

  it("他チームのコーチには自チームの数字だけが見える(RLS)", async () => {
    const client = await coachClient(
      adminApi(otherTeamId),
      "other@example.com",
    );
    const body = (await (await client("/dashboard")).json()) as DashboardBody;
    // 部員1人 × 練習1本、回答なし。月謝の行が無い部員は今月なら「未」
    expect(body.submission).toEqual({ answered: 0, total: 1, rate: 0 });
    expect(body.nextPractice?.practice.id).not.toBe(pToday);
    expect(body.nextPractice?.unanswered).toBe(1);
    expect(body.fees).toEqual({ unpaidCount: 1, total: 1 });
    expect(body.unansweredMembers.map((m) => m.name)).toEqual(["他 花子"]);
  });
});
