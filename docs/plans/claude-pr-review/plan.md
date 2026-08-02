# Plan: Claude PR 自動レビューの導入

Issue: [#4](https://github.com/kchan-lab/hoopo/issues/4)(受入条件「Claude Code Action によるAIレビューがPRで動く」の部分)
設計の正: docs/DEVELOPMENT.md「Claude Code の回し方のコツ」/ 参考: palworld-status-bot の claude-review.yml

## 目的

PR を開くと Claude が自動でレビューコメントを付け、`@claude` メンションで追加の対話ができるようにする。
承認者がマージ判断する際の材料を増やし、レビュー観点の抜けを防ぐ。

## 方針

palworld-status-bot で実績のある2ワークフロー構成を移植する。

- `claude-review.yml`: PR オープン時に1回だけ自動レビュー(push ごとには走らせず Actions 無料枠を節約)
- `claude.yml`: `@claude` メンションで応答(再レビュー・対話用)

### 設計判断

1. **レビュー観点を hoopo 用に差し替え**: palworld の8観点をベースに、CLAUDE.md 絶対原則
   (無料枠・LINE通数・個人情報最小保持・team_id+RLS・UI分離・決済禁止)の準拠チェックを追加。
   このリポジトリ固有のリスクは一般的なバグより原則違反にあるため
2. **マージ判断はさせない**: 4段階承認制(.claude/skills/)と同じ思想。AI は材料の提示まで

## 完了条件

- PR を開くと claude[bot] のレビューコメントが自動で付く
- PR コメントで `@claude` に返信すると反応する
- Secrets `CLAUDE_CODE_OAUTH_TOKEN` の登録(**ユーザー作業**: Settings 系のため)
