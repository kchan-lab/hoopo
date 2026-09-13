import { describe, expect, it } from "vitest";
import {
  formatShortDate,
  parseAnnouncementInput,
} from "./announcements-shared";

describe("parseAnnouncementInput", () => {
  it("正常入力を trim して受け付ける", () => {
    expect(
      parseAnnouncementInput({
        title: " 9月の予定表 ",
        body: " 掲載しました ",
        notifyLine: true,
        publish: false,
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "9月の予定表",
        body: "掲載しました",
        notifyLine: true,
        publish: false,
      },
    });
  });

  it.each([
    [
      "タイトル空",
      { title: " ", body: "x", notifyLine: false, publish: true },
      "タイトル",
    ],
    [
      "タイトル長い",
      { title: "あ".repeat(101), body: "x", notifyLine: false, publish: true },
      "タイトル",
    ],
    [
      "本文空",
      { title: "t", body: "", notifyLine: false, publish: true },
      "本文",
    ],
    [
      "本文長い",
      { title: "t", body: "あ".repeat(2001), notifyLine: false, publish: true },
      "本文",
    ],
    [
      "notifyLine 不正",
      { title: "t", body: "x", notifyLine: "yes", publish: true },
      "LINE",
    ],
    ["publish 不正", { title: "t", body: "x", notifyLine: false }, "公開"],
    ["body 不正", [], "不正"],
  ])("%s は拒否する", (_l, body, expected) => {
    const r = parseAnnouncementInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });
});

describe("formatShortDate", () => {
  it("Asia/Tokyo で月/日にする(UTC 15:00 以降は翌日)", () => {
    expect(formatShortDate("2026-09-05T14:59:00.000Z")).toBe("9/5");
    expect(formatShortDate("2026-09-05T15:00:00.000Z")).toBe("9/6");
  });
});
