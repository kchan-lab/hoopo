# Plan: 日程管理と日程リスト/カレンダー(縦切り3)

Issue: [#13](https://github.com/kchan-lab/hoopo/issues/13)
Sub-issue: [#71](https://github.com/kchan-lab/hoopo/issues/71)(3a: admin)/ [#72](https://github.com/kchan-lab/hoopo/issues/72)(3b: portal)
設計の正: docs/REQUIREMENTS.md §4.2-3・4・5 / §5.2(日程管理) / §7(practices・practice_menus) / docs/DESIGN_GUIDELINES.md §1.3・§2.3 / CLAUDE.md 開発ルール(Asia/Tokyo 固定)
視覚の正: docs/wireframes/wireframes-v6.html(portal: 日程リスト・カレンダー・練習詳細・ホーム / admin: PC-6・SP-7)

## 目的

コーチが月単位で練習(日付/開始/終了/場所/備考+練習メニュー)を登録し、保護者がタブバーの「日程」から
リスト/カレンダーで閲覧、日付タップで練習詳細(メニュー含む)を見られるところまで貫通させる。
スキーマは #6 で実装済み(practices.weekday は held_on からの生成列)のため新規マイグレーションはなし。

## 方針

```
[コーチ(admin)] 日程管理: 月セレクタ → 行入力(日付/開始/終了/場所/備考) → 保存
                          行の「メニュー」→ 練習メニュー(所要分/内容)の編集
                          「予定表を発行してLINEへ送信」「通数 n/200」は #26/#27 まで無効表示
[保護者(portal)] タブバー「日程」→ リスト ⇄ カレンダー(トグル。選択は Cookie)
                 日付タップ → /practices/[id](フル画面。時間/場所/備考/メニュー)
                 ホームの hero に「次回の練習」
```

### 設計判断

1. **日付は `YYYY-MM-DD` の文字列と Asia/Tokyo の純粋関数で扱い、Date ライブラリを入れない**:
   保持は `held_on`(date)+生成列 `weekday`。API 入出力も文字列(`heldOn` / `startTime` "HH:MM")で、
   サーバー・ブラウザのタイムゾーンに依存しない。「今日」「今月」の決定だけ `Intl.DateTimeFormat`
   の `timeZone: "Asia/Tokyo"` で行う(`packages/api/src/tokyo-date.ts`。Unit で固定)。
   date-fns 等は依存追加になり、TZ 対応版はさらに重いため見送り
2. **練習メニューは練習の更新に同梱して全置換する**: 行数が数件のため個別 CRUD より
   「practice の PUT に menus 配列を含め、削除→再挿入」が単純で整合も取りやすい。
   `sort` は配列順から振り直す
3. **管理 API は RESTful に `GET/POST /practices`, `PUT/DELETE /practices/:id`**、保護者 API は
   `GET /practices?month=`・`GET /practices/:id`・`GET /practices/next`(ホーム用)。
   保護者は子ども未連携でも日程は閲覧可(チーム公開情報。§3 の保持情報に個人情報を含まない)
4. **リスト/カレンダーの選択状態は Cookie(`portal_schedule_view`)**: DESIGN §1.3「選択状態は保存」と
   CLAUDE.md「localStorage 依存禁止」の両立。SSR で読んで初期表示を決め、切替はクライアントで
   Cookie 更新+即時反映
5. **タブバーはこの Issue で5ボタンを実装し、未実装タブ(月謝/チーム/提出)は無効表示**:
   #12 で見送った分。中央「日程」の黒丸は DESIGN §1.3 のとおり
6. **カレンダーは日曜始まりの6週固定格子ではなく、その月に必要な週数だけ描く**: 他月の日は淡く表示。
   練習日のみタップ可(tint地+deep)。今日は下線で示す(色だけに依存しない §3)
7. **削除は物理削除**: 発行前の入力ミス訂正が主用途で、出欠(attendances)は複合 FK の CASCADE で消える。
   発行済み(published_at あり)の練習の削除・変更は #26 で「再発行」の扱いを決めるまで許可する
   (現段階では発行機能がない)。管理画面の削除は行内の二段階確認(#67 と同じ)
8. **Sub-issue 2本(3a admin → 3b portal)**: 3b は 3a のデータがないと画面が空。ブランチは
   `feat/practice-schedule`(3a)/ `feat/practice-calendar`(3b)。プランは本ディレクトリを共用

## スコープ外

- 予定表画像の生成・発行・LINE 送信・通数カウンター(#26 / #27)。ボタンとメーターは無効表示
- 参加予定の提出(#14)。詳細ページの「参加予定を変更する」は無効
- 出場メンバー(#29)。詳細ページの「出場メンバーはこちら」は無効
- 公式戦/練習試合の種別タグ(§4.2-5 別案。将来検討)

## 完了条件

- コーチが練習を登録・編集・削除でき、練習メニューを付けられる
- 保護者がリスト/カレンダーで練習を見られ、詳細でメニューが出る。ホームに次回の練習が出る
- Unit(Tokyo 日付・格子・バリデーション)/ Integration(管理・保護者 API+RLS)/
  E2E(管理で入力→保護者で確認)がグリーン
