import { describe, expect, it } from "vitest";
import {
  BIRTH_DATE_RANGE_ERROR,
  birthDateForGrade,
  GRADE_MAX,
  GRADE_MIN,
  gradeFromBirthDate,
  gradeLabel,
  gradeShortLabel,
  HEIGHT_MAX,
  HEIGHT_MIN,
  parseBirthDate,
  parseHeightCm,
  schoolYearOf,
} from "./grade-shared";

// 学齢の境界(child-birthdate-height/plan.md 設計判断4)。
// 4月2日〜翌4月1日生まれが同学年で、年度は4月1日に切り替わる = 1日ずれるのが肝

const TODAY = "2026-09-13";

describe("schoolYearOf", () => {
  it.each([
    ["2026-03-31", 2025],
    ["2026-04-01", 2026],
    ["2026-12-31", 2026],
    ["2027-01-01", 2026],
  ])("%s は %i 年度", (date, year) => {
    expect(schoolYearOf(date)).toBe(year);
  });

  it("日付として不正なものは null", () => {
    expect(schoolYearOf("2026-02-30")).toBeNull();
    expect(schoolYearOf("2026-13-01")).toBeNull();
    expect(schoolYearOf("2026/04/01")).toBeNull();
  });
});

describe("gradeFromBirthDate", () => {
  it("4月1日生まれと4月2日生まれで学年が分かれる", () => {
    expect(gradeFromBirthDate("2019-04-01", TODAY)).toBe(2);
    expect(gradeFromBirthDate("2019-04-02", TODAY)).toBe(1);
  });

  it.each([
    ["2019-06-01", 1],
    ["2018-06-01", 2],
    ["2017-06-01", 3],
    ["2016-06-01", 4],
    ["2015-06-01", 5],
    ["2014-06-01", 6],
    // 中学1年生(grade-junior-high/plan.md 設計判断1)
    ["2013-06-01", 7],
  ])("%s 生まれは %i 年", (birthDate, grade) => {
    expect(gradeFromBirthDate(birthDate, TODAY)).toBe(grade);
  });

  it("入学前・中学2年以上は null", () => {
    // 2020-05-01 生まれは 0 年、2013-04-01 生まれは 8 年(中学2年)にあたる
    expect(gradeFromBirthDate("2020-05-01", TODAY)).toBeNull();
    expect(gradeFromBirthDate("2013-04-01", TODAY)).toBeNull();
    expect(gradeFromBirthDate("2013-04-02", TODAY)).toBe(7);
    // 小学6年の1つ上は弾かれず、中学1年生になる(#187 の不具合の再発防止)
    expect(gradeFromBirthDate("2014-04-01", TODAY)).toBe(7);
  });

  it("うるう日生まれも学齢の年度で判定する", () => {
    // 2/29 は 4/2 より前なので前年度の学齢
    expect(gradeFromBirthDate("2020-02-29", TODAY)).toBe(1);
    expect(gradeFromBirthDate("2016-02-29", TODAY)).toBe(5);
  });

  it("基準日が3月31日か4月1日かで学年が1つ動く(年度の切り替わり)", () => {
    expect(gradeFromBirthDate("2019-06-01", "2027-03-31")).toBe(1);
    expect(gradeFromBirthDate("2019-06-01", "2027-04-01")).toBe(2);
  });

  it("日付として不正なものは null", () => {
    expect(gradeFromBirthDate("2019-02-30", TODAY)).toBeNull();
    expect(gradeFromBirthDate("", TODAY)).toBeNull();
    expect(gradeFromBirthDate("2019-06-01", "きょう")).toBeNull();
  });
});

describe("gradeLabel / gradeShortLabel", () => {
  it.each([
    [1, "小学1年生", "1年"],
    [4, "小学4年生", "4年"],
    [6, "小学6年生", "6年"],
    [7, "中学1年生", "中1"],
  ])("%i 年は「%s」/「%s」", (grade, label, short) => {
    expect(gradeLabel(grade)).toBe(label);
    expect(gradeShortLabel(grade)).toBe(short);
  });
});

describe("birthDateForGrade", () => {
  it.each(["2026-04-01", "2026-09-13", "2027-03-31"])(
    "基準日 %s で 1〜7 年を往復できる",
    (today) => {
      for (let grade = GRADE_MIN; grade <= GRADE_MAX; grade++) {
        expect(gradeFromBirthDate(birthDateForGrade(grade, today), today)).toBe(
          grade,
        );
      }
    },
  );
});

describe("parseBirthDate", () => {
  it("小学生の生年月日を受け付ける", () => {
    expect(parseBirthDate(" 2019-06-01 ", TODAY)).toEqual({
      ok: true,
      value: "2019-06-01",
    });
  });

  it("中学1年生の生年月日も受け付ける(#187)", () => {
    expect(parseBirthDate("2013-06-01", TODAY)).toEqual({
      ok: true,
      value: "2013-06-01",
    });
  });

  it("未入力・形式不正は入力を促す", () => {
    for (const value of ["", "2019/06/01", "2019-02-30", 20190601, null]) {
      const r = parseBirthDate(value, TODAY);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("生年月日を入力してください");
    }
  });

  it("受け付ける範囲の外は、範囲が分かる文言で拒否する", () => {
    expect(BIRTH_DATE_RANGE_ERROR).toBe(
      "生年月日は小学1年生〜中学1年生の範囲で入力してください",
    );
    // 入学前(0 年)と中学2年(8 年)の両端
    for (const value of ["2020-05-01", "2012-06-01"]) {
      const r = parseBirthDate(value, TODAY);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe(BIRTH_DATE_RANGE_ERROR);
    }
  });
});

describe("parseHeightCm", () => {
  it.each([HEIGHT_MIN, HEIGHT_MAX, 135])("%i cm は受け付ける", (value) => {
    expect(parseHeightCm(value)).toEqual({ ok: true, value });
  });

  it("数字文字列も受け付ける(input[type=number] の値)", () => {
    expect(parseHeightCm(" 150 ")).toEqual({ ok: true, value: 150 });
  });

  it.each([HEIGHT_MIN - 1, HEIGHT_MAX + 1, 135.5, Number.NaN])(
    "%s は拒否する",
    (value) => {
      const r = parseHeightCm(value);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("身長");
    },
  );

  it("未入力・数値でない値は拒否する", () => {
    for (const value of ["", null, undefined, "たかい"]) {
      expect(parseHeightCm(value).ok).toBe(false);
    }
  });
});
