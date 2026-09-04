import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  approvalStatus,
  attendanceStatus,
  feeStatus,
  lineupRole,
} from "./enums";

// 共通方針(plan.md 設計判断4-7):
// - id は uuid(gen_random_uuid)。全テーブルに created_at、更新のある表は updated_at
// - teams 以外の全テーブルに team_id(CLAUDE.md 絶対原則5)
// - 親(guardians/children/practices)は UNIQUE (id, team_id) を持ち、子は複合 FK で参照する。
//   FK 整合性チェックは RLS をバイパスするため、単純 FK では他チームの行を参照する
//   不整合(例: A チームの出欠が B チームの練習を指す)を防げない
// - 日付は Asia/Tokyo 前提の date / time(タイムゾーンなし)、時刻イベントは timestamptz

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  logoPath: text("logo_path"),
  teamColor: text("team_color"),
  lineGroupId: text("line_group_id").unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const coaches = pgTable(
  "coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    email: text("email").notNull().unique(),
    authType: text("auth_type").notNull(),
    // PBKDF2 形式のハッシュのみ保存(生成・照合は packages/api/password.ts の責務)。
    // auth_type='line' のコーチは NULL。リセットトークンは §10 未決のため未実装
    passwordHash: text("password_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("coaches_auth_type_check", sql`${t.authType} IN ('line', 'email')`),
    // email 認証なのにハッシュ未設定というログイン不能データを DB で拒否する
    check(
      "coaches_email_auth_requires_password",
      sql`${t.authType} <> 'email' OR ${t.passwordHash} IS NOT NULL`,
    ),
    index("coaches_team_id_idx").on(t.teamId),
  ],
);

export const guardians = pgTable(
  "guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    // 暗号文のみ保存(絶対原則4)。暗号化・HMAC の実装は packages/line の責務
    lineUserId: text("line_user_id").notNull(),
    // LIFF ログインで guardian を引くための検索キー(HMAC-SHA256 hex)
    lineUserIdLookup: text("line_user_id_lookup").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("guardians_id_team_id_unique").on(t.id, t.teamId),
    unique("guardians_team_lookup_unique").on(t.teamId, t.lineUserIdLookup),
    // 平文の LINE userId(U + 32桁hex)の混入事故を DB 側でも拒否する
    check(
      "guardians_line_user_id_not_plaintext",
      sql`${t.lineUserId} !~ '^U[0-9a-f]{32}$'`,
    ),
  ],
);

export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    name: text("name").notNull(),
    nicknameKana: text("nickname_kana"),
    grade: smallint("grade").notNull(),
    gender: text("gender").notNull(),
    coachNote: text("coach_note"),
    inviteCode: text("invite_code").notNull().unique(),
    photoPath: text("photo_path"),
    status: approvalStatus("status").notNull().default("active"),
    // 卒団アーカイブ。grade は据え置き、archived_at は年度更新の取り消し猶予に使う
    archived: boolean("archived").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("children_id_team_id_unique").on(t.id, t.teamId),
    check("children_grade_check", sql`${t.grade} BETWEEN 1 AND 6`),
    check("children_gender_check", sql`${t.gender} IN ('male', 'female')`),
    index("children_team_id_idx").on(t.teamId),
  ],
);

export const guardianChildren = pgTable(
  "guardian_children",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    guardianId: uuid("guardian_id").notNull(),
    childId: uuid("child_id").notNull(),
    relation: text("relation").notNull(),
    status: approvalStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.guardianId, t.childId] }),
    foreignKey({
      columns: [t.guardianId, t.teamId],
      foreignColumns: [guardians.id, guardians.teamId],
      name: "guardian_children_guardian_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.childId, t.teamId],
      foreignColumns: [children.id, children.teamId],
      name: "guardian_children_child_fk",
    }).onDelete("cascade"),
    check(
      "guardian_children_relation_check",
      sql`${t.relation} IN ('father', 'mother', 'grandparent', 'other')`,
    ),
    index("guardian_children_team_id_idx").on(t.teamId),
    index("guardian_children_child_id_idx").on(t.childId),
  ],
);

