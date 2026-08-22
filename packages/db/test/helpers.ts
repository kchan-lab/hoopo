import postgres from "postgres";

// Integration テスト用の接続とフィクスチャ。
// - owner(DATABASE_URL): フィクスチャ投入・カタログ検査用。BYPASSRLS/superuser 前提
// - app(APP_DATABASE_URL): RLS が効くアプリロール。検証対象
// - フィクスチャは開発用シード(pnpm db:seed)に依存せず、テストが自前で作る
//   (シードは UI 確認用に増減するため。plan.md 設計判断11)

export function ownerClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL が未設定です");
  return postgres(url, { max: 1, prepare: false });
}

export function appClient(): postgres.Sql {
  const url = process.env.APP_DATABASE_URL;
  if (!url) throw new Error("APP_DATABASE_URL が未設定です");
  return postgres(url, { max: 1, prepare: false });
}

export interface TwoTeamsFixture {
  teamA: string;
  teamB: string;
  childA: string;
  childB: string;
  practiceA: string;
  practiceB: string;
  guardianA: string;
}

export async function resetAndSeedTwoTeams(
  owner: postgres.Sql,
): Promise<TwoTeamsFixture> {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups
      RESTART IDENTITY CASCADE
  `;
  const [a] =
    await owner`INSERT INTO teams (name) VALUES ('チームA') RETURNING id`;
  const [b] =
    await owner`INSERT INTO teams (name) VALUES ('チームB') RETURNING id`;
  if (!a || !b) throw new Error("チームの作成に失敗しました");

  const [childA] = await owner`
    INSERT INTO children (team_id, name, grade, gender, invite_code)
    VALUES (${a.id}, 'A子', 3, 'female', 'CODEA00001') RETURNING id`;
  const [childB] = await owner`
    INSERT INTO children (team_id, name, grade, gender, invite_code)
    VALUES (${b.id}, 'B男', 4, 'male', 'CODEB00001') RETURNING id`;
  const [practiceA] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${a.id}, '2026-09-05', '09:00', '12:00') RETURNING id`;
  const [practiceB] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time)
    VALUES (${b.id}, '2026-09-05', '09:00', '12:00') RETURNING id`;
  const [guardianA] = await owner`
    INSERT INTO guardians (team_id, line_user_id, line_user_id_lookup)
    VALUES (${a.id}, 'dev:enc:a', ${"a".repeat(64)}) RETURNING id`;
  if (!childA || !childB || !practiceA || !practiceB || !guardianA) {
    throw new Error("フィクスチャの作成に失敗しました");
  }
  return {
    teamA: a.id,
    teamB: b.id,
    childA: childA.id,
    childB: childB.id,
    practiceA: practiceA.id,
    practiceB: practiceB.id,
    guardianA: guardianA.id,
  };
}
