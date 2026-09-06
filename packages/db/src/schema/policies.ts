import { sql } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";
import { hoopoApp } from "./roles";
import {
  announcements,
  attendances,
  childAvailabilities,
  children,
  coaches,
  feeRecords,
  guardianChildren,
  guardians,
  lineups,
  practiceMenus,
  practices,
  teams,
  yearRollovers,
} from "./tables";

// RLS ポリシー(plan.md 設計判断2c):
// - missing_ok(第2引数 true)+ nullif で「app.team_id 未設定 = NULL = 0行/書き込み拒否」の
//   fail-closed に統一する(例外ではなく確実に閉じる)
// - (select ...) で包むのは Postgres が initPlan として1回だけ評価し、
//   team_id の index scan を効かせるため
// - FOR ALL 1本で USING / WITH CHECK を両方明示する(暗黙の流用に依存しない。
//   team_id を他チームへ書き換える UPDATE を塞ぐのは WITH CHECK 側)
// - FORCE ROW LEVEL SECURITY はカスタムマイグレーション側で全テーブルに適用済み

const teamMatch = sql`team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)`;

// teams は id 自身がテナント境界(team_id 列を持たない)
const teamsMatch = sql`id = (select nullif(current_setting('app.team_id', true), '')::uuid)`;

const teamPolicy = (name: string, expr = teamMatch) =>
  pgPolicy(`${name}_team_isolation`, {
    as: "permissive",
    for: "all",
    to: hoopoApp,
    using: expr,
    withCheck: expr,
  });

export const teamsPolicy = teamPolicy("teams", teamsMatch).link(teams);
export const coachesPolicy = teamPolicy("coaches").link(coaches);
export const guardiansPolicy = teamPolicy("guardians").link(guardians);
export const guardianChildrenPolicy =
  teamPolicy("guardian_children").link(guardianChildren);
export const childrenPolicy = teamPolicy("children").link(children);
export const childAvailabilitiesPolicy = teamPolicy(
  "child_availabilities",
).link(childAvailabilities);
export const practicesPolicy = teamPolicy("practices").link(practices);
export const practiceMenusPolicy =
  teamPolicy("practice_menus").link(practiceMenus);
export const attendancesPolicy = teamPolicy("attendances").link(attendances);
export const feeRecordsPolicy = teamPolicy("fee_records").link(feeRecords);
export const announcementsPolicy =
  teamPolicy("announcements").link(announcements);
export const lineupsPolicy = teamPolicy("lineups").link(lineups);
export const yearRolloversPolicy =
  teamPolicy("year_rollovers").link(yearRollovers);
