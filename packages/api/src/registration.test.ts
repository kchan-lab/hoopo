import { describe, expect, it } from "vitest";
import { birthDateForGrade } from "./grade-shared";
import {
  buildAvailabilities,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  fullName,
  nameInitial,
  parseChildPatch,
  parseLink,
  parseRegistration,
  sameTimeNote,
} from "./registration-shared";

// 入力境界の検証(REQUIREMENTS §3 の項目だけを受け付け、それ以外は 400 に落とす)。
// 学年は生年月日から算出するので、テストの生年月日は「今日」から逆算して固定する

const valid = {
  children: [
    {
      familyName: " 山田 ",
      givenName: " 太郎 ",
      familyNameKana: "やまだ",
      givenNameKana: "たろう",
      nicknameKana: "たろう",
      birthDate: birthDateForGrade(4),
      heightCm: 135,
      gender: "male",
    },
    {
      familyName: "山田",
      givenName: "花子",
      familyNameKana: "やまだ",
      givenNameKana: "はなこ",
      nicknameKana: "",
      birthDate: birthDateForGrade(2),
      heightCm: 120,
      gender: "female",
    },
  ],
  relation: "father",
  availabilities: [
    { weekday: 6, startTime: "09:00", endTime: "12:00" },
    { weekday: 0, startTime: "13:00", endTime: "17:00" },
  ],
  coachNote: "  ",
};

describe("parseRegistration", () => {
  it("正常入力を正規化する(trim・空文字→null・曜日の昇順)", () => {
    const r = parseRegistration(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.children[0]?.familyName).toBe("山田");
    expect(r.value.children[0]?.givenName).toBe("太郎");
    expect(r.value.children[0]?.familyNameKana).toBe("やまだ");
    expect(r.value.children[0]?.givenNameKana).toBe("たろう");
    expect(r.value.children[0]?.birthDate).toBe(birthDateForGrade(4));
    expect(r.value.children[0]?.heightCm).toBe(135);
    expect(r.value.children[1]?.nicknameKana).toBeNull();
    expect(r.value.availabilities).toEqual([
      { weekday: 0, startTime: "13:00", endTime: "17:00" },
      { weekday: 6, startTime: "09:00", endTime: "12:00" },
    ]);
    expect(r.value.coachNote).toBeNull();
  });

  it.each([
    ["子ども0人", { ...valid, children: [] }, "1人以上"],
    [
      "姓なし",
      { ...valid, children: [{ ...valid.children[0], familyName: "" }] },
      "1人目の姓を入力してください",
    ],
    [
      "名なし",
      { ...valid, children: [{ ...valid.children[0], givenName: " " }] },
      "1人目の名を入力してください",
    ],
    [
      "姓が長い",
      {
        ...valid,
        children: [{ ...valid.children[0], familyName: "あ".repeat(26) }],
      },
      "1人目の姓は25文字以内で入力してください",
    ],
    [
      "名が長い",
      {
        ...valid,
        children: [{ ...valid.children[0], givenName: "あ".repeat(26) }],
      },
      "1人目の名は25文字以内で入力してください",
    ],
    [
      "姓のよみなし",
      { ...valid, children: [{ ...valid.children[0], familyNameKana: "" }] },
      "1人目の姓のよみを入力してください",
    ],
    [
      "姓のよみが漢字",
      {
        ...valid,
        children: [{ ...valid.children[0], familyNameKana: "山田" }],
      },
      "1人目の姓のよみをひらがなで入力してください",
    ],
    [
      "名のよみがカタカナ",
      {
        ...valid,
        children: [{ ...valid.children[0], givenNameKana: "タロウ" }],
      },
      "1人目の名のよみをひらがなで入力してください",
    ],
    [
      "よみが濁点だけ(基底文字がない)",
      {
        ...valid,
        children: [{ ...valid.children[0], givenNameKana: "\u3099" }],
      },
      "1人目の名のよみをひらがなで入力してください",
    ],
    [
      "名のよみに空白が混ざる",
      {
        ...valid,
        children: [{ ...valid.children[0], givenNameKana: "た ろう" }],
      },
      "1人目の名のよみをひらがなで入力してください",
    ],
    [
      "よみの長音・濁点は通る",
      {
        ...valid,
        children: [
          {
            ...valid.children[0],
            familyNameKana: "おおのー",
            // 「ゔ」(U+3094)も通す(レビュー指摘 #158)
            givenNameKana: "ゔぁいおれっと",
          },
        ],
      },
      null,
    ],
    [
      "中学1年生は受け付ける(#187)",
      {
        ...valid,
        children: [{ ...valid.children[0], birthDate: birthDateForGrade(7) }],
      },
      null,
    ],
    [
      "受け付ける学年にならない生年月日",
      {
        ...valid,
        children: [{ ...valid.children[0], birthDate: birthDateForGrade(8) }],
      },
      "小学1年生〜中学1年生",
    ],
    [
      "生年月日なし",
      {
        ...valid,
        children: [{ ...valid.children[0], birthDate: undefined }],
      },
      "生年月日",
    ],
    [
      "身長範囲外",
      { ...valid, children: [{ ...valid.children[0], heightCm: 79 }] },
      "身長",
    ],
    [
      "性別不正",
      { ...valid, children: [{ ...valid.children[0], gender: "x" }] },
      "性別",
    ],
    ["続柄不正", { ...valid, relation: "uncle" }, "続柄"],
    ["曜日なし", { ...valid, availabilities: [] }, "曜日"],
    [
      "曜日範囲外",
      {
        ...valid,
        availabilities: [{ weekday: 7, startTime: "09:00", endTime: "12:00" }],
      },
      "曜日",
    ],
    [
      "曜日の重複",
      {
        ...valid,
        availabilities: [
          { weekday: 6, startTime: "09:00", endTime: "12:00" },
          { weekday: 6, startTime: "13:00", endTime: "15:00" },
        ],
      },
      "重複",
    ],
    [
      "時刻形式",
      {
        ...valid,
        availabilities: [{ weekday: 6, startTime: "9:00", endTime: "12:00" }],
      },
      "HH:MM",
    ],
    [
      "開始≧終了",
      {
        ...valid,
        availabilities: [{ weekday: 6, startTime: "17:00", endTime: "09:00" }],
      },
      "後に",
    ],
    ["伝達事項が長い", { ...valid, coachNote: "あ".repeat(501) }, "500文字"],
    ["余計な項目は無視される", { ...valid, phone: "090" }, null],
  ])("%s", (_label, body, expectedError) => {
    const r = parseRegistration(body);
    if (expectedError === null) {
      expect(r.ok).toBe(true);
    } else {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(expectedError);
    }
  });
});

