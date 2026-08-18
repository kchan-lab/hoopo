# Task: リリース PR でのフル E2E 実行(+nightly)

Issue: [#4](https://github.com/kchan-lab/hoopo/issues/4) / Plan: [plan.md](plan.md)

## 実装

- [ ] `.github/workflows/e2e.yml` を作成(pull_request→main / schedule 03:00 JST / workflow_dispatch、
      compose の e2e プロファイルで実行、失敗時はトレース・レポートを artifact 保存)
- [ ] `.github/rulesets/main.json` の必須チェックに `e2e` を追加(適用はマージ後の動作確認後)
- [ ] docs/DEVELOPMENT.md と記述の食い違いがないか確認

## 検証

- [ ] ローカルで `pnpm test:e2e` がグリーンのままであることを確認(コマンド共通のため)
- [ ] 前回持ち越し分: `.claude/plans/release-flow/task.md` の完了済みチェックを更新して同乗させる
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes` は付けない)
- [ ] マージ後、workflow_dispatch で e2e.yml を手動実行し 4 tests passed を確認
- [ ] protect-main ルールセットを更新版で再適用(`gh api PUT`)し、必須チェックに `e2e` が
      入ったことを確認
- [ ] Issue #4 の受入条件を見直して手動クローズ(ボードの Done は自動)
- [ ] 翌日、nightly の初回実行が成功したことを確認
