# Task: Projects 運用の自動化

Issue: [#35](https://github.com/kchan-lab/hoopo/issues/35) / Plan: [plan.md](plan.md)

- [x] `.github/workflows/pr-auto-assign.yml`(palworld から移植)
- [x] issue-plan Skill に「着手時 In Progress 遷移」の手順とコマンドを追加
- [x] create-pr Skill に「PR 作成時 In Review 遷移」の手順を追加
- [x] Issue クローズ → Done の組み込みワークフローが有効なことを確認(#1・#5 で確認)
- [x] auto-add が拾わなかった場合の手動追加(`gh project item-add`)を手順化(#35 で実施)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #35`)
- [ ] マージ後、次の PR で auto-assign の動作を確認
