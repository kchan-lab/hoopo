---
name: issue-plan
description: Issue ドリブン開発でプランを書くときに必ず読む哲学とテンプレート。Issue の起票から、着手時の .claude/plans/<slug>/plan.md と task.md 作成までの運用を定める(PR の出し方は create-pr Skill)。「Issueを切って」「Issue作成」「Issueに着手」「プラン作成」「plan.md」「task.md」で発動。
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

- 置き場所: `.claude/plans/<英語スラグ>/`(スラグは作業名のみ。例: `monorepo-skeleton`, `liff-login`)
  ※ プランは仕様書ではなく AI との作業ドキュメント。`docs/` は仕様の正(REQUIREMENTS / DESIGN_GUIDELINES / DEVELOPMENT)に限定し、
  プランは Skill と同じ `.claude/` 配下に置く(palworld-status-bot と同じ構成)
- 各ディレクトリに `plan.md`(実装方針)と `task.md`(チェックリスト)の2ファイル
- task.md は作業の進捗に合わせてチェックを更新し、実装と同じブランチにコミットする
- 縦切り実装(フェーズ2)は親 Issue(縦切りN)の **Sub-issue** 単位で着手する。新たに紐付ける場合:
  `gh api -X POST repos/kchan-lab/hoopo/issues/<親番号>/sub_issues -F sub_issue_id=<issueのid>`
  (`id` は issue 番号ではなくデータベースID。`gh api repos/kchan-lab/hoopo/issues/<番号> -q .id` で取得)
- 実装 PR には対象層のテスト(Unit / Integration / E2E)を必ず含める(docs/DEVELOPMENT.md テスト戦略)

## Issue の切り方(起票)

新しい作業が見えたら、着手前にまず Issue を切る。本文の型は `.github/ISSUE_TEMPLATE/task.md` と
同じ4節(目的/参照/作業内容/受入条件)。`gh issue create` は非対話実行だとテンプレートを
適用しないので、本文で型を再現する:

```bash
gh issue create --repo kchan-lab/hoopo \
  --title "<What がわかる短文(日本語)>" \
  --assignee Keichan15 \
  --body "$(cat <<'EOF'
## 目的

<何を達成するか・なぜ必要かを 1〜3 文。実装詳細(How)は書かない>

## 参照

<仕様の根拠を節番号つきで。例: docs/REQUIREMENTS.md §4.2-6 / docs/DEVELOPMENT.md テスト戦略>

## 作業内容

- [ ] <粗い分解でよい。着手時に plan.md / task.md へ展開する>

## 受入条件

- [ ] <完了を客観的に判定できる条件。縦切り実装は Unit / Integration / E2E を含める>
EOF
)"
```

- **1 Issue = 1 関心事。** 機能変更とリファクタリングが混ざるなら分けて切る
- 起票後、ボード(project 13)に載ったか確認する。auto-add が拾うはずだが、
  下記が空を返す場合は `gh project item-add 13 --owner kchan-lab --url <IssueのURL>` で追加:

  ```bash
  gh project item-list 13 --owner kchan-lab --format json --limit 200 \
    --jq '.items[] | select(.content.number==<Issue番号>) | .id'
  ```

- Status は **Todo のまま**にする(In Progress への遷移は着手時=plan.md 作成時。次節)
- 縦切りの子タスクは Sub-issue として親 Issue に紐付ける(運用ルールのコマンド参照)

## 着手時のボード操作(In Progress へ)

plan.md を作るタイミングで、対象 Issue の Status を **In Progress** に移す:

```bash
ITEM=$(gh project item-list 13 --owner kchan-lab --format json --limit 200 \
  --jq '.items[] | select(.content.number==<Issue番号>) | .id')
gh project item-edit --project-id PVT_kwDODn58Jc4BfKhd --id "$ITEM" \
  --field-id PVTSSF_lADODn58Jc4BfKhdzhZfWC0 --single-select-option-id 47fc9ee4
```

- `ITEM` が空の場合は auto-add が拾っていないので、先に
  `gh project item-add 13 --owner kchan-lab --url <IssueのURL>` で追加する
- Status オプション ID: Todo=`f75ad846` / In Progress=`47fc9ee4` / In Review=`123aa790` / Done=`98236657`
  (Priority フィールドは `PVTSSF_lADODn58Jc4BfKhdzhZfWX0`、High=`4609778d` / Medium=`01a0d828` / Low=`eb604991`)
- これらの ID は **Project の再作成・フィールド構成の変更で失効する**。`ITEM` が空になる以外に
  「field-id / option-id が無効」というエラーでも失敗し得るので、その場合は
  `gh project view 13 --owner kchan-lab --format json --jq .id` と
  `gh project field-list 13 --owner kchan-lab --format json` で ID を取り直してこの一覧を更新する
- PR 作成時の In Review 遷移は create-pr Skill、クローズ時の Done は Projects 組み込みワークフローが自動で行う

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
- [ ] PR 作成 → CI グリーン → development へ merge commit でマージ(`Closes #N`)
```
