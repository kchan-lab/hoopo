# Plan: 月謝(封筒グリッド両面)(縦切り5)

Issue: [#15](https://github.com/kchan-lab/hoopo/issues/15)
Sub-issue: [#81](https://github.com/kchan-lab/hoopo/issues/81)(5a: portal 月謝確認)/ [#82](https://github.com/kchan-lab/hoopo/issues/82)(5b: admin 月謝管理)
設計の正: docs/REQUIREMENTS.md §4.2-8 / §5.2(月謝管理) / §7(fee_records) / docs/DESIGN_GUIDELINES.md §1.3(月謝スタンプ)・§2.3 / CLAUDE.md 絶対原則7(決済はしない)
視覚の正: docs/wireframes/wireframes-v6.html(portal スライド13 / admin PC-7・SP-8)

## 目的

現金運用(封筒+済ハンコ)をデジタルで可視化する。コーチが部員×1〜12月のグリッドで済⇄未を切り替え、
保護者がお子さんごとの封筒グリッド(済/未/未来)で状況を確認できるところまで貫通させる。
月次の fee_record 自動生成は DB 関数+GitHub Actions のジョブとして定義する。決済・キャッシュレスは実装しない。

## 方針

```
[コーチ(admin)] 月謝管理 /fees?year= : 部員(行)×1〜12月(列)。セルをクリックで 済⇄未(即保存)
                モバイル: 部員を選んで封筒グリッド(4列)
[保護者(portal)] タブバー「月謝」→ /fees?year=&child= : 1〜12月の封筒(済=deep 円枠 / 未=accent 枠+破線円 / 未来=淡色「–」)
                 金額と運用注記のカード
[ジョブ] 毎月1日 09:10 JST: generate_current_fee_records() で全チームの有効な部員に当月の「未」を冪等に作成
```

### API 契約(5a と 5b が並列で実装するため先に固定する)

共通: `packages/api/src/fees-shared.ts`(実装済み)— `FeeState = "paid" | "unpaid" | "future"`、
`feeState` / `buildFeeMonths(records, year, currentMonth)`、`parseYear`、`parseFeeToggle`。
`currentMonth` は Tokyo の今月 `monthOf(todayInTokyo())`。

**5a 保護者 API**(`packages/api/src/app.ts` に追加。ロジックは `fees-guardian.ts`)
- `GET /fees?year=YYYY`(省略時は Tokyo の今年)→
  `{ year, currentMonth, children: [{ child: ChildSummary, months: FeeMonth[12] }] }`
  自分の active な子どもだけ(`listChildrenForGuardian`)。行が無い月は `feeState` で導出
- 関数: `getFeeSheet(teamId, guardianId, year, currentMonth)`

**5b 管理 API**(`packages/api/src/admin-app.ts` に追加。ロジックは `fees-coach.ts`)
- `GET /fee-grid?year=YYYY` → `{ year, currentMonth, rows: [{ child: { id, name, nicknameKana, grade }, months: FeeMonth[12] }] }`
  部員は active・非アーカイブ、学年降順→名前(`listMembers` / 出欠と同じ)
- `PUT /fee-records` body: `FeeToggleInput`(`{ childId, year, month, status: "paid" | "unpaid" }`)→ `{ month: FeeMonth }`
  unique(child_id, year, month) で upsert。paid は `received_at = now()`、unpaid は `received_at = null`。
  childId が有効な部員でなければ 404
- 関数: `getFeeGrid(teamId, year, currentMonth)`, `setFeeStatus(teamId, input)`

### 設計判断

1. **「未」は行が無くても導出する**: §7 の「未来はアプリが year/month から導出」に合わせ、`行なし or unpaid` かつ
   今月以前 = 未、来月以降 = 未来、paid = 常に済(前払いも済)。ジョブが未実行でも画面が成立する
2. **年は暦年(1〜12月)で表示し、年切替は前後リンク**: ワイヤーの封筒(1〜12月)と一致させる。
   年度(4月始まり)の扱いは年度更新(別 Issue)で検討する。表示範囲は 2020〜2100
3. **済⇄未はセル単位で即保存(確認ダイアログなし)**: 封筒にハンコを押す操作の再現で、取り消しも同じ
   セルをもう一度押すだけ。誤操作の被害が小さく可逆なため確認は挟まない(破壊的操作ではない)
4. **金額と運用注記は当面 env(`FEE_AMOUNT_YEN` / `FEE_NOTE`)**: teams に列を足す(仕様変更+マイグレーション)
   より軽く、チーム設定画面(横展開時)で DB 化する。金額未設定なら金額行を出さない
5. **月次生成は DB 関数 `generate_fee_records(year, month)` + `generate_current_fee_records()`(0004)を
   GitHub Actions(fee-records.yml、毎月1日 09:10 JST。schedule は UTC 基準なので JST 0〜8時台は前月末日にずれる)から psql で呼ぶ**: SECURITY DEFINER で全チームを対象にでき、
   接続は Supabase ping と同じ hoopo_app 系の秘密情報を流用できる(新しいシークレット不要)。
   冪等(ON CONFLICT DO NOTHING)なので手動再実行も安全
6. **未来の月への「済」は許可、「未」は行を作らない**: 前払いを記録できるようにする一方、未来の「未」は
   表示上の未来と同じなので upsert で unpaid にするだけ(表示は future のまま)
7. **モバイルの管理画面は部員を選んで封筒グリッド**(ワイヤー SP-8): 12列の表は横スクロールでも操作しにくい。
   PC は表、モバイルはセレクト+4列グリッド。同じ API・同じトグルを使う
8. **実行体制**: 共通モジュール・API 契約・マイグレーション・ジョブはメインセッション、5a / 5b は Opus の
   サブエージェントに worktree 分離で並列委譲。DB を使う検証と PR はメインが直列で行う

## スコープ外

- 決済・キャッシュレス(絶対原則7)
- ダッシュボードの月謝未提出数(#30)
- 年度単位の表示・年度更新(別 Issue)
- 金額・注記の DB 化(チーム設定画面)

## 完了条件

- コーチがグリッドで済⇄未を切り替えられ、保護者の月謝画面に反映される
- 月次生成ジョブが定義され、DB 関数が冪等に動く(Integration で確認)
- Unit(状態導出・入力検証)/ Integration(保護者・管理 API+RLS・DB 関数)/ E2E(済⇄未 → 保護者で確認)がグリーン