describe("parseLink", () => {
  it("招待コードを正規化して受け付ける", () => {
    const r = parseLink({ code: " mh7k4-2qd9x ", relation: "mother" });
    expect(r).toEqual({
      ok: true,
      value: { code: "MH7K42QD9X", relation: "mother" },
    });
  });

  it("形式不正・続柄不正は拒否する", () => {
    expect(parseLink({ code: "MH7K", relation: "mother" }).ok).toBe(false);
    expect(parseLink({ code: "MH7K42QD9X", relation: "" }).ok).toBe(false);
  });
});

describe("parseChildPatch", () => {
  it("渡した項目だけを取り出す", () => {
    const r = parseChildPatch({ heightCm: "142" });
    expect(r).toEqual({ ok: true, value: { heightCm: 142 } });
  });

  it("呼び名は空文字で消せる(null になる)", () => {
    expect(parseChildPatch({ nicknameKana: "" })).toEqual({
      ok: true,
      value: { nicknameKana: null },
    });
  });

  it("項目が1つも無ければ拒否する", () => {
    const r = parseChildPatch({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("変更する項目");
  });

  it.each([
    ["姓が空", { familyName: " " }, "姓を入力してください"],
    ["名が空", { givenName: "" }, "名を入力してください"],
    [
      "名が長い",
      { givenName: "あ".repeat(26) },
      "名は25文字以内で入力してください",
    ],
    ["姓のよみが空", { familyNameKana: "" }, "姓のよみを入力してください"],
    [
      "名のよみがひらがなでない",
      { givenNameKana: "Taro" },
      "名のよみをひらがなで入力してください",
    ],
    ["生年月日が不正", { birthDate: "2019/06/01" }, "生年月日"],
    [
      "受け付ける学年にならない",
      { birthDate: birthDateForGrade(0) },
      "小学1年生〜中学1年生",
    ],
    ["身長が範囲外", { heightCm: 221 }, "身長"],
    ["性別が不正", { gender: "x" }, "性別"],
  ])("%s は拒否する", (_label, body, expected) => {
    const r = parseChildPatch(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });
});

// 画面(登録② / 家族の設定)が持つ3つの状態から送る値を組み立てる部分
// (availability-common-time/plan.md 設計判断4・5)。画面の中に閉じていると検証できないので純関数にした
describe("buildAvailabilities", () => {
  const commonTime = {
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
  };

  it("何も触らないと、選んだ全曜日が既定の時間になる(曜日の昇順)", () => {
    expect(
      buildAvailabilities({
        weekdays: [6, 0],
        commonTime,
        sameTime: true,
        perWeekdayTimes: {},
      }),
    ).toEqual([
      { weekday: 0, startTime: "09:00", endTime: "12:00" },
      { weekday: 6, startTime: "09:00", endTime: "12:00" },
    ]);
  });

  it("チェックが入っているあいだは、曜日ごとの時間を無視して共通の時間を使う", () => {
    expect(
      buildAvailabilities({
        weekdays: [0, 6],
        commonTime: { startTime: "10:00", endTime: "11:30" },
        sameTime: true,
        perWeekdayTimes: { 6: { startTime: "13:00", endTime: "15:00" } },
      }),
    ).toEqual([
      { weekday: 0, startTime: "10:00", endTime: "11:30" },
      { weekday: 6, startTime: "10:00", endTime: "11:30" },
    ]);
  });

  it("チェックを外していれば曜日ごとの時間を使う", () => {
    expect(
      buildAvailabilities({
        weekdays: [0, 6],
        commonTime,
        sameTime: false,
        perWeekdayTimes: {
          0: { startTime: "09:00", endTime: "12:00" },
          6: { startTime: "13:00", endTime: "15:00" },
        },
      }),
    ).toEqual([
      { weekday: 0, startTime: "09:00", endTime: "12:00" },
      { weekday: 6, startTime: "13:00", endTime: "15:00" },
    ]);
  });

  it("チェックを外したあとに選び足した曜日は共通の時間で埋める(設計判断5)", () => {
    expect(
      buildAvailabilities({
        weekdays: [0, 3],
        commonTime: { startTime: "18:00", endTime: "20:00" },
        sameTime: false,
        perWeekdayTimes: { 0: { startTime: "09:00", endTime: "12:00" } },
      }),
    ).toEqual([
      { weekday: 0, startTime: "09:00", endTime: "12:00" },
      { weekday: 3, startTime: "18:00", endTime: "20:00" },
    ]);
  });

  it("曜日が0件なら空になる(サーバーが「曜日を1つ以上」で弾く)", () => {
    const slots = buildAvailabilities({
      weekdays: [],
      commonTime,
      sameTime: true,
      perWeekdayTimes: {},
    });
    expect(slots).toEqual([]);
    const r = parseRegistration({ ...valid, availabilities: slots });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("参加できる曜日を1つ以上");
  });
});

describe("sameTimeNote", () => {
  it("選んだ曜日を並べる", () => {
    expect(sameTimeNote([6, 0])).toBe("日・土 に同じ時間を使います");
  });

  it("曜日が1つなら「同じ」を落とす(比べる相手が無いため)", () => {
    expect(sameTimeNote([3])).toBe("水 にこの時間を使います");
  });

  it("曜日が0件なら何も言わない(チェックボックス自体を出さない)", () => {
    expect(sameTimeNote([])).toBe("");
  });
});

describe("fullName / nameInitial", () => {
  it("フルネームは半角スペース1つでつなぐ(設計判断3)", () => {
    expect(fullName({ familyName: "粉浜", givenName: "太郎" })).toBe(
      "粉浜 太郎",
    );
  });

  it("頭文字アバターは姓の先頭1文字(サロゲートペアも1文字として扱う)", () => {
    expect(nameInitial({ familyName: "北粉浜" })).toBe("北");
    expect(nameInitial({ familyName: "𠮷田" })).toBe("𠮷");
  });
});
