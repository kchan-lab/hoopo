// お知らせ(announcement)の定数・型・入力検証。DB 非依存(クライアントからも import 可)。
// published_at が null = 下書き。公開済みだけを保護者に見せる(REQUIREMENTS §4.2-3・§5.2)。
// notify_line は「投稿時に LINE へ通知する/しない」の意思表示(§6)。実送信は 6c(#27)

export const TITLE_MAX = 100;
export const BODY_MAX = 2000;

export interface AnnouncementInput {
  title: string;
  body: string;
  notifyLine: boolean;
  /** true なら公開(published_at を今にする。すでに公開済みなら維持)。false なら下書きに戻す */
  publish: boolean;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseAnnouncementInput(
  body: unknown,
): ParseResult<AnnouncementInput> {
  const r =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!r) return { ok: false, error: "入力内容が不正です" };
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title || title.length > TITLE_MAX) {
    return {
      ok: false,
      error: `タイトルは1〜${TITLE_MAX}文字で入力してください`,
    };
  }
  const text = typeof r.body === "string" ? r.body.trim() : "";
  if (!text || text.length > BODY_MAX) {
    return { ok: false, error: `本文は1〜${BODY_MAX}文字で入力してください` };
  }
  if (typeof r.notifyLine !== "boolean") {
    return { ok: false, error: "LINE 通知の指定が不正です" };
  }
  if (typeof r.publish !== "boolean") {
    return { ok: false, error: "公開の指定が不正です" };
  }
  return {
    ok: true,
    value: { title, body: text, notifyLine: r.notifyLine, publish: r.publish },
  };
}

/** 保護者向けの日付表示 "9/6" */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")}`;
}
