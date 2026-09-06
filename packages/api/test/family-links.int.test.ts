import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { createApi } from "../src/app";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "../src/session";

// 家族連携の仕上げ(family-links/plan.md)を RLS 配下で検証する。
// 見たいのは2点:
//   (a) 整合: 同じ子に連携した2人の保護者に、提出・月謝・お知らせ・名簿が同じに見える
//   (b) 解除: 自分の連携だけを解除できる。最後の保護者は解除できない(孤児化を防ぐ)
// 接続・リセット方式は children.int.test.ts と同じ

const SESSION_SECRET = "9".repeat(64);
const USER_A = `U${"a".repeat(32)}`;
const USER_B = `U${"b".repeat(32)}`;
const MONTH = "2099-05";
const FEE_YEAR = 2099;
const FEE_MONTH = 5;

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let practiceId: string;
let coachHash: string;

const api = (team = teamId) =>
  createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId: team,
    sessionSecret: SESSION_SECRET,
    encryptionKey: "1".repeat(64),
    hmacKey: "2".repeat(64),
    secureCookie: false,
  });

const adminApi = (team = teamId) =>
  createAdminApi({
    teamId: team,
    sessionSecret: SESSION_SECRET,
    secureCookie: false,
  });

function cookieOf(res: Response, name: string): string {
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${name}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error(`${name} Cookie が発行されていません`);
  return `${name}=${value}`;
}

type Call = (
  path: string,
  method?: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
) => Promise<Response>;

function client(
  app: ReturnType<typeof api> | ReturnType<typeof adminApi>,
  cookie: string,
): Call {
  return async (path, method = "GET", body) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function guardianClient(
  app: ReturnType<typeof api>,
  userId: string,
): Promise<Call> {
  const res = await app.request("/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: `fake:${userId}` }),
  });
  return client(app, cookieOf(res, SESSION_COOKIE_NAME));
}

async function coachClient(app: ReturnType<typeof adminApi>): Promise<Call> {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "coach@example.com",
      password: "coach-pass-1",
    }),
  });
  return client(app, cookieOf(res, ADMIN_SESSION_COOKIE_NAME));
}

const registration = {
  children: [
    { name: "粉浜 太郎", nicknameKana: "たろう", grade: 4, gender: "male" },
  ],
  relation: "father",
  weekdays: [0, 6],
  startTime: "09:00",
  endTime: "12:00",
  coachNote: "ぜん息あり",
};

/** 保護者Aが子を1人登録し、保護者Bが招待コードで連携した状態を作る */
async function registerAndLink(a: Call, b: Call) {
  const res = await a("/children", "POST", registration);
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    children: { id: string; inviteCode: string }[];
  };
  const child = body.children[0];
  if (!child) throw new Error("登録に失敗しました");
  const linked = await b("/family-links", "POST", {
    code: child.inviteCode,
    relation: "mother",
  });
  expect(linked.status).toBe(201);
  return child;
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
  if (!a || !b) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash})`;
  const [practice] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${teamId}, '2099-05-02', '09:00', '12:00', '粉浜小') RETURNING id`;
  practiceId = practice?.id as string;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("家族間の整合", () => {
  it("父の提出・コーチの済ハンコ・お知らせ・名簿が母にも同じに見える", async () => {
    const app = api();
    const a = await guardianClient(app, USER_A);
    const b = await guardianClient(app, USER_B);
    const child = await registerAndLink(a, b);

    // 父が参加予定を提出する
    const submitted = await a("/attendance", "PUT", {
      childId: child.id,
      answers: [
        {
          practiceId,
          status: "partial",
          comment: "10時から参加します",
        },
      ],
    });
    expect(submitted.status).toBe(200);

    // コーチが月謝に済ハンコを押す
    const coach = await coachClient(adminApi());
    const paid = await coach("/fee-records", "PUT", {
      childId: child.id,
      year: FEE_YEAR,
      month: FEE_MONTH,
      status: "paid",
    });
    expect(paid.status).toBe(200);

    // 公開済みのお知らせ
    await owner`INSERT INTO announcements (team_id, title, body, published_at)
      VALUES (${teamId}, '体育館の駐車場について', '路上駐車はしないでください',
        '2024-07-21T09:00:00+09:00')`;

    // 子ども単位のデータなので、どちらの保護者から見ても同じ内容になる
    for (const path of [
      `/attendance?month=${MONTH}`,
      `/attendance/summary?month=${MONTH}`,
      `/fees?year=${FEE_YEAR}`,
      "/announcements",
      "/children",
    ]) {
      const forA = await a(path);
      const forB = await b(path);
      expect(forA.status).toBe(200);
      expect(forB.status).toBe(200);
      expect(await forB.json()).toEqual(await forA.json());
    }

    // 家族の設定だけは「あなた」の位置(isMe)が違う。顔ぶれ(続柄)は同じ
    type Family = {
      children: { guardians: { relation: string; isMe: boolean }[] }[];
    };
    const familyA = (await (await a("/family")).json()) as Family;
    const familyB = (await (await b("/family")).json()) as Family;
    expect(familyA.children[0]?.guardians.map((g) => g.relation)).toEqual([
      "father",
      "mother",
    ]);
    expect(familyB.children[0]?.guardians.map((g) => g.relation)).toEqual([
      "father",
      "mother",
    ]);
    expect(familyA.children[0]?.guardians.map((g) => g.isMe)).toEqual([
      true,
      false,
    ]);
    expect(familyB.children[0]?.guardians.map((g) => g.isMe)).toEqual([
      false,
      true,
    ]);

    // 中身も確認する(空同士が一致しただけ、を防ぐ)
    const sheet = (await (await b(`/attendance?month=${MONTH}`)).json()) as {
      children: { id: string; name: string }[];
      answers: Record<
        string,
        Record<string, { status: string; comment: string | null }>
      >;
    };
    expect(sheet.children.map((c) => c.name)).toEqual(["粉浜 太郎"]);
    expect(sheet.answers[child.id]?.[practiceId]).toEqual({
      status: "partial",
      comment: "10時から参加します",
    });

    const fees = (await (await b(`/fees?year=${FEE_YEAR}`)).json()) as {
      children: { months: { month: number; state: string }[] }[];
    };
    expect(
      fees.children[0]?.months.find((m) => m.month === FEE_MONTH)?.state,
    ).toBe("paid");

    const news = (await (await b("/announcements")).json()) as {
      announcements: { title: string }[];
    };
    expect(news.announcements.map((n) => n.title)).toEqual([
      "体育館の駐車場について",
    ]);

    // 母からも同じ子に提出でき、父の画面にもそのまま反映される
    const byMother = await b("/attendance", "PUT", {
      childId: child.id,
      answers: [{ practiceId, status: "absent", comment: null }],
    });
    expect(byMother.status).toBe(200);
    const afterA = (await (await a(`/attendance?month=${MONTH}`)).json()) as {
      answers: Record<string, Record<string, { status: string }>>;
    };
    expect(afterA.answers[child.id]?.[practiceId]?.status).toBe("absent");
  });
});

