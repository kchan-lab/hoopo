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
export const GENDER_LABELS: Record<Gender, string> = {
  male: "男子",
  female: "女子",
};

/** 任意項目が空のときの表示(登録の確認画面・家族の設定で共通) */
export const NOT_SET = "未入力";

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
/**
 * 姓・名それぞれの上限(child-name-split/plan.md 設計判断6)。
 * フルネーム1本だった頃の 50 文字を「1項目あたり」の基準に直した値
 */
export const NAME_PART_MAX = 25;
const NOTE_MAX = 500;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 参加できる時間帯の既定値。曜日を選ぶ前から欄に入っていて、触らなければこの時間で登録される
 * (availability-common-time/plan.md 設計判断1。もとは曜日を選んだ時点で入る値だった)
 */
export const DEFAULT_START_TIME = "09:00";
export const DEFAULT_END_TIME = "12:00";

/**
 * 参加できる時間帯の欄に添える説明(plan.md 設計判断4)。
 * 厳密な約束だと受け取られると書くのをためらうため、「目安」であることと、
 * 日ごとの都合は参加予定で伝えるという次の導線を示す。登録②と家族の設定で同じ文言を使う
 */
export const AVAILABILITY_HINT =
  "普段参加できる時間の目安です。日によって違っても大丈夫です(その月の参加予定はあとで提出します)";

/** 曜日1つぶんの参加できる時間帯。同じ曜日は1つまで */
export interface AvailabilitySlot {
  /** 0=日 … 6=土(practices.weekday と同一規約) */
  weekday: number;
  startTime: string;
  endTime: string;
}

/** 開始〜終了の1組(曜日を持たない。画面が持つ「共通の時間」「曜日ごとの時間」の型) */
export interface TimeRange {
  startTime: string;
  endTime: string;
}

/**
 * 画面の3つの状態(選んだ曜日 / 共通の時間 / 曜日ごとの時間)から、送信する
 * `availabilities` を組み立てる(availability-common-time/plan.md 設計判断4)。
 * 画面は曜日が0件のときも時間を持てるようになったので、送る値はここで1か所にまとめる。
 * チェックが入っていれば全曜日に共通の時間、外していれば曜日ごとの時間を使い、
 * 曜日ごとの時間を持たない曜日(チェックを外したあとに選び足した曜日)は共通の時間で埋める(設計判断5)。
 * 曜日の昇順で返す(parseAvailabilities と同じ並び)
 */
export function buildAvailabilities(input: {
  weekdays: number[];
  commonTime: TimeRange;
  sameTime: boolean;
  /** 曜日 → その曜日の時間。キーが無い曜日は共通の時間を使う */
  perWeekdayTimes: Record<number, TimeRange>;
}): AvailabilitySlot[] {
  const { weekdays, commonTime, sameTime, perWeekdayTimes } = input;
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((weekday) => {
      const time = sameTime
        ? commonTime
        : (perWeekdayTimes[weekday] ?? commonTime);
      return { weekday, startTime: time.startTime, endTime: time.endTime };
    });
}

/**
 * 「すべての曜日に同じ時間を使う」が入のときに、その時間がどの曜日に効くのかを示す補助文
 * (availability-common-time/plan.md の見せ方)。選んだ曜日をそのまま並べる。
 * 曜日が1つのときは「同じ」を落として「日 にこの時間を使います」とする。
 * 比べる相手が無いのに「同じ時間」と言われると、何と同じなのかを探してしまうため
 * (チェックボックスの文言は登録と家族の設定で共通のまま、補助文で不自然さを解く)。
 * 曜日が0件のときは空文字(チェックボックス自体を出さないので使わない)
 */
