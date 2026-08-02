# Plan: Claude Code Skill 基盤の移植

Issue: [#5](https://github.com/kchan-lab/hoopo/issues/5)
設計の正: docs/DEVELOPMENT.md「ブランチ戦略・リリースフロー」「Claude Code の回し方のコツ」

## 目的

palworld-status-bot で確立済みの Skill(issue-plan / new-branch / create-pr)を
hoopo のブランチ戦略に合わせて移植し、`.claude/skills/` の運用基盤を作る。

## 方針

5 Skill(issue-plan / new-branch / commit / push / create-pr)+ README を `.claude/skills/` に置く。
テンプレート本体は `.github/` を正とし、Skill 側は参照+哲学(読み手の言葉で書く・承認制)のみ持つ。
Git 操作は **コミット → push → PR 作成 → マージ** の4段階すべて承認制
(各段階で案を提示して止まり、承認者が選択するまで実行しない)。

### 設計判断

1. **プラン置き場は `docs/plans/`**: palworld は `.claude/plans/` だったが、
   hoopo は docs/DEVELOPMENT.md が「計画は docs/plans/ に残す」と定めているためそちらに統一
2. **feat→development は squash マージ**: PR タイトル(Conventional Commits)がそのまま
   コミット件名になり、release-please のバージョン計算が 1 PR = 1 コミットで安定するため。
   development→main のリリース PR は個々のコミットを残す merge commit(リポジトリ設定は Issue #4)
3. **PR タイトルに `(Closes #N)` を付けない**: palworld と異なり hoopo はデフォルトブランチが
   development のため、PR 本文の `Closes #N` だけで自動クローズが効く

## 完了条件

- `.claude/skills/` に issue-plan / new-branch / create-pr / README が存在する
- 各 Skill の記述が docs/DEVELOPMENT.md のブランチ戦略・テスト戦略と矛盾しない
