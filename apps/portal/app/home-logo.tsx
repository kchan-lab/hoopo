import Link from "next/link";

// 左上のチームのマーク(SKC の丸)を、保護者がログインして見る全画面のヘッダーに置くための部品
// (family-settings-entry/plan.md 設計判断7)。
//
// - チーム名は出さない。モバイル幅で見出しと並べると、名前まで入れると窮屈になる
// - 押すとホームへ戻る。左上のロゴを押すと最初の画面、という慣習に合わせる
// - 見出しの中にある戻る矢印(`‹`)はそのまま残す。あれは「1つ前」で役割が違う
//
// 見た目はホーム(`.team-head`)のマークと同じ `.logo` を使い、ヘッダー用に一段小さくする
// (`.logo.sm`)。`/privacy`(未ログインでも開く)と `/register`(登録の途中)は対象外。

export function HomeLogo() {
  return (
    <Link href="/" className="logo sm" aria-label="ホーム">
      SKC
    </Link>
  );
}
