import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertLocalDatabaseUrl, requireEnv, toHostUrl } from "./env";
import { generateInviteCode } from "./invite-code";
import * as schema from "./schema";

// 開発用シード(ローカル専用・全消し→投入)。
// 2チーム構成にするのは RLS 越境テスト・画面での見え方確認を実データで行うため(plan.md 設計判断14)。
// stg / prod へは投入しない。PR-B で withTeam(RLS 配下)経由に切り替える。

const url = toHostUrl(requireEnv("DATABASE_URL"));
assertLocalDatabaseUrl(url);

const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client, { schema });

// line_user_id は暗号文しか保存しない(平文形式は CHECK 制約で拒否される)。
// 開発用シードはダミーの暗号文表現を入れる
const dummyEncrypted = (n: number) =>
  `dev:enc:${n.toString().padStart(4, "0")}`;
const dummyLookup = (n: number) => n.toString(16).padStart(64, "0");

console.log(`シードを投入します: ${new URL(url).hostname}`);

await db.execute(sql`
  TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
    practices, practice_menus, attendances, fee_records, announcements, lineups
    RESTART IDENTITY CASCADE
`);

// ---- チーム1: SKC粉浜(開発のメイン) ----
const [skc] = await db
  .insert(schema.teams)
  .values({
    name: "SKC粉浜・北粉浜ミニバスケットボール",
    shortName: "SKC粉浜",
    teamColor: "#F97316",
  })
  .returning();
if (!skc) throw new Error("チーム1の作成に失敗しました");

await db.insert(schema.coaches).values({
  teamId: skc.id,
  email: "coach@example.com",
  authType: "email",
});

const skcChildren = await db
  .insert(schema.children)
  .values(
    [
      { name: "粉浜 太郎", nicknameKana: "たろう", grade: 6, gender: "male" },
      {
        name: "粉浜 花子",
        nicknameKana: "はなちゃん",
        grade: 4,
        gender: "female",
      },
      { name: "北粉浜 次郎", nicknameKana: "じろう", grade: 2, gender: "male" },
    ].map((c) => ({ ...c, teamId: skc.id, inviteCode: generateInviteCode() })),
  )
  .returning();

const skcGuardians = await db
  .insert(schema.guardians)
  .values(
    [1, 2].map((n) => ({
      teamId: skc.id,
      lineUserId: dummyEncrypted(n),
      lineUserIdLookup: dummyLookup(n),
    })),
  )
  .returning();

const [g1, g2] = skcGuardians;
const [c1, c2, c3] = skcChildren;
if (!g1 || !g2 || !c1 || !c2 || !c3)
  throw new Error("チーム1のシードに失敗しました");

await db.insert(schema.guardianChildren).values([
  { teamId: skc.id, guardianId: g1.id, childId: c1.id, relation: "father" },
  { teamId: skc.id, guardianId: g1.id, childId: c2.id, relation: "father" },
  { teamId: skc.id, guardianId: g2.id, childId: c3.id, relation: "mother" },
]);

await db.insert(schema.childAvailabilities).values([
  {
    teamId: skc.id,
    childId: c1.id,
    weekday: 6,
    startTime: "09:00",
    endTime: "12:00",
  },
  {
    teamId: skc.id,
    childId: c2.id,
    weekday: 0,
    startTime: "13:00",
    endTime: "17:00",
  },
]);

const skcPractices = await db
  .insert(schema.practices)
  .values([
    {
      teamId: skc.id,
      heldOn: "2026-09-05",
      startTime: "09:00",
      endTime: "12:00",
      location: "粉浜小学校 体育館",
    },
    {
      teamId: skc.id,
      heldOn: "2026-09-06",
      startTime: "13:00",
      endTime: "17:00",
      location: "北粉浜小学校 体育館",
      note: "練習試合",
    },
  ])
  .returning();
const [p1, p2] = skcPractices;
if (!p1 || !p2) throw new Error("チーム1の練習シードに失敗しました");

await db.insert(schema.practiceMenus).values([
  {
    teamId: skc.id,
    practiceId: p1.id,
    durationMin: 30,
    content: "アップ・ドリブル",
    sort: 0,
  },
  {
    teamId: skc.id,
    practiceId: p1.id,
    durationMin: 60,
    content: "シュート練習",
    sort: 1,
  },
]);

await db.insert(schema.attendances).values([
  { teamId: skc.id, childId: c1.id, practiceId: p1.id, status: "full" },
  {
    teamId: skc.id,
    childId: c2.id,
    practiceId: p1.id,
    status: "partial",
    comment: "30分遅れて参加",
  },
  { teamId: skc.id, childId: c3.id, practiceId: p1.id, status: "absent" },
]);

await db.insert(schema.feeRecords).values([
  {
    teamId: skc.id,
    childId: c1.id,
    year: 2026,
    month: 8,
    status: "paid",
    receivedAt: new Date(),
  },
  { teamId: skc.id, childId: c1.id, year: 2026, month: 9 },
  { teamId: skc.id, childId: c2.id, year: 2026, month: 8 },
]);

await db.insert(schema.announcements).values({
  teamId: skc.id,
  title: "9月の予定表を発行しました",
  body: "9月の練習予定を掲載しました。参加予定の提出をお願いします。",
  notifyLine: false,
  publishedAt: new Date(),
});

await db.insert(schema.lineups).values([
  {
    teamId: skc.id,
    practiceId: p2.id,
    childId: c1.id,
    role: "starter",
    position: "PG",
  },
  { teamId: skc.id, practiceId: p2.id, childId: c2.id, role: "bench" },
]);

// ---- チーム2: 越境検証用のダミーチーム ----
const [other] = await db
  .insert(schema.teams)
  .values({ name: "テスト東ミニバス", shortName: "テスト東" })
  .returning();
if (!other) throw new Error("チーム2の作成に失敗しました");

const [oc] = await db
  .insert(schema.children)
  .values({
    teamId: other.id,
    name: "東 三郎",
    grade: 5,
    gender: "male",
    inviteCode: generateInviteCode(),
  })
  .returning();
if (!oc) throw new Error("チーム2の部員シードに失敗しました");

const [og] = await db
  .insert(schema.guardians)
  .values({
    teamId: other.id,
    lineUserId: dummyEncrypted(100),
    lineUserIdLookup: dummyLookup(100),
  })
  .returning();
if (!og) throw new Error("チーム2の保護者シードに失敗しました");

await db.insert(schema.guardianChildren).values({
  teamId: other.id,
  guardianId: og.id,
  childId: oc.id,
  relation: "mother",
});

await db.insert(schema.practices).values({
  teamId: other.id,
  heldOn: "2026-09-05",
  startTime: "09:00",
  endTime: "12:00",
  location: "東小学校 体育館",
});

await client.end();
console.log("完了しました(2チーム分)");
