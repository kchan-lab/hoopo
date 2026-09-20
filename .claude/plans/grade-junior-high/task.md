# Task: 中学1年生を登録できるようにし、卒団を手動にする

Issue: [#187](https://github.com/kchan-lab/hoopo/issues/187) / Plan: [plan.md](plan.md)

- [x] db: 学年の CHECK 制約の有無を確認し、あればマイグレーション
- [x] api: `GRADE_MAX` を 7 に。`gradeLabel` / `gradeShortLabel` を共通化。検証の文言
- [x] api: 年度更新(学年+1のみ・7 は据え置き・アーカイブしない)。取り消しはそのまま
- [x] api: 手動の卒団(members.ts + admin-app.ts。実行ログ)
- [x] portal: 学年の表示を共通関数に。入力中のヒントの文言
- [x] admin: 部員管理の表示・編集の文言、卒団の操作、年度更新の確認と説明文
- [x] docs: REQUIREMENTS §3 / §5.2 / §7
- [x] test: Unit(学年の算出・表示・振り分け)
- [x] test: Integration(年度更新がアーカイブしない・7 は据え置き・手動の卒団)
- [x] test: E2E(中1の登録・学年の表示・手動の卒団・年度更新)
- [x] 画面のスクリーンショットを承認者に見せる(mobile + 管理画面。マージ承認の前)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #187`)
