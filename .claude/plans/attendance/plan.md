# Plan: 参加予定の提出 → 出欠管理・欠席者管理(縦切り4)

Issue: [#14](https://github.com/kchan-lab/hoopo/issues/14)
Sub-issue: [#76](https://github.com/kchan-lab/hoopo/issues/76)(4a: portal 提出)/ [#77](https://github.com/kchan-lab/hoopo/issues/77)(4b: admin 出欠・欠席者)
設計の正: docs/REQUIREMENTS.md §4.2-3・6 / §5.2(出欠管理・欠席者管理) / §7(attendances) / docs/DESIGN_GUIDELINES.md §1.3・§2.3・§3 / CLAUDE.md 絶対原則3(通数)
視覚の正: docs/wireframes/wireframes-v6.html(portal: 提出リスト・提出カレンダー・ホームの未提出アラート / admin: PC-3・PC-4・SP-4・SP-5)

## 目的

保護者がお子さんごとに練習日の参加予定(3値+未回答、途中参加・早退はコメント可)をリスト/カレンダーで
提出・変更でき、コーチが部員×練習日のマトリクスと練習日ごとの欠席者一覧で把握できるところまで貫通させる。
スキーマは #6 の attendances(practice_id × child_id 一意、comment は partial のみ)をそのまま使い、
新規マイグレーションはなし。

## 方針

```
[保護者(portal)] タブバー「提出」→ /attendance?month=&child=
   お子さん切替(2人以上のとき) → リスト(行のプルダウン+途中参加・早退のコメント) ⇄ カレンダー(タップで巡回)
   一括チップ「すべて『参加』にする / 未回答に戻す」 → CTA「回答 n / m 件」で一括保存(PUT)
   ホーム: 今月に未回答があれば「n月分の参加予定が未提出です → 提出へ」
[コーチ(admin)] 出欠管理 /attendance?month= : 部員(行)×練習日(列)の ○/△/×/−。△でコメント表示
               欠席者管理 /absentees?practiceId= : 日付ピル → 不参加 / 途中参加・早退(コメント) / 未回答
```

### API 契約(4a と 4b が並列で実装するため先に固定する)

共通: `packages/api/src/attendances-shared.ts`(実装済み)— `AttendanceStatus = "full" | "partial" | "absent"`、
未回答は `null`(行を持たない)、`parseSubmitAttendance`、`nextAnswer`、ラベル・記号。

**4a 保護者 API**(`packages/api/src/app.ts` に追加。ロジックは `attendances-guardian.ts`)
- `GET /attendance?month=YYYY-MM` → `{ month, children: ChildSummary[], practices: Practice[], answers: Record<childId, Record<practiceId, { status, comment }>> }`
  自分の active な子どもだけ。practices は `listPracticesByMonth` を再利用。未回答は answers に無い
- `PUT /attendance` body: `SubmitAttendanceInput`(`{ childId, answers: [{ practiceId, status|null, comment }] }`)
  → `{ saved: number }`。childId が自分の active な連携でなければ 404(存在を漏らさない)。
  status=null は行を削除、それ以外は upsert(unique(practice_id, child_id))。comment は partial のみ保存。
  practiceId がチームに無ければ 400
- `GET /attendance/summary?month=` → `{ unanswered: number, total: number }`(ホームの未提出アラート用。
  対象は月内の練習 × 自分の子ども)
- 関数: `getAttendanceSheet(teamId, guardianId, month)`, `submitAttendance(teamId, guardianId, input)`,
  `getUnansweredSummary(teamId, guardianId, month)`

**4b 管理 API**(`packages/api/src/admin-app.ts` に追加。ロジックは `attendances-coach.ts`)
- `GET /attendance-matrix?month=YYYY-MM` → `{ month, practices: Practice[], rows: [{ child: { id, name, nicknameKana, grade }, cells: Record<practiceId, { status, comment } | null> }] }`
  部員は active・非アーカイブ、学年降順→名前。列は日付順
- `GET /absentees?practiceId=` → `{ practice, absent: Entry[], partial: Entry[], unanswered: Entry[] }`
  `Entry = { child: { id, name, nicknameKana, grade }, comment: string | null }`。未回答=行が無い部員
- 関数: `getAttendanceMatrix(teamId, month)`, `getAbsentees(teamId, practiceId)`

### 設計判断

1. **未回答は行を持たない(null)**: §7 の attendances に「未回答」の値は無く、未回答=行なしで表現する。
   一括保存で null を受けたら行を削除する。マトリクスの「−」と欠席者管理の「未回答」はこの差集合
2. **保存はお子さん単位の一括 PUT**: 行ごとの PATCH よりリスト/カレンダーの「完全同期」と一括チップを
   単純にできる。クライアントは編集をローカル state に持ち、CTA で一括送信する(DESIGN §1.3)
3. **コメントは partial のみ**: DB の CHECK(`status = 'partial' OR comment IS NULL`)と同じ規則を
   `parseSubmitAttendance` で先に適用し、UI も partial のときだけ入力欄を出す
4. **複数の子どもは画面上部のセグメントで切り替える**: 1人なら出さない。URL(`?child=`)で選択を表す。
   兄弟の一括コピーは作らない(回答は子ごとに異なるのが普通)
5. **提出の表示形式は Cookie `portal_attendance_view`**: 日程と同じ方式(#13 判断4)。日程と独立に記憶する
6. **過去の練習も変更可**: 「提出後も変更可」(§4.2-6)。締切の概念は設けない(発行・リマインドは #26/#27)
7. **リマインド対象の指定は #27 まで無効表示**: 送信手段(LINE グループ1通)が無い段階で対象フラグを永続化しない
8. **△のコメント表示は `<details>`(ネイティブの開閉)**: モノトーンで表現し、JS 依存を減らす。
   ポップオーバーは将来の改善余地
9. **実行体制(issue-plan Skill「実行体制」の初適用)**: 共通モジュールと API 契約はメインセッションが
   先に書き、4a / 4b を Opus のサブエージェントに worktree 分離で並列委譲する。DB を使う検証
   (Integration / E2E)と PR はメインセッションが直列で行う

## スコープ外

- LINE リマインド送信・通数(#27)、予定表発行(#26)
- ダッシュボードの提出率・次回参加人数(#30)
- 練習詳細ページの「この日の参加予定を変更する」の有効化は 4a に含める(提出画面へのリンク)

## 完了条件

- 保護者がリスト/カレンダーで提出・変更でき、再表示・形式切替で状態が保持される
- コーチのマトリクスに ○/△/×/− が反映され、△のコメントが読める。欠席者管理に3グループが出る
- Unit(検証・巡回)/ Integration(保護者・管理 API+RLS)/ E2E(提出→マトリクス・欠席者に反映)がグリーン
