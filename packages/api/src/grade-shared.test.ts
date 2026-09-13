import { describe, expect, it } from "vitest";
import {
  birthDateForGrade,
  gradeFromBirthDate,
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
  ])("%s 生まれは %i 年", (birthDate, grade) => {
    expect(gradeFromBirthDate(birthDate, TODAY)).toBe(grade);
  });

  it("入学前・卒業後は null", () => {
    // 2020-05-01 生まれは 0 年、2014-04-01 生まれは 7 年にあたる
    expect(gradeFromBirthDate("2020-05-01", TODAY)).toBeNull();
    expect(gradeFromBirthDate("2014-04-01", TODAY)).toBeNull();
    expect(gradeFromBirthDate("2014-04-02", TODAY)).toBe(6);
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

describe("birthDateForGrade", () => {
  it.each(["2026-04-01", "2026-09-13", "2027-03-31"])(
    "基準日 %s で 1〜6 年を往復できる",
    (today) => {
      for (let grade = 1; grade <= 6; grade++) {
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

  it("未入力・形式不正は入力を促す", () => {
    for (const value of ["", "2019/06/01", "2019-02-30", 20190601, null]) {
      const r = parseBirthDate(value, TODAY);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("生年月日を入力してください");
    }
  });

  it("小学生にならない生年月日は拒否する", () => {
    const r = parseBirthDate("2020-05-01", TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("小学生の生年月日を入力してください");
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
