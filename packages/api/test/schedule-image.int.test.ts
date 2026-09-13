import { closeAppDb } from "@hoopo/db";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getScheduleImageData } from "../src/schedule-image";

// 予定表画像のデータ取得(schedule-publish/plan.md 6b-2)を RLS 配下で検証する。
// 画像そのものの描画は apps/portal(E2E)で確認する

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups
      RESTART IDENTITY CASCADE
  `;
  const [a] =
    await owner`INSERT INTO teams (name) VALUES ('SKC粉浜・北粉浜ミニバスケットボール') RETURNING id`;
  const [b] =
    await owner`INSERT INTO teams (name) VALUES ('他チーム') RETURNING id`;
  if (!a || !b) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
  await owner`INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES
      (${teamId}, '2099-09-12', '09:00', '12:00', '粉浜小'),
      (${teamId}, '2099-09-06', '13:00', '17:00', NULL),
      (${otherTeamId}, '2099-09-20', '09:00', '12:00', '他校')`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("getScheduleImageData", () => {
  it("月の全日を1行ずつ返し、練習日に時間+場所とチーム名が載る", async () => {
    const data = await getScheduleImageData(teamId, "2099-09");
    expect(data.month).toBe("2099-09");
    expect(data.monthLabel).toBe("2099年9月");
    expect(data.teamName).toBe("SKC粉浜・北粉浜ミニバスケットボール");
    expect(data.hasPractices).toBe(true);
    expect(data.rows).toHaveLength(30);
    // 9/6(日)は場所未定、9/12(土)は粉浜小
    expect(data.rows[5]).toMatchObject({
      date: "2099-09-06",
      weekdayLabel: "日",
      entries: [{ time: "13:00–17:00", location: "場所未定" }],
    });
    expect(data.rows[11]?.entries).toEqual([
      { time: "9:00–12:00", location: "粉浜小" },
    ]);
    expect(data.rows.filter((r) => r.entries.length > 0)).toHaveLength(2);
  });

  it("練習の無い月も空の予定表として返す", async () => {
    const data = await getScheduleImageData(teamId, "2099-10");
    expect(data.hasPractices).toBe(false);
    expect(data.rows).toHaveLength(31);
    expect(data.rows.every((r) => r.entries.length === 0)).toBe(true);
    expect(data.monthLabel).toBe("2099年10月");
  });

  it("他チームの練習は混ざらず、チーム名も自チームのものになる", async () => {
    const data = await getScheduleImageData(otherTeamId, "2099-09");
    expect(data.teamName).toBe("他チーム");
    expect(data.rows.flatMap((r) => r.entries.map((e) => e.location))).toEqual([
      "他校",
    ]);
  });
});
