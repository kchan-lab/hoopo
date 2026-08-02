---
name: push
description: git push の運用ルール。push は必ず「案の提示 → 承認者の承認」を経てから実行する。「pushして」「push」で発動。development / main への直 push は禁止。
---

# push: push は承認制

## 原則

**承認者(ユーザー)の明示的な承認を得るまで `git push` を実行しない。**
commit Skill の承認を得ていても、push はあらためて承認を取る(コミット承認 ≠ push 承認)。
push はリモートに公開される操作であり、取り消しが難しいため必ず一度止まる。

## 手順

1. **内容の提示**: 以下をまとめて承認者に提示し、**止まる**
   - push 先(リモート名 / ブランチ名。新規ブランチかどうか)
   - push されるコミット一覧(`git log origin/<branch>..HEAD --oneline`。新規ブランチは全コミット)
2. **承認待ち**: 承認者が「進めて良い」を選択するまで実行しない。
   選択肢は原則 3 つ — **進める / 修正して再提示 / 中止**
3. **実行**: `git push`(新規ブランチは `git push -u origin <branチ名>`)
4. **push 後は止まる**: PR 作成へ自動では進まない。PR 作成・マージは **create-pr Skill** の
   承認フローで別途承認を取る

## やってはいけないこと

- 承認前の `git push`
- **development / main への直 push**(PR 経由のみ。このルール自体の変更も PR で行う)
- 承認なしの force push(`--force` / `--force-with-lease`)。必要な場合は理由と影響を提示して別途承認
- 承認された内容と異なるブランチ・コミットの push
