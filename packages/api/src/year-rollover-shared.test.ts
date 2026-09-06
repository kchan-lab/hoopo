import { describe, expect, it } from "vitest";
import {
  buildRestoreGroups,
  buildSnapshot,
  isUndoable,
  partitionMembers,
  UNDO_GRACE_MS,
  undoDeadline,
} from "./year-rollover-shared";

// 年度更新の純ロジック(docs/DEVELOPMENT.md テスト戦略の Unit 対象)。
// DB を通した実行・取り消しは packages/api/test/year-rollover.int.test.ts

describe("partitionMembers", () => {
  it("6年生は卒団、それ以外は学年+1に振り分ける", () => {
    expect(
      partitionMembers([
        { id: "a", grade: 1 },
        { id: "b", grade: 5 },
        { id: "c", grade: 6 },
      ]),
    ).toEqual({ promoting: ["a", "b"], graduating: ["c"] });
  });

  it("全員6年生なら promoting は空", () => {
    expect(
      partitionMembers([
        { id: "a", grade: 6 },
        { id: "b", grade: 6 },
      ]),
    ).toEqual({ promoting: [], graduating: ["a", "b"] });
  });

  it("対象が0人なら両方空", () => {
    expect(partitionMembers([])).toEqual({ promoting: [], graduating: [] });
  });
});

describe("undoDeadline / isUndoable", () => {
  const executedAt = new Date("2026-04-01T00:00:00.000Z");

  it("期限は実行時刻+24時間(ISO文字列でも Date でも同じ)", () => {
    expect(undoDeadline(executedAt).toISOString()).toBe(
      "2026-04-02T00:00:00.000Z",
    );
    expect(undoDeadline(executedAt.toISOString()).getTime()).toBe(
      executedAt.getTime() + UNDO_GRACE_MS,
    );
  });

  it("猶予内なら取り消せる", () => {
    expect(
      isUndoable(executedAt, null, new Date("2026-04-01T23:59:59.999Z")),
    ).toBe(true);
  });

  it("ちょうど24時間後は取り消せない(境界は期限に含めない)", () => {
    expect(
      isUndoable(executedAt, null, new Date("2026-04-02T00:00:00.000Z")),
    ).toBe(false);
    expect(
      isUndoable(executedAt, null, new Date("2026-04-01T23:59:59.999Z")),
    ).toBe(true);
  });

  it("猶予を過ぎたら取り消せない", () => {
    expect(
      isUndoable(executedAt, null, new Date("2026-04-02T01:00:00.000Z")),
    ).toBe(false);
  });

  it("取り消し済みなら猶予内でも取り消せない(1回だけ。設計判断2)", () => {
    expect(
      isUndoable(
        executedAt,
        new Date("2026-04-01T01:00:00.000Z"),
        new Date("2026-04-01T02:00:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("buildSnapshot", () => {
  it("childId をキーに実行前の学年・アーカイブ状態を持つ", () => {
    expect(
      buildSnapshot([
        { id: "a", grade: 1, archived: false },
        { id: "c", grade: 6, archived: false },
      ]),
    ).toEqual({
      a: { grade: 1, archived: false },
      c: { grade: 6, archived: false },
    });
  });

  it("対象が0人なら空の snapshot", () => {
    expect(buildSnapshot([])).toEqual({});
  });
});

describe("buildRestoreGroups", () => {
  it("同じ(学年, アーカイブ状態)の部員をまとめる", () => {
    const groups = buildRestoreGroups({
      a: { grade: 1, archived: false },
      b: { grade: 1, archived: false },
      c: { grade: 6, archived: false },
    });
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual({
      grade: 1,
      archived: false,
      childIds: ["a", "b"],
    });
    expect(groups).toContainEqual({
      grade: 6,
      archived: false,
      childIds: ["c"],
    });
  });

  it("学年が同じでもアーカイブ状態が違えば別グループ", () => {
    const groups = buildRestoreGroups({
      a: { grade: 6, archived: false },
      b: { grade: 6, archived: true },
    });
    expect(groups).toHaveLength(2);
  });

  it("空の snapshot なら空配列", () => {
    expect(buildRestoreGroups({})).toEqual([]);
  });
});
