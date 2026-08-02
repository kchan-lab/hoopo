# .claude/skills — hoopo の定型作業 Skill

Claude Code が定型作業で参照する Skill 置き場。**同じ作業を2回やったら Skill 化**して
ここにコミットする(docs/DEVELOPMENT.md「Claude Code の回し方のコツ」)。

## 現在の Skill

| Skill | 役割 |
|---|---|
| [issue-plan](issue-plan/SKILL.md) | Issue 着手時のプラン運用(docs/plans/<slug>/ に plan.md / task.md) |
| [new-branch](new-branch/SKILL.md) | 作業ブランチの切り方・命名 |
| [e2e-check](e2e-check/SKILL.md) | コミット前のローカル動作検証(FE=Playwright E2E必須 / BE=Docker実動作確認必須) |
| [commit](commit/SKILL.md) | コミットの承認フロー(動作検証 → 案の提示 → 承認 → 実行) |
| [push](push/SKILL.md) | push の承認フロー(コミット承認とは別に承認を取る) |
| [create-pr](create-pr/SKILL.md) | PR 作成〜マージの承認フロー(AI は案の提示まで) |

## 運用方針

- Issue は What/Why(`.github/ISSUE_TEMPLATE/task.md`)、How は plan.md、進捗は task.md
- development / main への直 push 禁止
- **Git 操作は4段階すべて承認制**: コミット → push → PR 作成 → マージ。
  各段階で AI は案を提示して止まり、承認者(ユーザー)が「進めて良い」を選ぶまで実行しない
- **承認を求める前に判断材料を必ずテキストで出力する**: 進捗・確認した内容・判断理由・
  選択肢と推奨案は、承認の質問(ダイアログ)を出す**前に**ターミナルへ流す。
  ダイアログの文言だけで承認を迫らない(承認者が判断根拠を読めない状態を作らない)
- **コード変更はコミット前にローカルで動作検証する**(e2e-check Skill)。型チェック・ビルド通過は
  動作検証とみなさない
- 今後の候補: `release-notes`(保護者向けお知らせ下書き)
