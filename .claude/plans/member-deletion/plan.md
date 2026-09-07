# Plan: 卒団後のデータ削除フロー(#21 後半)

Issue: [#21](https://github.com/kchan-lab/hoopo/issues/21)
設計の正: docs/REQUIREMENTS.md §5.2(部員管理)・§7・§9(卒団時はデータ削除フローを用意)/ docs/PRIVACY_POLICY.md「保持期間と削除」/ CLAUDE.md 絶対原則4・開発ルール(破壊的操作は確認ダイアログ+実行ログ)

## 目的

卒団(アーカイブ済み)の部員について、コーチが管理画面から本人のデータを削除できるようにする。削除は二段階確認を経て、実行ログを残す(ログには名前を残さない)。

## 方針

```
[コーチ(admin)] 部員管理 → 「卒団した部員」(アーカイブ済み一覧: 名前・学年・卒団日)→ 各行「データを削除」
                → 二段階確認(名前を表示、「削除すると元に戻せません」)→ DELETE /members/:childId
[API] children 行を削除(attendances / lineups / fee_records / child_availabilities / guardian_children は FK cascade)。
      その結果どの子とも紐づかなくなった guardian(LINE ユーザー ID の暗号文だけを持つ)も削除する。
      audit_logs に 1 行(action='child_deleted', target_id=childId, detail={ grade, archivedAt, removedGuardians: n })
```

### DB(マイグレーション 0009)

`audit_logs(id, team_id, action text, target_id uuid null, detail jsonb, performed_by uuid(coaches.id) null, created_at)`。RLS・GRANT・FORCE は他テーブルと同じ。
名前・LINE ID など個人情報は detail に入れない(削除の記録が個人情報の保持にならないように)。
年度更新の year_rollovers は既存のまま(取り消し用の snapshot を持つため別テーブルのまま)。

### API 契約(admin。`members.ts` に追加)

- `GET /members/archived` → `{ members: [{ id, name, nicknameKana, grade, archivedAt }] }`(archived=true、archived_at 降順)
- `DELETE /members/:childId` → `204`。対象が archived=false なら 409「在籍中の部員は削除できません(先に年度更新で卒団させてください)」、無ければ 404。
  1 トランザクション: child を DELETE → 紐づきが 0 になった guardian を DELETE → audit_logs に INSERT
- `GET /audit-logs?limit=20` → `{ logs: [{ id, action, targetId, detail, createdAt }] }`(部員管理の下に「実行ログ」として表示)

### 画面(apps/admin 部員管理)

- 一覧の下に「卒団した部員」セクション(無ければ「卒団した部員はいません」)。各行に「データを削除」→ 二段階確認 → 削除後は一覧から消え「削除しました」
- その下に「実行ログ」(直近 10 件: 日時・内容「部員データを削除(保護者 n 人分も削除)」)
- 保護者側: 削除された子は保護者の家族画面から消える(guardian ごと消えた場合は次回ログインで新規扱い)

## 設計判断

1. **削除できるのはアーカイブ済みだけ**: 在籍中の誤削除を防ぐ。年度更新(卒団)→ 削除の二段構え
2. **guardian も紐づきが無くなれば削除**: LINE ユーザー ID(暗号文)を残す理由が無い。再登録は招待コード/新規登録でやり直せる
3. **ログに名前を残さない**: 削除の記録自体が個人情報の保持にならないよう、id と人数・学年だけ
4. **論理削除ではなく物理削除**: プライバシーポリシーの「順次削除します」を文字どおりに。バックアップ(#20)からの復元は運用の範囲
5. **実行体制**: プラン・DB はメイン、実装は Opus サブエージェント。検証と PR はメイン

## 完了条件

- 卒団済み部員を削除すると children と関連行・孤立した guardian が消え、audit_logs に 1 行残る。在籍中は 409
- Integration(削除・cascade・guardian の扱い・409/404・RLS)/ E2E(年度更新で卒団 → 削除 → 一覧から消える・ログが出る)がグリーン
