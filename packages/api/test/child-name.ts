// Integration テスト用の子ども名フィクスチャ(child-name-split/plan.md 設計判断1・2)。
// children は姓・名とそれぞれの読みを別々に持ち、一覧の並びは
// 学年降順 → 姓のよみ → 名のよみ(五十音順)で決まる。
// テストは従来どおり "粉浜 太郎" の1文字列で子どもを指定できたほうが読みやすいので、
// よみはここの対応表から引く。未知の名前は黙って並びを崩さないよう例外にする。

const FAMILY_KANA: Record<string, string> = {
  粉浜: "こはま",
  中一: "ちゅういち",
  北粉浜: "きたこはま",
  在籍: "ざいせき",
  卒団: "そつだん",
  無効: "むこう",
  他: "ほか",
  他団: "ただん",
  他町: "たまち",
  他チーム: "ほかちーむ",
  越境: "えっきょう",
  山田: "やまだ",
  田中: "たなか",
  佐藤: "さとう",
  鈴木: "すずき",
};

const GIVEN_KANA: Record<string, string> = {
  太郎: "たろう",
  一郎: "いちろう",
  二郎: "じろう",
  三郎: "さぶろう",
  四郎: "しろう",
  次郎: "じろう",
  花子: "はなこ",
  蓮: "れん",
  一年: "いちねん",
  五年: "ごねん",
  六年: "ろくねん",
  中一: "ちゅういち",
  予定: "よてい",
  卒郎: "そつろう",
  無郎: "むろう",
};

export interface ChildNameParts {
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
}

/** "粉浜 太郎"(半角スペース区切り)→ 姓・名とそれぞれのよみ */
export function childNameParts(name: string): ChildNameParts {
  const [familyName, givenName] = name.split(" ");
  const familyNameKana = familyName ? FAMILY_KANA[familyName] : undefined;
  const givenNameKana = givenName ? GIVEN_KANA[givenName] : undefined;
  if (!familyName || !givenName || !familyNameKana || !givenNameKana) {
    throw new Error(
      `よみが未登録の名前です(packages/api/test/child-name.ts に足してください): ${name}`,
    );
  }
  return { familyName, givenName, familyNameKana, givenNameKana };
}