export const childAvailabilities = pgTable(
  "child_availabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    childId: uuid("child_id").notNull(),
    // 0=日(practices.weekday と同一規約)
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("child_availabilities_child_slot_unique").on(
      t.childId,
      t.weekday,
      t.startTime,
    ),
    foreignKey({
      columns: [t.childId, t.teamId],
      foreignColumns: [children.id, children.teamId],
      name: "child_availabilities_child_fk",
    }).onDelete("cascade"),
    check(
      "child_availabilities_weekday_check",
      sql`${t.weekday} BETWEEN 0 AND 6`,
    ),
    index("child_availabilities_team_id_idx").on(t.teamId),
  ],
);

export const practices = pgTable(
  "practices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    // 練習日は「日付+曜日」で保持(CLAUDE.md)。held_on は Asia/Tokyo のカレンダー日付
    heldOn: date("held_on").notNull(),
    // 0=日。timestamptz から導出すると UTC 境界で1日ずれるため date からの生成列にする
    weekday: smallint("weekday").generatedAlwaysAs(
      sql`EXTRACT(DOW FROM held_on)::smallint`,
    ),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    location: text("location"),
    note: text("note"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("practices_id_team_id_unique").on(t.id, t.teamId),
    index("practices_team_held_on_idx").on(t.teamId, t.heldOn),
  ],
);

export const practiceMenus = pgTable(
  "practice_menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    practiceId: uuid("practice_id").notNull(),
    durationMin: smallint("duration_min"),
    content: text("content").notNull(),
    sort: smallint("sort").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.practiceId, t.teamId],
      foreignColumns: [practices.id, practices.teamId],
      name: "practice_menus_practice_fk",
    }).onDelete("cascade"),
    index("practice_menus_practice_id_idx").on(t.practiceId, t.sort),
    index("practice_menus_team_id_idx").on(t.teamId),
  ],
);

export const attendances = pgTable(
  "attendances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    childId: uuid("child_id").notNull(),
    practiceId: uuid("practice_id").notNull(),
    status: attendanceStatus("status").notNull(),
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // 提出は子ども×練習で1件(再提出は upsert)
    unique("attendances_practice_child_unique").on(t.practiceId, t.childId),
    foreignKey({
      columns: [t.childId, t.teamId],
      foreignColumns: [children.id, children.teamId],
      name: "attendances_child_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.practiceId, t.teamId],
      foreignColumns: [practices.id, practices.teamId],
      name: "attendances_practice_fk",
    }).onDelete("cascade"),
    // コメントは「途中参加・早退(partial)」のときだけ(§4.2-6)
    check(
      "attendances_comment_partial_only",
      sql`${t.status} = 'partial' OR ${t.comment} IS NULL`,
    ),
    index("attendances_team_id_idx").on(t.teamId),
    index("attendances_child_id_idx").on(t.childId),
  ],
);

export const feeRecords = pgTable(
  "fee_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    childId: uuid("child_id").notNull(),
    year: smallint("year").notNull(),
    month: smallint("month").notNull(),
    status: feeStatus("status").notNull().default("unpaid"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // 封筒グリッドの1セル = 子ども×年月(§4.2-8)
    unique("fee_records_child_year_month_unique").on(
      t.childId,
      t.year,
      t.month,
    ),
    foreignKey({
      columns: [t.childId, t.teamId],
      foreignColumns: [children.id, children.teamId],
      name: "fee_records_child_fk",
    }).onDelete("cascade"),
    check("fee_records_month_check", sql`${t.month} BETWEEN 1 AND 12`),
    index("fee_records_team_id_idx").on(t.teamId),
  ],
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    notifyLine: boolean("notify_line").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("announcements_team_published_idx").on(t.teamId, t.publishedAt),
  ],
);

export const lineups = pgTable(
  "lineups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id),
    practiceId: uuid("practice_id").notNull(),
    childId: uuid("child_id").notNull(),
    role: lineupRole("role").notNull(),
    // 配置仕様(左右指定など)が動く前提のため enum ではなく text + CHECK(§10 申し送り)
    position: text("position"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("lineups_practice_child_unique").on(t.practiceId, t.childId),
    foreignKey({
      columns: [t.practiceId, t.teamId],
      foreignColumns: [practices.id, practices.teamId],
      name: "lineups_practice_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.childId, t.teamId],
      foreignColumns: [children.id, children.teamId],
      name: "lineups_child_fk",
    }).onDelete("cascade"),
    check(
      "lineups_position_check",
      sql`${t.position} IN ('PG', 'SG', 'SF', 'PF', 'C')`,
    ),
    index("lineups_team_id_idx").on(t.teamId),
  ],
);
