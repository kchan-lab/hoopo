---
name: issue-plan
description: Issue ドリブン開発でプランを書くときに必ず読む哲学とテンプレート。Issue 着手時に docs/plans/<slug>/plan.md と task.md を作成する運用を定める(PR の出し方は create-pr Skill)。「Issueに着手」「プラン作成」「plan.md」「task.md」で発動。
---

# issue-plan: Issue ドリブン開発のプラン運用

## 哲学

- **Issue は What/Why、plan.md は How、task.md は進捗。** Issue に実装詳細を書き込まない。
  Issue の型は `.github/ISSUE_TEMPLATE/task.md`(目的/参照/作業内容/受入条件)が正。
  実装方針と設計判断は plan.md に、作業の分解と消化状況は task.md に置く。
- **実装前に書く。** コードを書き始める前に plan.md / task.md を作成する。
  書けないなら方針が固まっていない証拠であり、先に調査や壁打ちに戻る。
- **設計判断には「なぜ」を残す。** 何をするかだけでなく、なぜその方式か・
  退けた代替案とその理由を1〜2行でよいので書く。半年後の自分が読む前提。
- **設計の正(source of truth)を明記する。** hoopo では CLAUDE.md(絶対原則)と
  `docs/REQUIREMENTS.md` / `docs/DESIGN_GUIDELINES.md` / `docs/DEVELOPMENT.md` が正。
  plan.md はこれらと矛盾しないこと。矛盾が必要なら先にドキュメントを直す(仕様変更はドキュメント先行)。
- **機能変更とリファクタリングを混ぜない。** 1 Issue = 1 関心事。混ざるなら Issue を分ける。
- **プランは Git にコミットする。** 計画も成果物。履歴に残し、Issue からリンクできるようにする。
- **development / main は常に green。** 直 push しない。CI を通った PR だけがマージされる。

## 運用ルール

- 置き場所: `docs/plans/<英語スラグ>/`(スラグは作業名のみ。例: `monorepo-skeleton`, `liff-login`)
  ※ palworld-status-bot の `.claude/plans/` と異なり、hoopo は docs/DEVELOPMENT.md の定めに従い `docs/plans/` に置く
- 各ディレクトリに `plan.md`(実装方針)と `task.md`(チェックリスト)の2ファイル
- task.md は作業の進捗に合わせてチェックを更新し、実装と同じブランチにコミットする
- 縦切り実装(フェーズ2)は親 Issue(縦切りN)の **Sub-issue** 単位で着手する。新たに紐付ける場合:
  `gh api -X POST repos/kchan-lab/hoopo/issues/<親番号>/sub_issues -F sub_issue_id=<issueのid>`
  (`id` は issue 番号ではなくデータベースID。`gh api repos/kchan-lab/hoopo/issues/<番号> -q .id` で取得)
- 実装 PR には対象層のテスト(Unit / Integration / E2E)を必ず含める(docs/DEVELOPMENT.md テスト戦略)

## PR フロー

ブランチ作成〜マージの手順は **`create-pr` Skill** を参照(development / main 直 push 禁止)。

## plan.md テンプレート

```markdown
# Plan: <作業名>

Issue: [#N](<IssueのURL>)
設計の正: <docs/REQUIREMENTS.md §x.x など該当節へのリンク>

## 目的

<この作業で何を達成するか。1〜3行>

## 方針

<全体アプローチ。レイアウト図・対象一覧など>

### 設計判断

1. **<判断>**: <なぜそうするか。退けた代替案と理由>

## 完了条件

- <検証可能な条件を箇条書き>
```

## task.md テンプレート

```markdown
# Task: <作業名>

Issue: [#N](<IssueのURL>) / Plan: [plan.md](plan.md)

- [ ] <実装単位のタスク>
- [ ] <検証タスク(テスト・動作確認)>
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #N`)
```
