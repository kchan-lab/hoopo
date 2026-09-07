import { describe, expect, it } from "vitest";
import {
  clampAuditLimit,
  describeAuditLog,
  formatDateTokyo,
} from "./audit-shared";

describe("clampAuditLimit", () => {
  it("1〜50 に丸め、小数は切り捨てる", () => {
    expect(clampAuditLimit(0)).toBe(1);
    expect(clampAuditLimit(-5)).toBe(1);
    expect(clampAuditLimit(10.9)).toBe(10);
    expect(clampAuditLimit(999)).toBe(50);
  });

  it("未指定・NaN は既定の 20", () => {
    expect(clampAuditLimit(undefined)).toBe(20);
    expect(clampAuditLimit(Number.NaN)).toBe(20);
    expect(clampAuditLimit(Number.POSITIVE_INFINITY)).toBe(20);
  });
});

describe("describeAuditLog", () => {
  it("部員削除は削除した保護者数だけで説明する(名前は出さない)", () => {
    expect(
      describeAuditLog({
        action: "child_deleted",
        detail: { grade: 6, removedGuardians: 2 },
      }),
    ).toBe("部員データを削除(保護者 2 人分も削除)");
    expect(describeAuditLog({ action: "child_deleted", detail: {} })).toBe(
      "部員データを削除(保護者 0 人分も削除)",
    );
  });

  it("未知の action はそのまま返す", () => {
    expect(describeAuditLog({ action: "x", detail: {} })).toBe("x");
  });
});

describe("formatDateTokyo", () => {
  it("UTC の日付をまたぐ時刻でも Asia/Tokyo の日付になる", () => {
    // 3/31 15:30 UTC = 4/1 00:30 JST
    expect(formatDateTokyo("2026-03-31T15:30:00Z")).toBe("2026/4/1");
    expect(formatDateTokyo(new Date("2026-03-31T14:30:00Z"))).toBe("2026/3/31");
  });
});
