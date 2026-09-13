import { describe, expect, it } from "vitest";
import { nextAnswer, parseSubmitAttendance } from "./attendances-shared";

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
