"use client";

import { gradeFromBirthDate } from "@hoopo/api/grade-shared";

// 生年月日の入力欄に添える学年の表示(child-birthdate-height/plan.md 設計判断4)。
// 学年は選ばせず生年月日から決まるので、入力中にその場で結果が見えないと
// 「何年生として登録されるのか」が分からない。初回登録①と家族の設定の両方で使う。
// ここに出るのは目安で、保存する学年の正はサーバー(同じ純関数で算出する)

/** 生年月日が未入力のときに出す説明。空欄をエラー扱いしない(絶対原則2) */
const EMPTY_HINT = "生年月日から学年を決めます";
/** 小学生にならない生年月日。サーバー(parseBirthDate)と同じ文言 */
const OUT_OF_RANGE_HINT = "小学生の生年月日を入力してください";

export function GradeHint({
  birthDate,
  today,
}: {
  birthDate: string;
  today: string;
}) {
  if (birthDate === "") return EMPTY_HINT;
  const grade = gradeFromBirthDate(birthDate, today);
  if (grade === null) return OUT_OF_RANGE_HINT;
  return <span className="pill">小学{grade}年生</span>;
}
