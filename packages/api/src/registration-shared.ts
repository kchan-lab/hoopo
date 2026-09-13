// 子ども登録・家族連携の「純粋な」部分: 定数・型・入力バリデーション。
// DB に依存しないため、portal のクライアントコンポーネントからも import できる
// (@hoopo/api/shared)。DB を触る関数は registration.ts 側

import { isInviteCodeFormat, normalizeInviteCode } from "@hoopo/db/invite-code";
import { parseBirthDate, parseHeightCm } from "./grade-shared";

export const RELATIONS = ["father", "mother", "grandparent", "other"] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_LABELS: Record<Relation, string> = {
  father: "父",
  mother: "母",
  grandparent: "祖父母",
  other: "その他",
};

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const WEEKDAY_LABELS = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
] as const;

const NAME_MAX = 50;
const NOTE_MAX = 500;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ChildInput {
  name: string;
  nicknameKana: string | null;
  /** "YYYY-MM-DD"。学年はここからサーバーで算出する(plan.md 設計判断2) */
  birthDate: string;
  heightCm: number;
  gender: Gender;
}

export interface RegistrationInput {
  children: ChildInput[];
  relation: Relation;
  /** 0=日 … 6=土。重複なし・昇順 */
  weekdays: number[];
  startTime: string;
  endTime: string;
  coachNote: string | null;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > max) return undefined;
  return text === "" ? null : text;
}

function parseName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= NAME_MAX ? name : null;
}

function parseChild(value: unknown, index: number): ParseResult<ChildInput> {
  const label = `${index + 1}人目`;
  const r = asRecord(value);
  if (!r) return { ok: false, error: `${label}の情報が不正です` };
  const name = parseName(r.name);
  if (!name) {
    return { ok: false, error: `${label}のお名前を入力してください` };
  }
  const nicknameKana = optionalText(r.nicknameKana, NAME_MAX);
  if (nicknameKana === undefined) {
    return { ok: false, error: `${label}の呼び名が長すぎます` };
  }
  // 学年は生年月日から算出する(§3)。入力は生年月日と身長で、どちらも必須
  const birthDate = parseBirthDate(r.birthDate);
  if (!birthDate.ok)
    return { ok: false, error: `${label}の${birthDate.error}` };
  const heightCm = parseHeightCm(r.heightCm);
  if (!heightCm.ok) return { ok: false, error: `${label}の${heightCm.error}` };
  if (!GENDERS.includes(r.gender as Gender)) {
    return { ok: false, error: `${label}の性別を選んでください` };
  }
  return {
    ok: true,
    value: {
      name,
      nicknameKana,
      birthDate: birthDate.value,
      heightCm: heightCm.value,
      gender: r.gender as Gender,
    },
  };
}

export function parseRegistration(
  body: unknown,
): ParseResult<RegistrationInput> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  if (!Array.isArray(r.children) || r.children.length === 0) {
    return { ok: false, error: "お子さんを1人以上入力してください" };
  }
  if (r.children.length > 10) {
    return { ok: false, error: "一度に登録できるのは10人までです" };
  }
  const parsedChildren: ChildInput[] = [];
  for (const [i, c] of r.children.entries()) {
    const p = parseChild(c, i);
    if (!p.ok) return p;
    parsedChildren.push(p.value);
  }
  if (!RELATIONS.includes(r.relation as Relation)) {
    return { ok: false, error: "続柄を選んでください" };
  }
  if (!Array.isArray(r.weekdays) || r.weekdays.length === 0) {
    return { ok: false, error: "参加できる曜日を1つ以上選んでください" };
  }
  const weekdays = [...new Set(r.weekdays)].filter(
    (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  if (weekdays.length !== new Set(r.weekdays).size) {
    return { ok: false, error: "曜日の指定が不正です" };
  }
  weekdays.sort((a, b) => a - b);
  const startTime = typeof r.startTime === "string" ? r.startTime : "";
  const endTime = typeof r.endTime === "string" ? r.endTime : "";
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return { ok: false, error: "時間帯を HH:MM 形式で入力してください" };
  }
  if (startTime >= endTime) {
    return { ok: false, error: "終了時刻は開始時刻より後にしてください" };
  }
  const coachNote = optionalText(r.coachNote, NOTE_MAX);
  if (coachNote === undefined) {
    return {
      ok: false,
      error: `伝達事項は${NOTE_MAX}文字以内で入力してください`,
    };
  }
  return {
    ok: true,
    value: {
      children: parsedChildren,
      relation: r.relation as Relation,
      weekdays,
      startTime,
      endTime,
      coachNote,
    },
  };
}

export interface LinkInput {
  code: string;
  relation: Relation;
}

export function parseLink(body: unknown): ParseResult<LinkInput> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const code = normalizeInviteCode(typeof r.code === "string" ? r.code : "");
  if (!isInviteCodeFormat(code)) {
    return { ok: false, error: "招待コードの形式が違います(10文字)" };
  }
  if (!RELATIONS.includes(r.relation as Relation)) {
    return { ok: false, error: "続柄を選んでください" };
  }
  return { ok: true, value: { code, relation: r.relation as Relation } };
}

/** 子ども情報(編集フォームの初期値・PATCH の応答。保護者とコーチで同形) */
export interface ChildDetail {
  id: string;
  name: string;
  nicknameKana: string | null;
  /** birthDate からの算出値(保存済み) */
  grade: number;
  gender: Gender;
  /** 0010 より前に登録された部員は null(plan.md 設計判断3) */
  birthDate: string | null;
  heightCm: number | null;
}

/** 子ども情報の部分更新(保護者の家族の設定・コーチの部員管理。plan.md 設計判断5) */
export interface ChildPatch {
  name?: string;
  nicknameKana?: string | null;
  birthDate?: string;
  heightCm?: number;
  gender?: Gender;
}

/**
 * PATCH の入力。渡された項目だけを更新するので全項目が任意だが、
 * 「何も無い」更新は受け付けない。学年は birthDate から保存時に再計算する
 */
export function parseChildPatch(body: unknown): ParseResult<ChildPatch> {
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const patch: ChildPatch = {};
  if (r.name !== undefined) {
    const name = parseName(r.name);
    if (!name) return { ok: false, error: "お名前を入力してください" };
    patch.name = name;
  }
  if ("nicknameKana" in r) {
    const nicknameKana = optionalText(r.nicknameKana, NAME_MAX);
    if (nicknameKana === undefined) {
      return { ok: false, error: "呼び名が長すぎます" };
    }
    patch.nicknameKana = nicknameKana;
  }
  if (r.birthDate !== undefined) {
    const birthDate = parseBirthDate(r.birthDate);
    if (!birthDate.ok) return birthDate;
    patch.birthDate = birthDate.value;
  }
  if (r.heightCm !== undefined) {
    const heightCm = parseHeightCm(r.heightCm);
    if (!heightCm.ok) return heightCm;
    patch.heightCm = heightCm.value;
  }
  if (r.gender !== undefined) {
    if (!GENDERS.includes(r.gender as Gender)) {
      return { ok: false, error: "性別を選んでください" };
    }
    patch.gender = r.gender as Gender;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "変更する項目がありません" };
  }
  return { ok: true, value: patch };
}
