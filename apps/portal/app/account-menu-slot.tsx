import {
  listChildrenForGuardian,
  nameInitial,
  type SessionPayload,
} from "@hoopo/api";
import { AccountMenu } from "./account-menu";

// 右上の丸(メニュー)を、保護者がログインして見る全画面のヘッダーに置くための部品
// (family-settings-entry/plan.md 設計判断6)。
// 頭文字には「先頭のお子さんの姓の1文字」が要るので、その取得をここ1か所にまとめ、
// 各画面は 1 行置くだけにする。
//
// 呼び方は2通り:
//   - `initial`: すでにお子さんを取っている画面(ホーム・提出・月謝・家族の設定)は
//     その1人目を渡す。同じ問い合わせを画面ごとに増やさないため
//   - `session`: お子さんを持っていない画面(日程・チーム・お知らせ・練習の詳細・
//     出場メンバー)はセッションを渡し、ここで1回だけ取る
//
// お子さんが1人もいないときは何も出さない(頭文字が作れない空の丸を押せる形で置いても
// 何のボタンか伝わらない。設計判断1と同じ)。
// `/privacy`(未ログインでも開く)と `/register`(まだお子さんがいない)は対象外。

export async function AccountMenuSlot(
  props: { initial: string } | { session: SessionPayload },
) {
  if ("initial" in props) return <AccountMenu initial={props.initial} />;
  const children = await listChildrenForGuardian(
    props.session.teamId,
    props.session.sub,
  );
  const first = children[0];
  if (!first) return null;
  return <AccountMenu initial={nameInitial(first)} />;
}
