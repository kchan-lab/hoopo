import { describe, expect, it } from "vitest";
import { parseRevoke } from "./members";

const CHILD = "11111111-1111-4111-8111-111111111111";
const GUARDIAN = "22222222-2222-4222-8222-222222222222";

describe("parseRevoke", () => {
  it("新規登録の無効化は kind と childId だけを受け付ける", () => {
    expect(parseRevoke({ kind: "child", childId: CHILD })).toEqual({
      ok: true,
      value: { kind: "child", childId: CHILD },
    });
  });

  it("家族連携の無効化は guardianId も必須", () => {
    expect(
      parseRevoke({ kind: "link", childId: CHILD, guardianId: GUARDIAN }),
    ).toEqual({
      ok: true,
      value: { kind: "link", childId: CHILD, guardianId: GUARDIAN },
    });
    expect(parseRevoke({ kind: "link", childId: CHILD }).ok).toBe(false);
    expect(
      parseRevoke({ kind: "link", childId: CHILD, guardianId: "not-uuid" }).ok,
    ).toBe(false);
  });

  it.each([
    ["kind 不正", { kind: "coach", childId: CHILD }],
    ["childId が UUID でない", { kind: "child", childId: "abc" }],
    ["childId 欠落", { kind: "child" }],
    ["body が null", null],
    ["body が配列", []],
    ["body が文字列", "child"],
  ])("%s は拒否する", (_label, body) => {
    const r = parseRevoke(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("不正");
  });
});
