# Task: Claude PR 自動レビューの導入

Issue: [#4](https://github.com/kchan-lab/hoopo/issues/4) / Plan: [plan.md](plan.md)

- [x] `.github/workflows/claude-review.yml`(PR オープン時の自動レビュー、hoopo 観点)
- [x] `.github/workflows/claude.yml`(`@claude` メンション応答)
- [ ] Secrets `CLAUDE_CODE_OAUTH_TOKEN` の登録(**ユーザー作業**、`claude setup-token` で発行)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(Refs #4。#4 のクローズはブランチ保護・release-please 完了時)
- [ ] マージ後、次の PR で claude[bot] のレビューが付くことを確認
