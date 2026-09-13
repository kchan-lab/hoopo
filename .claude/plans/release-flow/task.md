# Task: ブランチ保護と release-please の導入

Issue: [#4](https://github.com/kchan-lab/hoopo/issues/4) / Plan: [plan.md](plan.md)

## release-please

- [x] `.github/workflows/release-please.yml` を作成(main への push で起動、`RELEASE_PLEASE_TOKEN` を使用)
- [x] `release-please-config.json` を作成(release-type: simple、PR タイトルは「release: vX.Y.Z」形式)
- [x] `.release-please-manifest.json` を作成(初期バージョン 0.0.0。`bump-minor-pre-major` で
      v1.0.0 は実戦投入時まで上げない)
- [x] **【承認者の作業】** fine-grained PAT を作成し、リポジトリ secret `RELEASE_PLEASE_TOKEN` に登録する
      (対象: kchan-lab/hoopo のみ / 権限: Contents=RW, Pull requests=RW / 期限は1年 → 2027-08頃に要更新)

## ルールセット(ブランチ保護)

- [x] `.github/rulesets/main.json` / `development.json` を作成(PR 必須・必須チェック
      lint / typecheck / test・force push 禁止・削除禁止。AI レビュー指摘を受けて2本に分割し、
      main のマージ方法を merge commit のみに制限)
- [x] リポジトリのマージ設定を確認・変更(squash / merge commit とも許可済みで変更不要だった)
- [x] PR マージ後、`gh api` でルールセットを適用する(protect-main / protect-development とも active)

## 検証

- [x] development へ直 push が拒否されることを確認(ダミーコミットで実際に試し、
      「Changes must be made through a pull request」で拒否された)
- [ ] 次に development→main のリリース PR を出した際、release-please が動くことを確認
      (release PR 起票 → CI 実行 → マージでタグ + Release + CHANGELOG)
- [ ] リリース後に main→development の back-merge PR を出す

## 仕上げ

- [x] docs/DEVELOPMENT.md の記述と実装の食い違いがないか確認(リリース手順の実際
      — merge commit でのマージと back-merge 運用 — を追記した)
- [x] PR 作成 → CI グリーン → development へマージ(PR #45。squash の予定が merge commit で
      マージされたが実害なし — 次回から Squash and merge を選ぶこと)
