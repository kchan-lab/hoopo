# Task: 参加可能な時間帯を曜日ごとに設定できるようにする

Issue: [#170](https://github.com/kchan-lab/hoopo/issues/170) / Plan: [plan.md](plan.md)

## 実装(feat/child-availability-slots)

- [x] docs: REQUIREMENTS §3(登録②の入力項目)・§4.2-9(家族の設定で直せる項目)
- [x] api: `registration-shared.ts` の `RegistrationInput` を枠の配列に。検証(枠ごとに開始 < 終了、
      曜日の重複を弾く、曜日 0 件は 400)。目安の文言を定数化
- [x] api: `ChildPatch` に枠を追加し、`applyChildPatch` で差し替え(delete → insert)。
      家族の設定の取得(`listFamily` 相当)に枠を含める
- [x] api: `registration.ts` の登録時 insert を枠ごとの値に(兄弟全員に同じ枠を入れる挙動は維持)
- [x] portal: 登録②(曜日に連動する行・「すべての曜日に同じ時間を使う」・目安の文言)
- [x] portal: 登録③(確認画面を曜日ごとの一覧に)
- [x] portal: 家族の設定(参加可能曜日・時間の表示と編集・目安の文言)
- [x] test: Unit(枠の検証)
- [x] test: Integration(登録で枠の数だけ行が入る・既定のまま登録・編集で差し替わる)
- [x] test: E2E(曜日ごとに違う時間で登録 → 確認画面 → 管理画面の部員詳細 → 家族の設定で直す)
- [ ] 画面のスクリーンショットを承認者に見せる(mobile。マージ承認の前)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #170`)

## 確認

- [x] `packages/db` に差分が無いこと(マイグレーション無し)
- [x] 管理画面は無変更で複数枠が読めること
