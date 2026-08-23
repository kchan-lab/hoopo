# Task: Supabase 停止対策 ping ジョブ

Issue: [#54](https://github.com/kchan-lab/hoopo/issues/54) / Plan: [plan.md](plan.md)

- [x] `.github/workflows/supabase-ping.yml` を作成(毎日 6:23 JST + workflow_dispatch、
      `SELECT 1` ping、未設定スキップ、失敗時 Discord 通知)
- [x] 検証(ローカル): ping スクリプト部を bash で単体実行 — 未設定スキップ / ローカル DB 成功 /
      到達不能 URL 失敗+exit 1 の3パターン。YAML は構文チェック
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #54`)
- [ ] マージ後: workflow_dispatch で手動実行し、シークレット未設定スキップでグリーン完走を確認
      (e2e-check Skill「CI 変更はマージ後に実行結果を確認」)
- [ ] #55 完了後(承認者のシークレット設定後): `STG_PING_DATABASE_URL` / `PROD_PING_DATABASE_URL`
      で実 ping がグリーンになることを確認(Discord 通知は #10 完了後に `DISCORD_WEBHOOK_URL` を設定)