export function sameTimeNote(weekdays: number[]): string {
  if (weekdays.length === 0) return "";
  const labels = [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join("・");
  return weekdays.length === 1
    ? `${labels} にこの時間を使います`
    : `${labels} に同じ時間を使います`;
}

/**
 * 参加できる時間帯の検証。曜日ごとに1行で、曜日の昇順に並べて返す。
 * 曜日の重複は弾く(child_availabilities の一意制約と同じ規則を先に画面へ返すため)
 */
export function parseAvailabilities(
  value: unknown,
): ParseResult<AvailabilitySlot[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "参加できる曜日を1つ以上選んでください" };
  }
  if (value.length > WEEKDAY_LABELS.length) {
    return { ok: false, error: "曜日の指定が不正です" };
  }
  const slots: AvailabilitySlot[] = [];
  for (const raw of value) {
    const r = asRecord(raw);
    if (!r) return { ok: false, error: "曜日の指定が不正です" };
    const weekday = r.weekday;
    if (
      !Number.isInteger(weekday) ||
      (weekday as number) < 0 ||
      (weekday as number) > 6
    ) {
      return { ok: false, error: "曜日の指定が不正です" };
    }
    if (slots.some((s) => s.weekday === weekday)) {
      return { ok: false, error: "同じ曜日が重複しています" };
    }
    const startTime = typeof r.startTime === "string" ? r.startTime : "";
    const endTime = typeof r.endTime === "string" ? r.endTime : "";
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return { ok: false, error: "時間帯を HH:MM 形式で入力してください" };
    }
    if (startTime >= endTime) {
      const label = WEEKDAY_LABELS[weekday as number];
      return {
        ok: false,
        error: `${label}曜日の終了時刻は開始時刻より後にしてください`,
      };
    }
    slots.push({ weekday: weekday as number, startTime, endTime });
  }
  slots.sort((a, b) => a.weekday - b.weekday);
  return { ok: true, value: slots };
}

export interface ChildInput {
  familyName: string;
  givenName: string;
  /** ひらがなのみ。五十音順の並べ替えに使う(plan.md 設計判断2) */
  familyNameKana: string;
  givenNameKana: string;
  /** 練習で呼ばれる通称。名の読み(givenNameKana)とは別物で、任意 */
  nicknameKana: string | null;
  /** "YYYY-MM-DD"。学年はここからサーバーで算出する(plan.md 設計判断2) */
  birthDate: string;
  heightCm: number;
  gender: Gender;
}

