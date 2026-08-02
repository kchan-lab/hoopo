# Plan: Projects 運用の自動化(PR auto-assign・Status の自動遷移)

Issue: [#35](https://github.com/kchan-lab/hoopo/issues/35)
設計の正: docs/DEVELOPMENT.md フェーズ0 / 参考: palworld-status-bot の pr-auto-assign.yml

## 目的

ボードの手作業(Assignee 設定・Status 移動)を自動化し、Issue ドリブン運用の抜け漏れをなくす。

## 方針

遷移ごとに最適な実行主体が異なるため、3つの手段を使い分ける。

| 遷移 | 手段 |
|---|---|
| PR 作成 → 作者を Assignee | GitHub Actions(`pr-auto-assign.yml`、標準トークンで可) |
| 着手 → In Progress | issue-plan Skill(ローカル gh で `gh project item-edit`) |
| PR 作成 → In Review | create-pr Skill(同上) |
| Issue クローズ → Done | Projects 組み込みワークフロー(**確認済み・すでに有効**。#1・#5 で動作を確認) |

### 設計判断

1. **In Progress / In Review は Actions でなく Skill + ローカル gh で行う**: Project #13 は
   org プロジェクトのため Actions の標準トークンでは触れず、Actions 案は PAT の発行・保管が
   必要になる。この運用で PR を開くのは Claude(ローカル)だけなので、Skill に組み込めば
   トークン追加ゼロで同じ結果が得られる。PAT 案は退けた(Renovate / release-please の PR は
   Issue に紐づかないため取りこぼしも実害なし)
2. **ID をSkillに直書きする**: 汎用化のための動的取得はコマンドが長くなるだけなので、
   Project #13 の projectId / Status フィールド / オプション ID を Skill に記載する
   (チーム横展開時はそのチームの Project で取り直す)

## 完了条件

- PR を開くと作者が Assignee に設定される(次の PR で確認)
- Issue 着手時に In Progress、PR 作成時に In Review へ遷移する手順が Skill に載っている
- Issue クローズで Done になる(確認済み)
