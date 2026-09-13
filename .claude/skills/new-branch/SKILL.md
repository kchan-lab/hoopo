---
name: new-branch
description: 作業ブランチ作成のルール。最新 development から Issue/作業ごとに切る。ブランチ名の付け方を定める。「ブランチ切って」「ブランチ作成」で発動。
---

# new-branch: ブランチ作成

## ルール

1. **必ず最新の development から切る**(main から切るのは `hotfix/xxx` の緊急時のみ):

   ```bash
   git checkout development && git pull --ff-only
   git checkout -b feat/<スラグ>
   ```

2. **ブランチ名**(英語ケバブケース):
   - 基本は **`feat/<スラグ>`**。スラグは **プランのスラグと同名**(例: `feat/liff-login`)。
     `.claude/plans/<スラグ>/` と対応させ、ブランチ名からプランへ辿れるようにする(プランは issue-plan Skill 参照)
   - Issue 不要の軽微な変更: 内容が分かる短い名前(例: `feat/fix-typo-readme`)
   - 本番の緊急修正のみ `hotfix/<スラグ>`(main へ直接 PR。マージ後 development へ back-merge)
3. **1 ブランチ = 1 関心事**。複数 Issue の作業を同居させない
4. **ブランチは使い捨て**。マージ後は削除(`gh pr merge --delete-branch` で自動)し、再利用しない

作業が終わったら PR へ — 以降の流れは **create-pr Skill** を参照。
