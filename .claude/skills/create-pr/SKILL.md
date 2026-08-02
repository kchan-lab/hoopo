---
name: create-pr
description: ブランチ作成から PR 作成・マージまでの運用ルール。development / main への直 push は禁止。「PR 作成」「PR 出して」「マージして」「ブランチ切って」で発動。
---

# create-pr: PR フロー

## 原則

**development / main は常に green。** 直 push しない。CI を通った PR だけがマージされる。
フローは docs/DEVELOPMENT.md「ブランチ戦略・リリースフロー」が正:

```
feat/xxx ──PR──▶ development(=stg) ──リリースPR──▶ main(=本番)
```

- **feat/xxx → development**: **squash マージ**。PR タイトルがそのままコミット件名になるため、
  タイトルは Conventional Commits 形式で書く(1 PR = 1 コミットとなり release-please が正しく拾う)
- **development → main(リリースPR)**: **merge commit**。個々の `feat:`/`fix:` コミットを
  main に残し、release-please がバージョン計算に使う
- ブランチ保護・マージ方式のリポジトリ設定は Issue #4 で反映する

## フロー

1. **ブランチ**: 最新 development から Issue ごとに切る。名前の付け方は **new-branch Skill** 参照
2. **コミット**: **commit Skill** の承認フローに従う(案の提示 → 承認 → 実行。承認なしにコミットしない)
3. **push**: **push Skill** の承認フローに従う(コミット承認とは別に、push もあらためて承認を取る)
4. **PR 作成**: **承認者(ユーザー)の承認があってから** `gh pr create --base development` する。
   AI は PR タイトル・本文の案を提示して止まる(push 承認 ≠ PR 作成承認)
   - タイトル = squash コミットの件名になる形式 **「<type>: <作業名>」**(Conventional Commits 準拠):

     | type | 用途 |
     |---|---|
     | `feat` | 機能追加(release-please で minor) |
     | `fix` | バグ修正(release-please で patch) |
     | `refactor` | 挙動を変えないコード再編 |
     | `test` | テストのみの追加・修正 |
     | `docs` | README・ドキュメントのみ |
     | `ci` | CI・Dockerfile 等のビルド周り |
     | `chore` | 運用ファイル・依存更新などの雑務 |

   - 本文は **`.github/PULL_REQUEST_TEMPLATE.md` が正**(ひとことで言うと/早見表/なぜ/
     旧仕様との違い/変更内容/影響範囲/技術的詳細)。該当しない見出しは削ってよいが
     「ひとことで言うと」は必須。書き方は下の **「読み手の言葉で書く」** に従う
   - **優先度ラベルを必ず1つ付ける**(`--label p1|p2|p3`)。案の提示時に優先度と理由も含めて承認を取る:

     | ラベル | 意味 |
     |---|---|
     | `p1` | 最優先: ブロッカー(これが入らないと他が進まない)・本番障害の修正 |
     | `p2` | 通常: 標準の実装・改善(迷ったらこれ) |
     | `p3` | 低: 急がない雑務・ドキュメント・リファクタ |

     ボードの Priority フィールドとの対応は p1=High / p2=Medium / p3=Low
   - Issue 作業の PR は本文に plan.md へのリンク・テスト結果・`Closes #N` を必ず含める
     (development がデフォルトブランチのため、マージで Issue が自動クローズされる)
5. **ボード更新**: PR 作成直後、`Closes #N` / `Refs #N` の対象 Issue を **In Review** に移す:

   ```bash
   ITEM=$(gh project item-list 13 --owner kchan-lab --format json --limit 200 \
     --jq '.items[] | select(.content.number==<Issue番号>) | .id')
   gh project item-edit --project-id PVT_kwDODn58Jc4BfKhd --id "$ITEM" \
     --field-id PVTSSF_lADODn58Jc4BfKhdzhZfWC0 --single-select-option-id 123aa790
   ```

   (ID 一覧と auto-add 漏れ時の対処は issue-plan Skill 参照。マージ後の Done は
   Projects 組み込みワークフローが自動で行うので何もしない)
