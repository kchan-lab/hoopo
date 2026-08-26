import postgres from "postgres";
import { closeAppDb, withTeam } from "./client";
import { assertLocalDatabaseUrl, requireEnv, toHostUrl } from "./env";
import { generateInviteCode } from "./invite-code";
import { ensureLocalAppRole, LOCAL_APP_DATABASE_URL } from "./local-role";
import * as schema from "./schema";

// 開発用シード(ローカル専用・全消し→投入)。
// - チーム行の作成と全消しは所有者接続で行う(チーム作成は運用オペレーションの責務で、
//   hoopo_app には teams への INSERT 権限がない)
// - チーム内のデータは withTeam(RLS 配下)で投入する。投入できること自体が
//   ポリシーの WITH CHECK が正しく通っている検証を兼ねる(plan.md 設計判断14)
// - 2チーム構成にするのは RLS 越境の実データ検証と画面確認のため。stg / prod へは投入しない

const ownerUrl = toHostUrl(requireEnv("DATABASE_URL"));
assertLocalDatabaseUrl(ownerUrl);

// アプリ接続(RLS 配下)。ローカル専用スクリプトなので未設定時は既定値で補う
process.env.APP_DATABASE_URL = toHostUrl(
  process.env.APP_DATABASE_URL ?? LOCAL_APP_DATABASE_URL,
);
assertLocalDatabaseUrl(process.env.APP_DATABASE_URL);

const owner = postgres(ownerUrl, { max: 1, prepare: false });

// line_user_id は暗号文しか保存しない(平文形式は CHECK 制約で拒否される)。
// 開発用シードはダミーの暗号文表現を入れる
const dummyEncrypted = (n: number) =>
  `dev:enc:${n.toString().padStart(4, "0")}`;
const dummyLookup = (n: number) => n.toString(16).padStart(64, "0");

console.log(`シードを投入します: ${new URL(ownerUrl).hostname}`);

await ensureLocalAppRole(owner);

await owner`
  TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
    practices, practice_menus, attendances, fee_records, announcements, lineups
    RESTART IDENTITY CASCADE
`;

// SKC の id は固定にする — ローカルの TEAM_ID env(LIFF ログインのテナント解決。
// .claude/plans/liff-login/plan.md 設計判断4)と一致させて E2E を安定させるため
const SKC_TEAM_ID = "00000000-0000-4000-8000-000000000001";
const [skcRow] = await owner`
  INSERT INTO teams (id, name, short_name, team_color)
  VALUES (${SKC_TEAM_ID}, 'SKC粉浜・北粉浜ミニバスケットボール', 'SKC粉浜', '#F97316')
  RETURNING id
`;
const [otherRow] = await owner`
  INSERT INTO teams (name, short_name)
  VALUES ('テスト東ミニバス', 'テスト東')
  RETURNING id
`;
if (!skcRow || !otherRow) throw new Error("チームの作成に失敗しました");
const skcId: string = skcRow.id;
const otherId: string = otherRow.id;

