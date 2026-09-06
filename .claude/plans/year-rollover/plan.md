# Plan: 年度更新(学年+1・卒団アーカイブ)

Issue: [#83](https://github.com/kchan-lab/hoopo/issues/83)
設計の正: docs/REQUIREMENTS.md §5.2(部員管理・年度更新)・§7(children.archived / archived_at、year_rollovers)/ CLAUDE.md 開発ルール(破壊的操作は確認ダイアログ+実行ログ)

## 目的

4月に全部員の学年を+1し、6年生を卒団アーカイブする一括処理を、部員管理の「年度更新を実行」から
二段階確認つきで実行でき、24時間以内なら1回だけ取り消せるようにする。実行ログは year_rollovers に残す。

## 方針

```
[コーチ(admin)] 部員管理: 「年度更新を実行」→ 二段階確認(対象人数・卒団人数を表示)→ POST /members/year-rollover
                → 実行後: 「年度更新を実行しました(M/D HH:mm)」+「取り消す」(猶予 24 時間・1回)→ POST /members/year-rollover/undo
```

### API 契約(実装済みの DB: `year_rollovers(id, team_id, executed_at, undone_at, snapshot jsonb)`)

- `GET /members/year-rollover` → `{ latest: { id, executedAt, undoneAt, undoable: boolean, affected: number, archived: number } | null, preview: { total: number, willArchive: number } }`
  latest は未取り消しの最新実行(undoable = undone_at が null かつ executed_at から 24 時間以内)。preview は「今実行したら」の人数
- `POST /members/year-rollover` → 201 `{ rollover: { id, executedAt, affected, archived } }`。
  対象: active かつ非アーカイブの部員。grade 6 → archived=true, archived_at=now(学年は据え置き)、それ以外 grade+1。
  実行前の `{ childId: { grade, archived } }` を snapshot に保存。猶予内の未取り消し実行があるときは 409(二重実行防止)。
  対象 0 人なら 400
- `POST /members/year-rollover/undo` → `{ restored: number }`。latest が undoable でなければ 409。
  snapshot の各 child を grade / archived に戻し(archived=false に戻すときは archived_at=null)、undone_at=now
- 関数: `getYearRolloverStatus(teamId, now)`, `executeYearRollover(teamId, now)`, `undoYearRollover(teamId, now)`(`packages/api/src/year-rollover.ts`)。すべて withTeam・1トランザクション

### 設計判断

1. **実行ログは year_rollovers、取り消しは snapshot からの復元**: 「更新後に登録・編集された部員」も snapshot に無ければ触らない。
   snapshot にある部員は grade/archived を実行前の値に戻す(猶予中に手で直した変更は上書きされる。UI に明記)
2. **猶予は 24 時間・1回**: undone_at で二重取り消しを防ぐ。猶予を過ぎたら取り消し不可(手作業で SQL)
3. **二重実行防止**: 猶予内に未取り消しの実行があれば 409。取り消し後は再実行できる
4. **卒団は archived=true のみ**: 部員一覧・出欠・月謝・名簿の対象から外れる(既存クエリは archived=false で絞っている)。
   保護者の連携(guardian_children)は残す(卒団後も家族の設定で見える。削除フローは #21)
5. **実行体制**: プラン・DB はメインセッション、実装は Opus サブエージェント。DB を使う検証と PR はメイン

## 完了条件

- 部員管理から年度更新を実行でき、学年+1 と 6 年生の卒団が反映、24 時間以内に1回取り消せる
- Integration(実行・取り消し・二重防止・RLS)/ E2E(実行→一覧の学年が変わる→取り消し→戻る)がグリーン
