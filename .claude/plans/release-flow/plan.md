# Plan: ブランチ保護と release-please の導入

Issue: [#4](https://github.com/kchan-lab/hoopo/issues/4)
設計の正: docs/DEVELOPMENT.md「ブランチ戦略・リリースフロー」

## 目的

main / development への直 push を GitHub 側で禁止し(CI グリーンの PR だけがマージされる状態)、
release-please によるタグ・GitHub Release・CHANGELOG の自動生成を導入する。

## 方針

```
feat/xxx ──squash PR──▶ development ──リリースPR(merge commit)──▶ main
                                                                  │ push を検知
                                                                  ▼
                                              release-please が「release: vX.Y.Z」PR を起票
                                                                  │ マージ
                                                                  ▼
                                              vX.Y.Z タグ + GitHub Release + CHANGELOG 更新
                                              (その後 main → development へ back-merge PR)
```

対象は3つ:

1. **ルールセット**: main / development を対象に「PR 必須・必須チェック(lint / typecheck / test)・
   force push 禁止・削除禁止」を1本のルールセットで適用。適用は `gh api` で行い、
   設定 JSON を `.github/rulesets/branches.json` としてリポジトリに記録する(再現・監査用)
2. **release-please**: `.github/workflows/release-please.yml`(main への push で起動)+
   `release-please-config.json` / `.release-please-manifest.json`
3. **リポジトリのマージ設定**: squash(feat→development 用)と merge commit(development→main 用)の
   両方を許可する

### 設計判断

1. **classic branch protection ではなくルールセットを使う**: 複数ブランチを1本で保護でき、
   設定を JSON としてエクスポートしてリポジトリに記録できる。classic はレガシーで API 形式も冗長
2. **必須チェックは ci.yml の3ジョブ(lint / typecheck / test)のみ**: ci.yml はこの用途のために
   3ジョブ並列で設計済み(ci.yml 冒頭コメント)。Claude PR Review は助言であり必須にしない。
   承認レビュー数は 0(1人開発。レビューは Claude Action と自分の確認で担保)
3. **release-please は main 側で回す**: dev→main のリリース PR がマージされると、release-please が
   main 上の Conventional Commits からバージョンを計算して「release: vX.Y.Z」PR を起票する方式。
   「リリース PR 自体を release-please に作らせる(dev→main)」は release-please が
   クロスブランチ PR をサポートしないため不可
4. **development→main は merge commit、feat→development は squash**: dev→main を squash すると
   個々の `feat:` / `fix:` コミットが main の履歴から消え、release-please のバージョン計算が
   壊れる(1コミット分しか読まれない)うえ、履歴が分岐して次回のリリース PR が競合する
5. **release-type は `simple`(ルート単位・version.txt + CHANGELOG.md)**: npm に publish する
   パッケージが無いため per-package バージョニング(node / manifest 分割)は不要。
   バージョンは「アプリ全体の版」として1本で扱う
6. **release-please には fine-grained PAT(`RELEASE_PLEASE_TOKEN`)を使う**: デフォルトの
   `GITHUB_TOKEN` が作る PR では CI が起動せず(GitHub の仕様)、必須チェックが永遠に
   完了しないためマージ不能になる。GitHub App 方式は1人開発にはセットアップ過剰
7. **リリース後の main→development back-merge は当面手動(PR)**: CHANGELOG / version.txt の
   コミットが main にしか無い状態を放置すると次回リリース PR が競合する。リリース頻度が
   上がったら Actions で自動起票に切り替える

## この Issue でやらないこと(意図的な非対象)

- リリース PR でのフル E2E 実行(Issue #3 の task.md から持ち越し。Issue #4 内の後続タスクとする)
- リリース完了・CI 失敗の Discord Webhook 通知(別 Issue に切り出す)
- Claude Code Action の AI レビュー … 導入済み(claude-review.yml / claude.yml)。受入条件は満たしている

## 完了条件

- development / main への直 push が GitHub に拒否される(実際に push して確認)
- CI が通っていない PR はマージボタンが無効になる
- main へのマージ後に release-please が「release: vX.Y.Z」PR を起票し、その PR で CI が走る
- release PR のマージで vX.Y.Z タグ + GitHub Release + CHANGELOG 更新が行われる