6. **承認待ち**: PR 作成後、AI(Claude)は CI の結果とマージ条件(CI グリーン + task.md 全消化 +
   Vercel プレビュー確認)が揃ったかを報告して**止まる**。マージ判断は必ず**承認者(ユーザー)**が行う
7. **マージ**: 承認者の指示があってから
   `gh pr merge --squash --delete-branch` でマージし、ローカル development を `git pull --ff-only` で追従
8. **Issue 不要の軽微な変更**(docs・運用ファイル・typo 等)も PR は必須。
   `<type>:` prefix は付け、`Closes #N` は不要
9. **リリース**(development → main)は リリースPR + release-please の運用
   (docs/DEVELOPMENT.md 参照)。保護者向けお知らせは `release-notes` Skill(将来)で別途作る

> 承認の粒度: **コミット(commit Skill)→ push(push Skill)→ PR 作成 → マージ**の
> 4 段階それぞれで承認を取る。前段の承認は次の段の承認を意味しない。
> どの段階でも、承認の質問(ダイアログ)を出す**前に**判断材料(確認した内容・判断理由・
> 案・推奨)を必ずテキストでターミナルに出力する。レビュー指摘への対応判断など
> 進捗の節目も同様に、まずテキストで報告してから質問する。

## 読み手の言葉で書く(分かりやすさの原則)

PR 本文は、コードを読まない読み手(未来の自分)が**一目で挙動の差分を理解できる**ことを
最優先する。内部の変数名・関数名・条件式・型をそのまま並べた「システマチックな説明」は禁止。

判断基準: 書いた本文を、コードを読んでいない人が読んで「いつ・何が・どう変わるか」が
分かるか。分からなければ技術寄りすぎる。

### 必ず入れる 5 要素

1. **ひとことで言うと**: 何がどう変わる / 何が問題か を、利用者の言葉で 1〜2 文。専門用語を使わない
2. **具体例(表)**: 実際に起きる具体的な状況を時系列の表で示す
3. **早見表**: 「問題あるケース / 問題ないケース / 発生条件」を 1 つの表にまとめ、
   ✅🔴 等で一目で判別できるようにする。**ポイント: 変化が起きる条件を 1 行で言い切る**
4. **なぜ(仕組み)**: 原因・動作を平易な言葉で(必要なら「①〜 → ②〜」の段階で)説明する
5. **旧仕様との違い**: 挙動が変わる場合は「これまで → 今回」を明記する。
   対外影響(LINE 通知・通数・保護者/管理画面の表示)があれば必ず触れる

技術的詳細(具体的な関数・条件式・修正方針)は末尾の「技術的詳細」に分離するか、
コードのインラインコメント側に寄せる。**本文の主役は読み手の言葉。**

### Before / After

**Before(禁止: 技術寄りで読み手に伝わらない)**:

> verifySession() は cookie が無いとき liff.getIDToken() をフォールバックに使うが、
> token の exp 検証が UTC 前提のため Asia/Tokyo の日跨ぎで 401 になり……

**After(推奨: ひとこと + 早見表で読み手に伝わる)**:

> ### ひとことで言うと
> 深夜 0 時前後に予定表を開くと、ログインし直しを求められることがあります。
>
> | 場面 | 条件 | 結果 | 問題? |
> |---|---|---|---|
> | 日中に開く | いつでも | そのまま見られる | ✅ 問題なし |
> | 深夜に開く | 0時をまたいだ直後 | ログインし直しになる | 🔴 これが問題 |
>
> ポイント: 「日付が変わった直後」だけ起きる。

## やってはいけないこと

- development / main への直 push(このルール自体の変更も PR で行う)
- **承認者の指示なしの PR 作成・マージ**(AI は案の提示まで。出す/マージするの判断は必ず承認者)
- CI の結果を待たずにマージ
- 複数 Issue の変更を 1 つの PR に混ぜる
- 変数名・関数名だけで挙動を説明した PR 本文
