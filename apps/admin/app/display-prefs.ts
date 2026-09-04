// 表示設定(テーマ/文字サイズ)の Cookie 定義。
// layout(SSR での読み取り)と display-settings(クライアントでの保存)で共有する。
// localStorage は使わない(CLAUDE.md「してはいけないこと」)

export const THEME_COOKIE_NAME = "admin_theme";
export const FS_COOKIE_NAME = "admin_fs";

export const THEMES = ["light", "dark"] as const;
export const FONT_SIZES = ["s", "m", "l"] as const;

export type Theme = (typeof THEMES)[number];
export type FontSize = (typeof FONT_SIZES)[number];

/** Cookie の値が既知の候補に一致するときだけ採用する(改ざん・古い値対策) */
export function pickKnown<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return allowed.find((v) => v === value);
}
