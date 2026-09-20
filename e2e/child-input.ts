// 登録 API(POST /api/children)に渡す子ども情報のフィクスチャ。
// 学年は生年月日からサーバーが算出する(child-birthdate-height/plan.md 設計判断2)ため、
// 欲しい学年になる生年月日を Asia/Tokyo の「今日」から逆算する。
// E2E はワークスペースのパッケージに依存しないので、packages/api/src/grade-shared.ts の
// 規則(4月2日〜翌4月1日生まれが同学年)を最小限だけ写している

/** grade(1..7。7 = 中学1年生)になる生年月日 "YYYY-MM-DD" */
export function birthDateForGrade(
  grade: number,
  now: Date = new Date(),
): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month] = today.split("-").map(Number) as [number, number];
  const schoolYear = month >= 4 ? year : year - 1;
  // 4/2〜翌4/1 の真ん中(6/1)を選び、境界の判定に左右されないようにする
  return `${schoolYear - grade - 6}-06-01`;
}

/** 身長(cm)。80〜220 の整数であれば値そのものに意味はない */
export function heightForGrade(grade: number): number {
  return 110 + grade * 5;
}

/** 登録 API に渡す名前の4項目(child-name-split/plan.md 設計判断1・2) */
export interface ChildNameInput {
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
}

/**
 * 表示名("名簿 ab12" のような「姓 名」)から登録 API のフィールドを作る。
 * 画面に出るのは漢字のフルネーム(fullName)なので、期待値は表示名のまま使える。
 * よみはひらがな必須なので既定値を入れる。並び順(学年降順→姓のよみ→名のよみ)を
 * 検証したいテストは kana を「姓のよみ 名のよみ」で明示する
 */
export function childNameInput(
  display: string,
  kana = "てすと たろう",
): ChildNameInput {
  const [familyName, ...rest] = display.split(" ");
  const [familyNameKana, ...restKana] = kana.split(" ");
  return {
    familyName: familyName ?? display,
    givenName: rest.join(" ") || display,
    familyNameKana: familyNameKana ?? "てすと",
    givenNameKana: restKana.join(" ") || "たろう",
  };
}

/** API 応答の姓・名から表示名を組み立てる(packages/api の fullName と同じ規則) */
export function fullName(child: {
  familyName: string;
  givenName: string;
}): string {
  return `${child.familyName} ${child.givenName}`;
}
