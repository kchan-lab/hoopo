# Task: Claude Code Skill 基盤の移植

Issue: [#5](https://github.com/kchan-lab/hoopo/issues/5) / Plan: [plan.md](plan.md)

- [x] issue-plan Skill を hoopo 流(docs/plans/)に書き換えて移植
- [x] new-branch Skill を development 起点・feat/<slug> 命名に書き換えて移植
- [x] create-pr Skill を squash マージ+リリース PR 前提に書き換えて移植
- [x] `.claude/skills/README.md` に運用方針を記載
- [x] commit / push Skill を追加し、Git 操作を4段階承認制(コミット→push→PR作成→マージ)に
- [x] PR に優先度ラベル p1〜p3 を必須化(リポジトリにラベル作成済み)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #5`)
