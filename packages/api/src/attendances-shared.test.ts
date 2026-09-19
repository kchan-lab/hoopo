import { describe, expect, it } from "vitest";
import {
  nextAnswer,
  parseSubmitAttendance,
  submissionState,
  unansweredNotice,
} from "./attendances-shared";

const CHILD = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";

describe("nextAnswer(カレンダーのタップ巡回)", () => {
  it("参加 → 途中 → 不参加 → 未回答 → 参加", () => {
    expect(nextAnswer(null)).toBe("full");
    expect(nextAnswer("full")).toBe("partial");
    expect(nextAnswer("partial")).toBe("absent");
    expect(nextAnswer("absent")).toBeNull();
  });
});

describe("parseSubmitAttendance", () => {
  it("3値+未回答を受け付け、コメントは途中参加・早退のときだけ保持する", () => {
    const r = parseSubmitAttendance({
      childId: CHILD,
      answers: [
        { practiceId: P1, status: "partial", comment: " 11:00ごろ早退します " },
        { practiceId: P2, status: "full", comment: "捨てられる" },
      ],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        childId: CHILD,
        answers: [
          { practiceId: P1, status: "partial", comment: "11:00ごろ早退します" },
          { practiceId: P2, status: "full", comment: null },
        ],
      },
    });
    const unanswered = parseSubmitAttendance({
      childId: CHILD,
      answers: [{ practiceId: P1, status: null }],
    });
    expect(unanswered.ok && unanswered.value.answers[0]?.status).toBeNull();
  });

  it.each([
    [
      "childId 不正",
      { childId: "x", answers: [{ practiceId: P1, status: "full" }] },
      "お子さん",
    ],
    ["answers 空", { childId: CHILD, answers: [] }, "1件以上"],
    [
      "practiceId 不正",
      { childId: CHILD, answers: [{ practiceId: "p", status: "full" }] },
      "練習",
    ],
    [
      "practiceId 重複",
      {
        childId: CHILD,
        answers: [
          { practiceId: P1, status: "full" },
          { practiceId: P1, status: "absent" },
        ],
      },
      "練習",
    ],
    [
      "status 不正",
      { childId: CHILD, answers: [{ practiceId: P1, status: "maybe" }] },
      "回答",
    ],
    [
      "コメントが長い",
      {
        childId: CHILD,
        answers: [
          { practiceId: P1, status: "partial", comment: "あ".repeat(201) },
        ],
      },
      "200文字",
    ],
    ["body 不正", [], "不正"],
  ])("%s は拒否する", (_label, body, expected) => {
    const r = parseSubmitAttendance(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });
});

describe("submissionState(提出タブ上部の常時表示)", () => {
  it("未提出 → 提出済み(日時)→ 未提出の変更があります", () => {
    expect(submissionState("2026-09", null, false)).toEqual({
      kind: "unsubmitted",
      mark: "−",
      text: "9月分 未提出",
    });
    expect(
      submissionState("2026-09", "2026-09-14T03:30:00.000Z", false),
    ).toEqual({
      kind: "submitted",
      mark: "✓",
      text: "9月分 提出済み(9/14 12:30)",
    });
    expect(
      submissionState("2026-09", "2026-09-14T03:30:00.000Z", true),
    ).toEqual({
      kind: "changed",
      mark: "!",
      text: "9月分 未提出の変更があります",
    });
  });

  it("提出後に練習日が増えたら未回答の件数を出す(Issue #154)", () => {
    // 提出日時はあるが、その月にまだ答えていない練習が残っている状態
    expect(
      submissionState("2026-09", "2026-09-14T03:30:00.000Z", false, 1),
    ).toEqual({
      kind: "partial",
      mark: "?",
      text: "9月分 未回答が1件あります(提出済み 9/14 12:30)",
    });
    expect(
      submissionState("2026-09", "2026-09-14T03:30:00.000Z", false, 2).text,
    ).toBe("9月分 未回答が2件あります(提出済み 9/14 12:30)");
    // 全部答えていれば従来どおり
    expect(
      submissionState("2026-09", "2026-09-14T03:30:00.000Z", false, 0).kind,
    ).toBe("submitted");
  });

  it("触っているあいだは未回答が残っていても「変更があります」を優先する", () => {
    expect(
      submissionState("2026-09", "2026-09-14T03:30:00.000Z", true, 3).kind,
    ).toBe("changed");
  });

  it("一度も提出していなければ未回答が残っていても「未提出」", () => {
    expect(submissionState("2026-09", null, false, 3).kind).toBe("unsubmitted");
  });

  it("未提出でも触ったら「未提出の変更があります」になる", () => {
    expect(submissionState("2026-12", null, true).kind).toBe("changed");
    expect(submissionState("2026-12", null, true).text).toBe(
      "12月分 未提出の変更があります",
    );
  });
});

describe("unansweredNotice(提出前の確認。Issue #176)", () => {
  it("未回答があるときだけ警告の文言を出す(0 件なら出さない)", () => {
    expect(unansweredNotice(0)).toBeNull();
    expect(unansweredNotice(1)).toBe("未回答が1件あります");
    expect(unansweredNotice(3)).toBe("未回答が3件あります");
  });

  it("数え方と単位が画面上部の常時表示とそろう(#178 のレビュー指摘)", () => {
    // 同じ月・同じ未回答数なら、上部のバナーと確認の警告が同じ数字・同じ単位になる
    const unanswered = 2;
    const state = submissionState(
      "2026-09",
      "2026-09-01T00:00:00Z",
      false,
      unanswered,
    );
    expect(state.text).toContain(`${unanswered}件`);
    expect(unansweredNotice(unanswered)).toContain(`${unanswered}件`);
  });
});