export interface RegistrationInput {
  children: ChildInput[];
  relation: Relation;
  /** 曜日ごとの参加できる時間帯。重複なし・曜日の昇順(plan.md 設計判断1) */
  availabilities: AvailabilitySlot[];
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

/**
 * 姓・名それぞれの検証(設計判断4)。label は「姓」または「名」。
 * 未入力と長すぎるを区別して、保護者がどこを直せばよいか分かる文言にする
 */
export function parseNamePart(
  value: unknown,
  label: string,
): ParseResult<string> {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { ok: false, error: `${label}を入力してください` };
  if (text.length > NAME_PART_MAX) {
    return {
      ok: false,
      error: `${label}は${NAME_PART_MAX}文字以内で入力してください`,
    };
  }
  return { ok: true, value: text };
}

/**
 * よみの許容文字(設計判断2)。ひらがな(U+3041..U+3096。「ゔ」を含む)と
 * 長音記号「ー」(U+30FC)を基底文字とし、そのうしろにだけ結合用の濁点/半濁点
 * (U+3099/U+309A)を許す。カタカナ・漢字・英数字・空白を弾くことで、DB の並びが
 * そのまま五十音順になる。基底文字を伴わない濁点だけの入力も弾く(レビュー指摘 #158)
 */
const KANA_PATTERN = /^(?:[\u3041-\u3096\u30FC][\u3099\u309A]?)+$/u;

/**
 * 姓・名それぞれの読みの検証(設計判断2)。label は「姓」または「名」。
 * 未入力・長すぎる・ひらがな以外 をそれぞれ別の文言で返す
 */
export function parseNameKana(
  value: unknown,
  label: string,
): ParseResult<string> {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return { ok: false, error: `${label}のよみを入力してください` };
  if (text.length > NAME_PART_MAX) {
    return {
      ok: false,
      error: `${label}のよみは${NAME_PART_MAX}文字以内で入力してください`,
    };
  }
  if (!KANA_PATTERN.test(text)) {
    return {
      ok: false,
      error: `${label}のよみをひらがなで入力してください`,
    };
  }
  return { ok: true, value: text };
}

/**
 * 表示用のフルネーム(設計判断3)。区切りは半角スペース1つ。
 * 名簿・出欠・月謝・編成・予定表画像・LINE 文面はすべてこれを通し、
 * 表示の揺れを1か所で直せるようにする
 */
export function fullName(child: {
  familyName: string;
  givenName: string;
}): string {
  return `${child.familyName} ${child.givenName}`;
}

/** 頭文字アバター(設計判断3): 姓の先頭1文字。姓が空になることは検証で防いでいる */
export function nameInitial(child: { familyName: string }): string {
  return Array.from(child.familyName)[0] ?? "?";
}

function parseChild(value: unknown, index: number): ParseResult<ChildInput> {
  const label = `${index + 1}人目`;
  const r = asRecord(value);
  if (!r) return { ok: false, error: `${label}の情報が不正です` };
  const familyName = parseNamePart(r.familyName, "姓");
  if (!familyName.ok) {
    return { ok: false, error: `${label}の${familyName.error}` };
  }
  const familyNameKana = parseNameKana(r.familyNameKana, "姓");
  if (!familyNameKana.ok) {
    return { ok: false, error: `${label}の${familyNameKana.error}` };
  }
  const givenName = parseNamePart(r.givenName, "名");
  if (!givenName.ok) {
    return { ok: false, error: `${label}の${givenName.error}` };
  }
  const givenNameKana = parseNameKana(r.givenNameKana, "名");
  if (!givenNameKana.ok) {
    return { ok: false, error: `${label}の${givenNameKana.error}` };
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
      familyName: familyName.value,
      givenName: givenName.value,
      familyNameKana: familyNameKana.value,
      givenNameKana: givenNameKana.value,
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
  const availabilities = parseAvailabilities(r.availabilities);
  if (!availabilities.ok) return availabilities;
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
      availabilities: availabilities.value,
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
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
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
  familyName?: string;
  givenName?: string;
  familyNameKana?: string;
  givenNameKana?: string;
  nicknameKana?: string | null;
  birthDate?: string;
  heightCm?: number;
  gender?: Gender;
  /** 渡されたらその子の枠をまるごと差し替える(plan.md 設計判断6) */
  availabilities?: AvailabilitySlot[];
}

/**
 * PATCH の入力。渡された項目だけを更新するので全項目が任意だが、
 * 「何も無い」更新は受け付けない。学年は birthDate から保存時に再計算する
 */
export function parseChildPatch(
  body: unknown,
  /**
   * 参加できる時間帯を受け付けるか。保護者(家族の設定)だけが直せる項目で、
   * コーチの部員管理では編集できない(REQUIREMENTS §5.2 の編集項目に無い)。
   * 検証をコーチと共有しているため、受け付ける範囲は呼び出し側で絞る
   */
  options: { allowAvailabilities?: boolean } = {},
): ParseResult<ChildPatch> {
  const { allowAvailabilities = true } = options;
  const r = asRecord(body);
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const patch: ChildPatch = {};
  if (r.familyName !== undefined) {
    const familyName = parseNamePart(r.familyName, "姓");
    if (!familyName.ok) return familyName;
    patch.familyName = familyName.value;
  }
  if (r.givenName !== undefined) {
    const givenName = parseNamePart(r.givenName, "名");
    if (!givenName.ok) return givenName;
    patch.givenName = givenName.value;
  }
  if (r.familyNameKana !== undefined) {
    const familyNameKana = parseNameKana(r.familyNameKana, "姓");
    if (!familyNameKana.ok) return familyNameKana;
    patch.familyNameKana = familyNameKana.value;
  }
  if (r.givenNameKana !== undefined) {
    const givenNameKana = parseNameKana(r.givenNameKana, "名");
    if (!givenNameKana.ok) return givenNameKana;
    patch.givenNameKana = givenNameKana.value;
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
  if (r.availabilities !== undefined) {
    if (!allowAvailabilities) {
      return {
        ok: false,
        error: "参加できる時間帯はご家族の画面から変更してください",
      };
    }
    const availabilities = parseAvailabilities(r.availabilities);
    if (!availabilities.ok) return availabilities;
    patch.availabilities = availabilities.value;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "変更する項目がありません" };
  }
  return { ok: true, value: patch };
}
