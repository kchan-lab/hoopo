# Task: 参加できる時間帯を、曜日未選択でも入力できる形に直す

Issue: [#179](https://github.com/kchan-lab/hoopo/issues/179) / Plan: [plan.md](plan.md)

- [x] portal: 登録②(状態の分割・常時表示・チェックの出し分け・行の出し分け)
- [x] portal: 家族の設定の編集を同じ形にそろえる
- [x] portal: globals.css(必要なら)
- [x] docs: REQUIREMENTS §3・§4.2-9、child-availability-slots/plan.md の設計判断2・3 に改訂の追記
- [x] test: Unit(送る値の組み立て)
- [x] test: Integration(既定のまま登録すると全曜日 09:00〜12:00)
- [x] test: E2E(曜日未選択の見た目・チェックの出し分け・外すと行が出る・家族の設定)
- [x] 画面のスクリーンショットを承認者に見せる(mobile。マージ承認の前)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #179`)