// ---- チーム1: SKC粉浜(開発のメイン)。RLS 配下で投入 ----
await withTeam(skcId, async (tx) => {
  await tx.insert(schema.coaches).values({
    teamId: skcId,
    email: "coach@example.com",
    authType: "email",
  });

  const skcChildren = await tx
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
        {
          name: "北粉浜 次郎",
          nicknameKana: "じろう",
          grade: 2,
          gender: "male",
        },
      ].map((c) => ({ ...c, teamId: skcId, inviteCode: generateInviteCode() })),
    )
    .returning();

  const skcGuardians = await tx
    .insert(schema.guardians)
    .values(
      [1, 2].map((n) => ({
        teamId: skcId,
        lineUserId: dummyEncrypted(n),
        lineUserIdLookup: dummyLookup(n),
      })),
    )
    .returning();

  const [g1, g2] = skcGuardians;
  const [c1, c2, c3] = skcChildren;
  if (!g1 || !g2 || !c1 || !c2 || !c3)
    throw new Error("チーム1のシードに失敗しました");

  await tx.insert(schema.guardianChildren).values([
    { teamId: skcId, guardianId: g1.id, childId: c1.id, relation: "father" },
    { teamId: skcId, guardianId: g1.id, childId: c2.id, relation: "father" },
    { teamId: skcId, guardianId: g2.id, childId: c3.id, relation: "mother" },
  ]);

  await tx.insert(schema.childAvailabilities).values([
    {
      teamId: skcId,
      childId: c1.id,
      weekday: 6,
      startTime: "09:00",
      endTime: "12:00",
    },
    {
      teamId: skcId,
      childId: c2.id,
      weekday: 0,
      startTime: "13:00",
      endTime: "17:00",
    },
  ]);

  const skcPractices = await tx
    .insert(schema.practices)
    .values([
      {
        teamId: skcId,
        heldOn: "2026-09-05",
        startTime: "09:00",
        endTime: "12:00",
        location: "粉浜小学校 体育館",
      },
      {
        teamId: skcId,
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

  await tx.insert(schema.practiceMenus).values([
    {
      teamId: skcId,
      practiceId: p1.id,
      durationMin: 30,
      content: "アップ・ドリブル",
      sort: 0,
    },
    {
      teamId: skcId,
      practiceId: p1.id,
      durationMin: 60,
      content: "シュート練習",
      sort: 1,
    },
  ]);

  await tx.insert(schema.attendances).values([
    { teamId: skcId, childId: c1.id, practiceId: p1.id, status: "full" },
    {
      teamId: skcId,
      childId: c2.id,
      practiceId: p1.id,
      status: "partial",
      comment: "30分遅れて参加",
    },
    { teamId: skcId, childId: c3.id, practiceId: p1.id, status: "absent" },
  ]);

  await tx.insert(schema.feeRecords).values([
    {
      teamId: skcId,
      childId: c1.id,
      year: 2026,
      month: 8,
      status: "paid",
      receivedAt: new Date(),
    },
    { teamId: skcId, childId: c1.id, year: 2026, month: 9 },
    { teamId: skcId, childId: c2.id, year: 2026, month: 8 },
  ]);

  await tx.insert(schema.announcements).values({
    teamId: skcId,
    title: "9月の予定表を発行しました",
    body: "9月の練習予定を掲載しました。参加予定の提出をお願いします。",
    notifyLine: false,
    publishedAt: new Date(),
  });

  await tx.insert(schema.lineups).values([
    {
      teamId: skcId,
      practiceId: p2.id,
      childId: c1.id,
      role: "starter",
      position: "PG",
    },
    { teamId: skcId, practiceId: p2.id, childId: c2.id, role: "bench" },
  ]);
});

// ---- チーム2: 越境検証用のダミーチーム。RLS 配下で投入 ----
await withTeam(otherId, async (tx) => {
  const [oc] = await tx
    .insert(schema.children)
    .values({
      teamId: otherId,
      name: "東 三郎",
      grade: 5,
      gender: "male",
      inviteCode: generateInviteCode(),
    })
    .returning();
  if (!oc) throw new Error("チーム2の部員シードに失敗しました");

  const [og] = await tx
    .insert(schema.guardians)
    .values({
      teamId: otherId,
      lineUserId: dummyEncrypted(100),
      lineUserIdLookup: dummyLookup(100),
    })
    .returning();
  if (!og) throw new Error("チーム2の保護者シードに失敗しました");

  await tx.insert(schema.guardianChildren).values({
    teamId: otherId,
    guardianId: og.id,
    childId: oc.id,
    relation: "mother",
  });

  await tx.insert(schema.practices).values({
    teamId: otherId,
    heldOn: "2026-09-05",
    startTime: "09:00",
    endTime: "12:00",
    location: "東小学校 体育館",
  });
});

// RLS 配下で投入できたこと自体が WITH CHECK の通過検証になっている
await owner.end();
await closeAppDb();
console.log("完了しました(2チーム分・RLS配下で投入)");
