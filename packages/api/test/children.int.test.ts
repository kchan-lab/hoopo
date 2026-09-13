import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";
import {
  birthDateForGrade,
  schoolYearOf,
  todayTokyo,
} from "../src/grade-shared";
import { SESSION_COOKIE_NAME } from "../src/session";

// 子ども登録・家族連携 API を RLS 配下で検証する(child-registration/plan.md)。
// 接続・リセット方式は auth.int.test.ts と同じ

const ENC_KEY = "1".repeat(64);
const HMAC_KEY = "2".repeat(64);
const SESSION_SECRET = "3".repeat(64);
const USER_A = `U${"a".repeat(32)}`;
const USER_B = `U${"b".repeat(32)}`;

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;

function api(team = teamId) {
  return createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId: team,
    sessionSecret: SESSION_SECRET,
    encryptionKey: ENC_KEY,
    hmacKey: HMAC_KEY,
    secureCookie: false,
    lineChannelSecret: null,
  });
}

async function loginAs(app: ReturnType<typeof api>, userId: string) {
  const res = await app.request("/auth/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: `fake:${userId}` }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("セッション Cookie が発行されていません");
  return `${SESSION_COOKIE_NAME}=${value}`;
}

function json(app: ReturnType<typeof api>, cookie: string) {
  return (path: string, method: "GET" | "POST" | "PATCH", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const registration = {
  children: [
    {
      name: "粉浜 太郎",
      nicknameKana: "たろう",
      birthDate: birthDateForGrade(4),
      heightCm: 135,
      gender: "male",
    },
    {
      name: "粉浜 花子",
      nicknameKana: null,
      birthDate: birthDateForGrade(2),
      heightCm: 120,
      gender: "female",
    },
  ],
  relation: "father",
  weekdays: [0, 6],
  startTime: "09:00",
  endTime: "12:00",
  coachNote: "ぜん息あり",
};

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
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("子ども登録(POST /children)", () => {
  it("未ログインは 401", async () => {
    const res = await api().request("/children");
    expect(res.status).toBe(401);
  });

  it("兄弟2人を登録すると自動認定され、参加情報・続柄・伝達事項が保存される", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    expect(
      (
        (await (await call("/children", "GET")).json()) as {
          children: unknown[];
        }
      ).children,
    ).toEqual([]);

    const res = await call("/children", "POST", registration);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      children: { id: string; name: string; inviteCode: string }[];
    };
    expect(body.children.map((c) => c.name)).toEqual([
      "粉浜 太郎",
      "粉浜 花子",
    ]);
    for (const c of body.children)
      expect(c.inviteCode).toMatch(/^[0-9A-Z]{10}$/);

    const list = (await (await call("/children", "GET")).json()) as {
      children: { name: string; grade: number }[];
    };
    expect(list.children.map((c) => [c.name, c.grade])).toEqual([
      ["粉浜 太郎", 4],
      ["粉浜 花子", 2],
    ]);

    const rows = await owner`
      SELECT c.status, c.coach_note, gc.relation, gc.status AS link_status,
        (SELECT count(*) FROM child_availabilities a WHERE a.child_id = c.id)::int AS slots
      FROM children c JOIN guardian_children gc ON gc.child_id = c.id ORDER BY c.created_at`;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.status).toBe("active");
      expect(r.link_status).toBe("active");
      expect(r.relation).toBe("father");
      expect(r.coach_note).toBe("ぜん息あり");
      expect(r.slots).toBe(2);
    }
  });

  it("保持する列は §3 の項目のみ(電話番号・住所などの列が存在しない)", async () => {
    const cols = await owner`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'children'`;
    const names = cols.map((c) => c.column_name as string);
    for (const forbidden of [
      "phone",
      "address",
      "birthday",
      "email",
      "display_name",
    ]) {
      expect(names.some((n) => n.includes(forbidden))).toBe(false);
    }
  });

  it("生年月日・身長を保存し、学年は生年月日から算出する(4/1 と 4/2 で分かれる)", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    // 4年生になる学齢の年度。同じ年の 4/2 生まれは4年、4/1 生まれは5年になる
    const birthYear = (schoolYearOf(todayTokyo()) as number) - 4 - 6;
    const res = await call("/children", "POST", {
      ...registration,
      children: [
        {
          name: "4月2日生まれ",
          nicknameKana: null,
          birthDate: `${birthYear}-04-02`,
          heightCm: 138,
          gender: "male",
        },
        {
          name: "4月1日生まれ",
          nicknameKana: null,
          birthDate: `${birthYear}-04-01`,
          heightCm: 142,
          gender: "female",
        },
      ],
    });
    expect(res.status).toBe(201);
    const rows = await owner`
      SELECT name, grade, birth_date::text AS birth_date, height_cm
      FROM children ORDER BY name`;
    expect(
      rows.map((r) => [r.name, r.grade, r.birth_date, r.height_cm]),
    ).toEqual([
      ["4月1日生まれ", 5, `${birthYear}-04-01`, 142],
      ["4月2日生まれ", 4, `${birthYear}-04-02`, 138],
    ]);
  });

  it("小学生にならない生年月日は 400", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const res = await call("/children", "POST", {
      ...registration,
      children: [
        {
          name: "まだ入学前",
          nicknameKana: null,
          birthDate: birthDateForGrade(0),
          heightCm: 110,
          gender: "male",
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("小学生");
  });

  it("入力不正は 400 で理由を返す", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const res = await call("/children", "POST", {
      ...registration,
      weekdays: [],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("曜日");
  });
});

describe("子ども情報の編集(PATCH /children/:id)", () => {
  it("身長を直せて、生年月日を直すと学年が再計算される", async () => {
    const app = api();
    const call = json(app, await loginAs(app, USER_A));
    const created = (await (
      await call("/children", "POST", registration)
    ).json()) as { children: { id: string }[] };
    const childId = created.children[0]?.id ?? "";

    const height = await call(`/children/${childId}`, "PATCH", {
      heightCm: 141,
    });
    expect(height.status).toBe(200);
    expect(
      ((await height.json()) as { child: { heightCm: number } }).child,
    ).toMatchObject({ grade: 4, heightCm: 141 });

    const moved = await call(`/children/${childId}`, "PATCH", {
      birthDate: birthDateForGrade(6),
    });
    expect(moved.status).toBe(200);
    expect(
      ((await moved.json()) as { child: { grade: number } }).child.grade,
    ).toBe(6);
    const rows = await owner`
      SELECT grade, birth_date::text AS birth_date, height_cm
      FROM children WHERE id = ${childId}`;
    expect(rows[0]?.grade).toBe(6);
    expect(rows[0]?.birth_date).toBe(birthDateForGrade(6));
    expect(rows[0]?.height_cm).toBe(141);

    // 家族の設定にも生年月日・身長が出る
    const family = (await (await call("/family", "GET")).json()) as {
      children: {
        id: string;
        grade: number;
        birthDate: string | null;
        heightCm: number | null;
      }[];
    };
    expect(family.children.find((c) => c.id === childId)).toMatchObject({
      grade: 6,
      birthDate: birthDateForGrade(6),
      heightCm: 141,
    });
  });

  it("入力不正は 400、連携していない子は 404", async () => {
    const app = api();
    const a = json(app, await loginAs(app, USER_A));
    const b = json(app, await loginAs(app, USER_B));
    const created = (await (
      await a("/children", "POST", registration)
    ).json()) as { children: { id: string }[] };
    const childId = created.children[0]?.id ?? "";

    const bad = await a(`/children/${childId}`, "PATCH", { heightCm: 300 });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toContain("身長");

    // 連携していない保護者からは見えない(存在も漏らさない)
    expect(
      (await b(`/children/${childId}`, "PATCH", { heightCm: 141 })).status,
    ).toBe(404);
    expect(
      (
        await a("/children/00000000-0000-4000-8000-000000000099", "PATCH", {
          heightCm: 141,
        })
      ).status,
    ).toBe(404);
  });
});

describe("家族連携(POST /family-links)と家族の設定(GET /family)", () => {
  it("第二保護者が招待コードで連携でき、両者から同じ子が見える", async () => {
    const app = api();
    const a = json(app, await loginAs(app, USER_A));
    const b = json(app, await loginAs(app, USER_B));
    const created = (await (
      await a("/children", "POST", registration)
    ).json()) as {
      children: { id: string; inviteCode: string }[];
    };
    const code = created.children[0]?.inviteCode ?? "";

    // 小文字・ハイフン入りでも受理される
    const linked = await b("/family-links", "POST", {
      code: `${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`,
      relation: "mother",
    });
    expect(linked.status).toBe(201);
    expect(
      ((await linked.json()) as { child: { name: string } }).child.name,
    ).toBe("粉浜 太郎");

    // 2回目は冪等(200・alreadyLinked)
    const again = await b("/family-links", "POST", {
      code,
      relation: "mother",
    });
    expect(again.status).toBe(200);
    expect(
      ((await again.json()) as { alreadyLinked: boolean }).alreadyLinked,
    ).toBe(true);

    const bList = (await (await b("/children", "GET")).json()) as {
      children: { name: string }[];
    };
    expect(bList.children.map((c) => c.name)).toEqual(["粉浜 太郎"]);

    const family = (await (await a("/family", "GET")).json()) as {
      children: {
        name: string;
        inviteCode: string;
        guardians: { relation: string; isMe: boolean }[];
      }[];
    };
    expect(family.children[0]?.inviteCode).toBe(
      `${code.slice(0, 5)}-${code.slice(5)}`,
    );
    expect(family.children[0]?.guardians).toEqual([
      {
        guardianId: expect.any(String),
        relation: "father",
        isMe: true,
        linkedAt: expect.any(String),
      },
      {
        guardianId: expect.any(String),
        relation: "mother",
        isMe: false,
        linkedAt: expect.any(String),
      },
    ]);

    // 連携済みで別の続柄を入力すると続柄が更新される(修正導線の代替)
    const fixed = await b("/family-links", "POST", {
      code,
      relation: "grandparent",
    });
    expect(fixed.status).toBe(200);
    const relations = await owner`
      SELECT relation FROM guardian_children WHERE child_id = ${created.children[0]?.id ?? ""} ORDER BY created_at`;
    expect(relations.map((r) => r.relation)).toEqual(["father", "grandparent"]);
    expect(family.children[1]?.guardians).toHaveLength(1);
  });

  it("存在しないコード・他チームのコード・無効化された子は連携できない", async () => {
    const app = api();
    const b = json(app, await loginAs(app, USER_B));
    expect(
      (
        await b("/family-links", "POST", {
          code: "ZZZZZ99999",
          relation: "mother",
        })
      ).status,
    ).toBe(404);

    await owner`INSERT INTO children (team_id, name, grade, gender, invite_code)
      VALUES (${otherTeamId}, '他チームの子', 3, 'male', 'XTEAM00001')`;
    expect(
      (
        await b("/family-links", "POST", {
          code: "XTEAM00001",
          relation: "mother",
        })
      ).status,
    ).toBe(404);

    await owner`INSERT INTO children (team_id, name, grade, gender, invite_code, status)
      VALUES (${teamId}, '無効化された子', 3, 'male', 'REV0K00001', 'revoked')`;
    expect(
      (
        await b("/family-links", "POST", {
          code: "REV0K00001",
          relation: "mother",
        })
      ).status,
    ).toBe(403);
  });

  it("連携が無効化(revoked)されると、その保護者からは子が見えなくなる", async () => {
    const app = api();
    const a = json(app, await loginAs(app, USER_A));
    const b = json(app, await loginAs(app, USER_B));
    const created = (await (
      await a("/children", "POST", registration)
    ).json()) as {
      children: { id: string; inviteCode: string }[];
    };
    const child = created.children[0];
    if (!child) throw new Error("登録に失敗");
    await b("/family-links", "POST", {
      code: child.inviteCode,
      relation: "mother",
    });
    await owner`UPDATE guardian_children SET status = 'revoked'
      WHERE child_id = ${child.id} AND relation = 'mother'`;

    const bList = (await (await b("/children", "GET")).json()) as {
      children: unknown[];
    };
    expect(bList.children).toEqual([]);
    // 無効化済みの連携でコードを再入力しても復活しない
    expect(
      (
        await b("/family-links", "POST", {
          code: child.inviteCode,
          relation: "mother",
        })
      ).status,
    ).toBe(403);
    // 登録した保護者(A)からは引き続き見え、家族一覧に revoked は出ない
    const family = (await (await a("/family", "GET")).json()) as {
      children: { guardians: unknown[] }[];
    };
    expect(family.children[0]?.guardians).toHaveLength(1);
  });

  it("他チームの保護者からは登録した子が見えない(RLS)", async () => {
    const app = api();
    const a = json(app, await loginAs(app, USER_A));
    await a("/children", "POST", registration);
    const other = api(otherTeamId);
    const o = json(other, await loginAs(other, USER_B));
    const list = (await (await o("/children", "GET")).json()) as {
      children: unknown[];
    };
    expect(list.children).toEqual([]);
    const count =
      await owner`SELECT count(*)::int AS n FROM children WHERE team_id = ${teamId}`;
    expect(count[0]?.n).toBe(2);
  });
});
