# Task: 参加予定の提出に確認画面を挟む

Issue: [#176](https://github.com/kchan-lab/hoopo/issues/176) / Plan: [plan.md](plan.md)

- [x] docs: REQUIREMENTS §4.2-6(提出の前に確認を挟むこと・未回答の強調)
- [x] api: 未回答の件数を数える純関数(必要なら attendances-shared に。既存の数え方とそろえる)
- [x] portal: 編集/確認の表示切替、確認の一覧、未回答の強調、「修正する」で戻る
- [x] portal: globals.css(確認行・未回答の強調)
- [x] test: Unit(未回答件数・文言の出し分け)
- [x] test: Integration(PUT /api/attendance の契約が変わっていないこと。契約は無改変なので既存の attendance-portal.int.test.ts をそのまま通す)
- [x] test: E2E(確認へ切り替わる / 未回答が分かる / 戻っても消えない / 提出できる)
- [x] 画面のスクリーンショットを承認者に見せる(mobile。マージ承認の前)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #176`)