describe("連携の解除(DELETE /family-links/:childId)", () => {
  it("未ログインは 401", async () => {
    const res = await api().request(
      "/family-links/00000000-0000-4000-8000-000000000000",
      { method: "DELETE" },
    );
    expect(res.status).toBe(401);
  });

  it("第二保護者は解除でき、登録した保護者には引き続き見える", async () => {
    const app = api();
    const a = await guardianClient(app, USER_A);
    const b = await guardianClient(app, USER_B);
    const child = await registerAndLink(a, b);

    const res = await b(`/family-links/${child.id}`, "DELETE");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    expect(
      ((await (await b("/children")).json()) as { children: unknown[] })
        .children,
    ).toEqual([]);
    expect(
      (
        (await (await a("/children")).json()) as {
          children: { name: string }[];
        }
      ).children,
    ).toEqual([expect.objectContaining({ name: "粉浜 太郎" })]);

    // 無効化(revoked)ではなく物理削除なので、家族の設定にも残らない
    const family = (await (await a("/family")).json()) as {
      children: { guardians: unknown[] }[];
    };
    expect(family.children[0]?.guardians).toHaveLength(1);
    const rows = await owner`
      SELECT count(*)::int AS n FROM guardian_children WHERE child_id = ${child.id}`;
    expect(rows[0]?.n).toBe(1);

    // 招待コードで連携し直せる
    const relinked = await b("/family-links", "POST", {
      code: child.inviteCode,
      relation: "mother",
    });
    expect(relinked.status).toBe(201);
    expect(
      (
        (await (await b("/children")).json()) as {
          children: { name: string }[];
        }
      ).children,
    ).toHaveLength(1);
  });

  it("最後の保護者は解除できない(409)", async () => {
    const app = api();
    const a = await guardianClient(app, USER_A);
    const b = await guardianClient(app, USER_B);
    const child = await registerAndLink(a, b);

    // 2人いるうちは父も解除できる。1人になったら解除できない
    expect((await b(`/family-links/${child.id}`, "DELETE")).status).toBe(204);
    const res = await a(`/family-links/${child.id}`, "DELETE");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain(
      "最後の保護者",
    );
    expect(
      ((await (await a("/children")).json()) as { children: unknown[] })
        .children,
    ).toHaveLength(1);
  });

  it("連携していない子・無効化済みの連携・不正な id は 404", async () => {
    const app = api();
    const a = await guardianClient(app, USER_A);
    const b = await guardianClient(app, USER_B);
    const child = await registerAndLink(a, b);

    // 自分が連携していない子(存在は漏らさない)
    const [outsider] = await owner`
      INSERT INTO children (team_id, name, grade, gender, invite_code)
      VALUES (${teamId}, '別家庭 次郎', 5, 'male', 'OUTSD00001') RETURNING id`;
    const res = await b(`/family-links/${outsider?.id as string}`, "DELETE");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain(
      "連携が見つかりません",
    );

    // UUID でない id
    expect((await b("/family-links/not-a-uuid", "DELETE")).status).toBe(404);
    // 存在しない UUID
    expect(
      (await b("/family-links/00000000-0000-4000-8000-000000000000", "DELETE"))
        .status,
    ).toBe(404);

    // コーチに無効化された連携は、すでに見えないので解除もできない
    await owner`UPDATE guardian_children SET status = 'revoked'
      WHERE child_id = ${child.id} AND guardian_id <> (
        SELECT guardian_id FROM guardian_children
        WHERE child_id = ${child.id} AND relation = 'father')`;
    expect((await b(`/family-links/${child.id}`, "DELETE")).status).toBe(404);
  });

  it("他チームの保護者は同じ子を解除できない(RLS)", async () => {
    const app = api();
    const a = await guardianClient(app, USER_A);
    const b = await guardianClient(app, USER_B);
    const child = await registerAndLink(a, b);

    const other = api(otherTeamId);
    const o = await guardianClient(other, `U${"c".repeat(32)}`);
    expect((await o(`/family-links/${child.id}`, "DELETE")).status).toBe(404);
    const rows = await owner`
      SELECT count(*)::int AS n FROM guardian_children WHERE child_id = ${child.id}`;
    expect(rows[0]?.n).toBe(2);
  });
});
