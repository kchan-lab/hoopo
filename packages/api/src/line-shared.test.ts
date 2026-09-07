import { describe, expect, it } from "vitest";
import {
  buildAnnouncementMessages,
  buildScheduleMessages,
  canSend,
  computeLineUsage,
  describeLineMessage,
  joinUrl,
  LINE_MONTHLY_QUOTA,
} from "./line-shared";

// 2026-09-15 12:00 JST
const NOW = new Date("2026-09-15T03:00:00Z");

describe("computeLineUsage", () => {
  it("当月(Asia/Tokyo)の sent 行だけを合計する", () => {
    const usage = computeLineUsage(
      [
        {
          recipientCount: 12,
          status: "sent",
          sentAt: "2026-09-01T00:00:00+09:00",
        },
        {
          recipientCount: 12,
          status: "failed",
          sentAt: "2026-09-02T00:00:00+09:00",
        },
        // JST では 8/31 23:30 → 先月
        { recipientCount: 99, status: "sent", sentAt: "2026-08-31T14:30:00Z" },
        // JST では 9/1 00:30 → 今月
        { recipientCount: 3, status: "sent", sentAt: "2026-08-31T15:30:00Z" },
      ],
      NOW,
    );
    expect(usage).toEqual({
      month: "2026-09",
      used: 15,
      quota: LINE_MONTHLY_QUOTA,
      remaining: 185,
    });
  });

  it("枠を超えても remaining は 0 で止まる", () => {
    const usage = computeLineUsage(
      [{ recipientCount: 250, status: "sent", sentAt: NOW }],
      NOW,
    );
    expect(usage.used).toBe(250);
    expect(usage.remaining).toBe(0);
  });
});

describe("canSend", () => {
  it("使用済み+今回が枠内なら送れる(ちょうど枠いっぱいも可)", () => {
    expect(canSend({ used: 188, quota: 200 }, 12)).toEqual({ ok: true });
  });

  it("枠を 1 通でも超えると送らない", () => {
    const r = canSend({ used: 189, quota: 200 }, 12);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("残り 11 通");
  });

  it("参加者 0 人には送らない", () => {
    expect(canSend({ used: 0, quota: 200 }, 0).ok).toBe(false);
  });
});

describe("メッセージ本文", () => {
  it("予定表は画像+短文の 2 メッセージで、リンクは月つき", () => {
    const messages = buildScheduleMessages({
      month: "2026-10",
      monthLabel: "2026年10月",
      imageUrl: "https://portal.example/api/schedule/2026-10.png",
      liffUrl: "https://liff.line.me/123-abc/",
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      type: "image",
      originalContentUrl: "https://portal.example/api/schedule/2026-10.png",
      previewImageUrl: "https://portal.example/api/schedule/2026-10.png",
    });
    expect(messages[1]).toEqual({
      type: "text",
      text: "2026年10月の練習予定を発行しました。\n出欠の提出はこちらから\nhttps://liff.line.me/123-abc/schedule?month=2026-10",
    });
  });

  it("お知らせはタイトル+リンクのみ(本文は載せない)", () => {
    const messages = buildAnnouncementMessages({
      id: "00000000-0000-4000-8000-000000000123",
      title: "合宿のご案内",
      liffUrl: "http://localhost:8000",
    });
    expect(messages).toEqual([
      {
        type: "text",
        text: "お知らせ「合宿のご案内」を公開しました。\nhttp://localhost:8000/announcements/00000000-0000-4000-8000-000000000123",
      },
    ]);
  });

  it("joinUrl は末尾スラッシュの有無に関わらず 1 本にする", () => {
    expect(joinUrl("https://a.example/", "/x")).toBe("https://a.example/x");
    expect(joinUrl("https://a.example", "/x")).toBe("https://a.example/x");
  });

  it("describeLineMessage は種別ごとの見出しを返す", () => {
    expect(describeLineMessage({ kind: "schedule", ref: "2026-10" })).toBe(
      "予定表(2026-10)",
    );
    expect(describeLineMessage({ kind: "announcement", ref: "x" })).toBe(
      "お知らせ",
    );
    expect(describeLineMessage({ kind: "reminder", ref: "x" })).toBe(
      "出欠リマインド",
    );
  });
});

describe("trimTrailingSlash", () => {
  it("末尾のスラッシュを何個でも落とし、途中のスラッシュは残す", async () => {
    const { trimTrailingSlash } = await import("./line-shared");
    expect(trimTrailingSlash("https://a.example///")).toBe("https://a.example");
    expect(trimTrailingSlash("https://a.example/x")).toBe(
      "https://a.example/x",
    );
    expect(trimTrailingSlash("")).toBe("");
  });
});
