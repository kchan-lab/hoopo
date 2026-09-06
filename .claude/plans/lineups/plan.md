# Plan: 出場メンバー2D配置(縦切り7b)

Issue: [#29](https://github.com/kchan-lab/hoopo/issues/29)(親: [#17](https://github.com/kchan-lab/hoopo/issues/17))
Sub-issue: [#101](https://github.com/kchan-lab/hoopo/issues/101)(7b-1: admin チーム編成)/ [#102](https://github.com/kchan-lab/hoopo/issues/102)(7b-2: portal 出場メンバー 2D)
設計の正: docs/REQUIREMENTS.md §4.2-5・§4.2-7(コートの向き・配置)/ §5.2(チーム編成)/ §7(lineups)/ docs/DESIGN_GUIDELINES.md §1.3(コート 2D)・§2.3
視覚の正: docs/wireframes/wireframes-v6.html(portal スライド 8「出場メンバー(2D)」。3D は後追い)

## 目的

コーチが練習(試合)ごとにスターター5人(PG/SG/SF/PF/C)とベンチを編成し、保護者が練習詳細の
「出場メンバーはこちら」からリングを下にした 2D コートで配置を見られるところまで貫通させる。
スキーマは #6 の lineups をそのまま使い、新規マイグレーションはなし。3D 表示は別 Issue。

## 方針

```
[コーチ(admin)] 日程管理の各練習に「編成」→ /lineups/[practiceId] : ポジション5枠(セレクト)+ベンチ(チェック)→ 保存(全置換)
[保護者(portal)] 練習詳細「出場メンバーはこちら →」→ /practices/[id]/lineup : コート 2D(SVG、リング下)に5人のチップ、下段にベンチ
                 編成が無い練習ではボタンを出さない
```

### API 契約(7b-1 と 7b-2 が並列で実装するため先に固定する)

共通: `packages/api/src/lineups-shared.ts`(実装済み)— `POSITIONS`、`COURT_SPOTS`(left/top %)、`parseLineupInput`。

**7b-1 管理 API**(`packages/api/src/admin-app.ts`。ロジックは `lineups-coach.ts`)
- `GET /lineups/:practiceId` → `{ practice: Practice, starters: [{ child: {id,name,nicknameKana,grade}, position }], bench: [{ child }], members: [{id,name,nicknameKana,grade}] }`
  members は編成に使える有効な部員(学年降順→名前)。練習が無ければ 404
- `PUT /lineups/:practiceId` body `LineupInput` → `{ starters, bench }`。全置換(delete → insert)。部員がチームの有効な部員でなければ 400。
  スターター5人未満でも保存できる(編成途中)
- 関数: `getLineupForCoach(teamId, practiceId)`, `saveLineup(teamId, practiceId, input)`

**7b-2 保護者 API**(`packages/api/src/app.ts`。ロジックは `lineups-guardian.ts`)
- `GET /practices/:id/lineup` → `{ practice: Practice, starters: [{ child: {id,name,nicknameKana,grade}, position }], bench: [{ child }] } | 404`(練習なし)。
  編成が無い(0人)ときは `{ practice, starters: [], bench: [] }`(200)
- 関数: `getLineup(teamId, practiceId)`
- 練習詳細(`/practices/[id]`)は編成の有無で「出場メンバーはこちら →」を出し分ける(`hasLineup`)

### 設計判断

1. **配置は固定座標(COURT_SPOTS)**: §10 未決「C の左右指定」は持たない。SF/PF・C の左右はワイヤー既定(C は右)で固定し、
   必要になったら lineups に side 列を足す(マイグレーション+§7 更新)
2. **保存は全置換**: 5+ベンチ十数人の小さな集合。個別 CRUD より単純で整合が取りやすい(練習メニューと同じ判断)
3. **編成は練習単位**: 公式戦/練習試合の種別タグは §4.2-5 の将来検討。当面はどの練習にも編成を付けられる(備考で「練習試合」と分かる)
4. **保護者側は閲覧のみ・写真なし**: 顔写真(§9)はチーム内合意待ち。チップは頭文字(名簿と同じ)
5. **実行体制**: 共通モジュール・契約はメインセッション、7b-1 / 7b-2 を Opus サブエージェントに並列委譲。DB を使う検証と PR はメイン

## スコープ外

- 3D 表示(§4.2-7 後追い)、顔写真、公式戦/練習試合の種別タグ、C の左右指定

## 完了条件

- コーチが編成を保存でき、保護者の練習詳細から 2D コートで配置とベンチが見える
- Unit(入力検証)/ Integration(両 API+RLS)/ E2E(編成→保護者のコート表示)がグリーン
