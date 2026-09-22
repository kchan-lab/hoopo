# Changelog

## [0.8.0](https://github.com/kchan-lab/hoopo/compare/v0.7.0...v0.8.0) (2026-09-22)


### Features

* 予定表画像を縦1列に戻し、スマホ1画面に1か月が収まる縦長にする ([#216](https://github.com/kchan-lab/hoopo/issues/216)) ([1b1db4a](https://github.com/kchan-lab/hoopo/commit/1b1db4a69c99fcae8fec19ad5e6f11c35dce1328))

## [0.7.0](https://github.com/kchan-lab/hoopo/compare/v0.6.0...v0.7.0) (2026-09-21)


### Features

* 予定表画像を2カラムにして1か月を1画面で見渡せるようにする ([#208](https://github.com/kchan-lab/hoopo/issues/208)) ([809d1db](https://github.com/kchan-lab/hoopo/commit/809d1db99fec3e00d51a4ac7477543c141167aa4))


### Bug Fixes

* 保護者アプリのフォーム入力で iOS が勝手に拡大するのを直す ([#207](https://github.com/kchan-lab/hoopo/issues/207)) ([18a2d2b](https://github.com/kchan-lab/hoopo/commit/18a2d2b24f02d2447ad44e7fb04079b2f931fb8a))

## [0.6.0](https://github.com/kchan-lab/hoopo/compare/v0.5.0...v0.6.0) (2026-09-20)


### Features

* ヘッダーにチームのマークとアカウントのメニューを常設する ([#189](https://github.com/kchan-lab/hoopo/issues/189)) ([2b71dd2](https://github.com/kchan-lab/hoopo/commit/2b71dd2f0308437e3a15950be711409b8d296c32))
* 中学1年生を登録できるようにし、卒団を手動にする ([#191](https://github.com/kchan-lab/hoopo/issues/191)) ([49292ea](https://github.com/kchan-lab/hoopo/commit/49292ea9a9138cfd53cac45bea48a7b20a3c4cfd))


### Bug Fixes

* お子さんが未登録のとき、提出と月謝はホームへ送る ([#192](https://github.com/kchan-lab/hoopo/issues/192)) ([0f698d2](https://github.com/kchan-lab/hoopo/commit/0f698d22119de58de7605282a7a7b356e2d37f23))

## [0.5.0](https://github.com/kchan-lab/hoopo/compare/v0.4.0...v0.5.0) (2026-09-19)


### Features

* 参加できる時間帯を曜日ごとに設定できるようにする ([#177](https://github.com/kchan-lab/hoopo/issues/177)) ([b543578](https://github.com/kchan-lab/hoopo/commit/b543578dc9c2855c720b3b55bf60f5d443c2ef05))
* 参加予定の提出に確認画面を挟む ([#178](https://github.com/kchan-lab/hoopo/issues/178)) ([8a55abe](https://github.com/kchan-lab/hoopo/commit/8a55abe0c998b773bd6502ed5d3fea2902d7a904))


### Bug Fixes

* 参加できる時間帯を曜日未選択でも入力できる形に直す ([#180](https://github.com/kchan-lab/hoopo/issues/180)) ([c3cb6d8](https://github.com/kchan-lab/hoopo/commit/c3cb6d85f3934fdf61fed996183fa9697049f0d7))
* 提出中に確認画面から戻れてしまう問題と、未回答の数え方の食い違いを直す ([#181](https://github.com/kchan-lab/hoopo/issues/181)) ([54fd760](https://github.com/kchan-lab/hoopo/commit/54fd760968b7387bc8d60152f14da8089190e242))

## [0.4.0](https://github.com/kchan-lab/hoopo/compare/v0.3.0...v0.4.0) (2026-09-16)


### Features

* 名前の入力欄を漢字の行とよみの行に分ける ([#166](https://github.com/kchan-lab/hoopo/issues/166)) ([c4ebe17](https://github.com/kchan-lab/hoopo/commit/c4ebe17f7b61ba0ca9414bd434a117991b029273))


### Bug Fixes

* バックアップで PostgreSQL 17 の pg_dump を使うようにする ([#168](https://github.com/kchan-lab/hoopo/issues/168)) ([be21636](https://github.com/kchan-lab/hoopo/commit/be21636476f209a8ceebdc5e6488316eeecd51ca))

## [0.3.0](https://github.com/kchan-lab/hoopo/compare/v0.2.0...v0.3.0) (2026-09-15)


### Features

* お子さんの名前を姓と名に分け、よみで五十音順に並べる ([#158](https://github.com/kchan-lab/hoopo/issues/158)) ([701472a](https://github.com/kchan-lab/hoopo/commit/701472a1263c42f209e59d6e981ef8794be1f3a5))
* 初回登録に確認画面を挟む ([#159](https://github.com/kchan-lab/hoopo/issues/159)) ([469d65c](https://github.com/kchan-lab/hoopo/commit/469d65cc06927e322b3fc011503738bbdb950d9d))


### Bug Fixes

* 提出後に練習日が増えたら未回答があると分かるようにする ([#156](https://github.com/kchan-lab/hoopo/issues/156)) ([71678e8](https://github.com/kchan-lab/hoopo/commit/71678e8dc86f1d7860f3414a185eafa74268aaf8))

## [0.2.0](https://github.com/kchan-lab/hoopo/compare/v0.1.0...v0.2.0) (2026-09-14)


### Features

* 保護者アプリで生年月日と身長を入力し、学年を自動表示する ([6423254](https://github.com/kchan-lab/hoopo/commit/6423254c4c9f2265e8df35ee4bf1c4af276993cb)), closes [#132](https://github.com/kchan-lab/hoopo/issues/132)
* 参加予定を提出できたかどうかが画面で分かるようにする ([#149](https://github.com/kchan-lab/hoopo/issues/149)) ([3edeedf](https://github.com/kchan-lab/hoopo/commit/3edeedf5d638fc50bda208939dce9de06ac1fbec))
* 子どもの生年月日・身長を保持し、学年を生年月日から判定する ([b8745e9](https://github.com/kchan-lab/hoopo/commit/b8745e93007f97b1f19aeb41fffb9172a1e0a70d)), closes [#131](https://github.com/kchan-lab/hoopo/issues/131)
* 日程管理にカレンダーからのまとめ登録を追加する ([937e880](https://github.com/kchan-lab/hoopo/commit/937e88080079179b19c3af74211d8fc34eff2be3)), closes [#142](https://github.com/kchan-lab/hoopo/issues/142)
* 管理画面の部員管理で生年月日・身長を表示し、行詳細から直せるようにする ([816522f](https://github.com/kchan-lab/hoopo/commit/816522fadc0b4555f8d4df373b713f3fad9175fd)), closes [#133](https://github.com/kchan-lab/hoopo/issues/133)
* 練習日のまとめ登録 API と時間帯プリセットを追加する ([cb4b560](https://github.com/kchan-lab/hoopo/commit/cb4b560cdcc52df8624e277d89aebbf4d4f73d2a)), closes [#141](https://github.com/kchan-lab/hoopo/issues/141)


### Performance Improvements

* まとめ登録の重複除去を Set にして件数二乗の走査をなくす ([0a74d1e](https://github.com/kchan-lab/hoopo/commit/0a74d1e07c4a44fcf7961786bec613539db05e0f))

## 0.1.0 (2026-09-13)


### Features

* admin にお知らせ管理(下書き/公開・編集・削除、LINE 通知フラグ)を追加する ([dde5c47](https://github.com/kchan-lab/hoopo/commit/dde5c4740d5c386984c82451a78fb1cf472018ad))
* admin に出欠管理(マトリクス)と欠席者管理の画面を追加する ([6c1a475](https://github.com/kchan-lab/hoopo/commit/6c1a4754e40150d25eb26654bd032d780ef30f26))
* admin に日程管理画面(月切替・行入力・練習メニュー・削除)を追加する ([25700bc](https://github.com/kchan-lab/hoopo/commit/25700bcfc0dd8fd3366d431499520964e44f6dc2))
* admin に月謝管理(部員×1〜12月のグリッド、セルで済⇄未)を追加する ([85fea58](https://github.com/kchan-lab/hoopo/commit/85fea587c71a51225d2269001be0ba2a95154d68))
* admin に画面骨格(サイドバー/ドロワー)と認定管理・部員管理の画面を追加する ([56b7141](https://github.com/kchan-lab/hoopo/commit/56b71416d5ac7e659fe793df9d7a4d3dd0572cc2))
* admin のトップをダッシュボードにする(3カード・未提出一覧・通数プレースホルダ) ([2e6852d](https://github.com/kchan-lab/hoopo/commit/2e6852d9b43295099adc0f2d4f37653bd86b98cb))
* admin の日程管理に予定表の発行(二段階確認・発行済み表示・プレビュー)を追加する ([e523b49](https://github.com/kchan-lab/hoopo/commit/e523b490ee1b5486add21adeb8976f095a026d35))
* Drizzleスキーマとマイグレーション・開発用シードを追加する ([a42b2f6](https://github.com/kchan-lab/hoopo/commit/a42b2f6d69143635a26ac040ad6352397b4e27b5))
* LINE Webhook(groupId 取得)と Messaging API クライアントを実装する(縦切り6c-2) ([ace7b28](https://github.com/kchan-lab/hoopo/commit/ace7b288c6f9113959fc3ad87b694cf86984afa3)), closes [#27](https://github.com/kchan-lab/hoopo/issues/27) [#108](https://github.com/kchan-lab/hoopo/issues/108)
* pnpm workspacesでモノレポ骨格を作成 ([b1ff6fa](https://github.com/kchan-lab/hoopo/commit/b1ff6fa02d87d4fbd94ec83796529cdda9737ff7))
* portal にチーム名簿(頭文字・氏名・呼び名・学年)を追加する ([dd9b2a3](https://github.com/kchan-lab/hoopo/commit/dd9b2a37ea02171af7e153fb18caefa0e9d296ea))
* portal に予定表画像の動的生成エンドポイント(/api/schedule/YYYY-MM.png)を追加する ([9e1b6f1](https://github.com/kchan-lab/hoopo/commit/9e1b6f1e70b7360ef286e03c711f247b73f58f2b))
* portal に初回登録・招待コード連携・家族の設定の画面を追加する ([9832b3d](https://github.com/kchan-lab/hoopo/commit/9832b3d0dc3063e116d308181dde5a34a4e6e9cf))
* portal に参加予定の提出(リスト/カレンダー・一括チップ)とホームの未提出アラートを追加する ([10c87dd](https://github.com/kchan-lab/hoopo/commit/10c87ddedf9ab5a9f27b48d5d0f5e8300c6f3e20))
* portal に日程リスト/カレンダー・練習詳細・タブバー・ホームの次回練習を追加する ([28b0894](https://github.com/kchan-lab/hoopo/commit/28b08943c79469386c77e86207045c92cd5f8ae1))
* portal に月謝確認(封筒グリッド・済ハンコ)を追加する ([959bd14](https://github.com/kchan-lab/hoopo/commit/959bd145a2b0861b37ba32a778724bb7e628e894))
* portal のホームにお知らせ一覧を追加し、一覧・詳細ページを追加する ([7ed7866](https://github.com/kchan-lab/hoopo/commit/7ed786672f6179a34cc107df8200cc3b6d21d64c))
* prodマイグレーション適用スクリプトとリリース手順を整備する ([#57](https://github.com/kchan-lab/hoopo/issues/57)) ([4235b6e](https://github.com/kchan-lab/hoopo/commit/4235b6e6888a51b44d4a3e92a4f729f9de5a2fd0))
* RLSポリシーとIntegrationテスト基盤を追加する ([8957959](https://github.com/kchan-lab/hoopo/commit/89579597ba980cb3a4332add219a86a74250cf05))
* プライバシーポリシーを作成し、保護者アプリと管理ログイン画面に掲示する ([787adb6](https://github.com/kchan-lab/hoopo/commit/787adb665a48f12111d243c39840da764fae73d7)), closes [#21](https://github.com/kchan-lab/hoopo/issues/21)
* 予定表・お知らせのLINEグループ送信と通数カウンターを管理画面に追加する(縦切り6c-1) ([ece6c7a](https://github.com/kchan-lab/hoopo/commit/ece6c7ad895ca6ea02160a002ab858220e843db0)), closes [#27](https://github.com/kchan-lab/hoopo/issues/27) [#107](https://github.com/kchan-lab/hoopo/issues/107)
* 予定表の発行 API(月の練習の確定・発行状況)を追加する ([5c164a2](https://github.com/kchan-lab/hoopo/commit/5c164a2c3d1172e697edf25b1ebfa7bc26839bfa))
* 予定表画像のデータ取得とレイアウト計算を追加する ([bf533b7](https://github.com/kchan-lab/hoopo/commit/bf533b7fd7cfedd9b1fa26e36e62d5319fe9b706))
* 保護者LIFFログインとセッションを実装する(縦切り1a) ([#60](https://github.com/kchan-lab/hoopo/issues/60)) ([58a1353](https://github.com/kchan-lab/hoopo/commit/58a13536222f3dc6136cbd482a2bf934dbb15b55))
* 保護者アプリに出場メンバーの2Dコート表示を追加する(縦切り7b-2) ([be93f14](https://github.com/kchan-lab/hoopo/commit/be93f14ff4e8ea5cfd5a31265dae50bc12d5a9cb)), closes [#29](https://github.com/kchan-lab/hoopo/issues/29) [#102](https://github.com/kchan-lab/hoopo/issues/102)
* 保護者の参加予定 API(月の回答状況・一括保存・未回答件数)を追加する ([167c5ba](https://github.com/kchan-lab/hoopo/commit/167c5ba13817172e54a25599955681de37df8520))
* 保護者の子ども登録・招待コード連携・家族の設定 API を追加する ([24f792b](https://github.com/kchan-lab/hoopo/commit/24f792b7c94f116f5238d129676035ebdd9aec08))
* 保護者の月謝確認 API(お子さんごとの1〜12月の済/未/未来)を追加する ([8230d8b](https://github.com/kchan-lab/hoopo/commit/8230d8ba4cbd110cb97470195e39b920c7e5afc8))
* 保護者向けのお知らせ API(公開済みの一覧・詳細)を追加する ([b784719](https://github.com/kchan-lab/hoopo/commit/b784719f4428464344bb7af5a62929f5f8282d4d))
* 保護者向けのチーム名簿 API を追加する ([b067f49](https://github.com/kchan-lab/hoopo/commit/b067f49ad5fc90fed536a79d118dc997fba27d3a))
* 保護者向けの日程参照 API(月一覧・次回・詳細)を追加する ([45b4751](https://github.com/kchan-lab/hoopo/commit/45b475195b0387e2b4fb58d56f8ed8ea1f1d92ad))
* 出欠リマインド(手動送信+練習2日前の定期ジョブ)とバックアップの定期ジョブを追加する ([f8566d5](https://github.com/kchan-lab/hoopo/commit/f8566d5ef70ec952b3bf38ffc08ddce28a51269c)), closes [#20](https://github.com/kchan-lab/hoopo/issues/20)
* 卒団した部員のデータ削除(二段階確認+実行ログ)を部員管理に追加する ([515aadd](https://github.com/kchan-lab/hoopo/commit/515aaddaf1c96e0ee5bc95d3206e629b05541a25)), closes [#21](https://github.com/kchan-lab/hoopo/issues/21)
* 卒団後のデータ削除フローの土台(audit_logs・プラン)を追加する ([d9ff22f](https://github.com/kchan-lab/hoopo/commit/d9ff22f39e824460bf45ffa02b003cc6c43616fd)), closes [#21](https://github.com/kchan-lab/hoopo/issues/21)
* 家族の設定に「連携を解除」を追加し、分岐画面に二重登録の注記を出す ([7f62847](https://github.com/kchan-lab/hoopo/commit/7f628478a7db1744296e4cbae67dfa9867910393))
* 家族連携の解除 API(最後の保護者は不可)を追加し、家族間の整合を Integration で固定する ([ae839e1](https://github.com/kchan-lab/hoopo/commit/ae839e12ad2712e77b1df917edf7508e9ee9bf7e))
* 年度更新 API(実行・取り消し・状況)を追加する ([c4708de](https://github.com/kchan-lab/hoopo/commit/c4708deba4fd58e641f4a556a53aab85a93c5838))
* 年度更新の実行ログ year_rollovers テーブルを追加する(マイグレーション 0005) ([4c0df8a](https://github.com/kchan-lab/hoopo/commit/4c0df8ac3dcbe92a6e4d8204115651b50241969f))
* 招待コードの表示・入力フォーマットと衝突時の再生成を追加する ([c2d319d](https://github.com/kchan-lab/hoopo/commit/c2d319dae7a082ceba54099f3bc3f1aa605c2dd5))
* 月謝レコードの月次生成を DB 関数と定期ジョブとして追加する ([693af18](https://github.com/kchan-lab/hoopo/commit/693af187cb425ee930d1ee30e5c846332aeae2c1))
* 管理ダッシュボードの集計 API(提出率・次回参加人数・月謝未提出・未提出一覧)を追加する ([6004e67](https://github.com/kchan-lab/hoopo/commit/6004e67a8f8d9ae3ab006f4ac427cf5a0c01f6ce))
* 管理画面に練習ごとのチーム編成(スターター5枠+ベンチ)を追加する(縦切り7b-1) ([e57a801](https://github.com/kchan-lab/hoopo/commit/e57a801cefae1ca54bb5c470a717fa74118e1557)), closes [#29](https://github.com/kchan-lab/hoopo/issues/29) [#101](https://github.com/kchan-lab/hoopo/issues/101)
* 管理者LINEログインの土台(coachesのline_user_id列・プラン)を追加する ([fc28450](https://github.com/kchan-lab/hoopo/commit/fc284507d3a713852a0b2ec1ecfb95f727b70200)), closes [#61](https://github.com/kchan-lab/hoopo/issues/61)
* 管理者のLINEログインと「LINE を連携」を実装する ([71cef48](https://github.com/kchan-lab/hoopo/commit/71cef48d069ed5579f4a61244be76cc8ca681451)), closes [#61](https://github.com/kchan-lab/hoopo/issues/61)
* 管理者のメール+パスワードログインと管理UI基盤を実装する(縦切り1b) ([5d74111](https://github.com/kchan-lab/hoopo/commit/5d74111bbfae904fe2fe5bf30a2ac530c7f86345)), closes [#24](https://github.com/kchan-lab/hoopo/issues/24)
* 管理者のメールログインに試行回数制限(5回失敗で15分ロック)を追加する ([5bf3455](https://github.com/kchan-lab/hoopo/commit/5bf34552edfb9f29f1036dbca16dc063bb76de9e)), closes [#65](https://github.com/kchan-lab/hoopo/issues/65)
* 管理者ログインの試行回数制限の土台(coaches の失敗回数・ロック列とプラン)を追加する ([7940ece](https://github.com/kchan-lab/hoopo/commit/7940ecea3f18fef5b9e74f267f4d49ea54f83e97)), closes [#65](https://github.com/kchan-lab/hoopo/issues/65)
* 管理者向けのお知らせ API(一覧・作成・更新・削除、公開/下書き)を追加する ([8ffbb98](https://github.com/kchan-lab/hoopo/commit/8ffbb988bf14001be39bce229b83aad83fc414e0))
* 管理者向けの出欠マトリクス・欠席者 API を追加する ([903e316](https://github.com/kchan-lab/hoopo/commit/903e316eb35dc208090859211b37745a671ac5e6))
* 管理者向けの月謝グリッド取得と済⇄未の切替 API を追加する ([b31b4c0](https://github.com/kchan-lab/hoopo/commit/b31b4c0ad4717103050ab97aa90bc3e40b1adb5e))
* 管理者向けの認定履歴・無効化・部員一覧 API を追加する ([fcdb363](https://github.com/kchan-lab/hoopo/commit/fcdb36390ae294dc3cb44b70370939dc00620a90))
* 練習の登録・編集・削除 API と Asia/Tokyo の日付ユーティリティを追加する ([61f5ed0](https://github.com/kchan-lab/hoopo/commit/61f5ed0f0a6630f4f72564cacfaa7b1cc8fba32f))
* 縦切り4の共通モジュール(参加予定の3値・検証)とプラン・API 契約を追加する ([6d9fc67](https://github.com/kchan-lab/hoopo/commit/6d9fc67bf0d4bca1fc377f5f0244ed5f345abddb))
* 縦切り5の共通モジュール(月謝の3状態・検証)とプラン・API 契約を追加する ([5c000ad](https://github.com/kchan-lab/hoopo/commit/5c000adaf229ba52aff3d456593246d445db6ffc))
* 縦切り6aの共通モジュール(お知らせの入力検証)とプラン・API 契約を追加する ([a2dc7fe](https://github.com/kchan-lab/hoopo/commit/a2dc7fe7bceef76771a7177d1572f83912b0ba38))
* 縦切り6bの共通モジュール(予定表の行組み立て)とプラン・API 契約を追加する ([cfe7944](https://github.com/kchan-lab/hoopo/commit/cfe7944281736861a94a822435753930e4ba1988))
* 縦切り6cの土台(line_messages・通数計算・送信クライアント型・プラン)を追加する ([7db415f](https://github.com/kchan-lab/hoopo/commit/7db415f4d1f14fd88c2be600dea5b09524129fac)), closes [#27](https://github.com/kchan-lab/hoopo/issues/27)
* 縦切り7bの共通モジュール(出場メンバーのポジション・コート座標・検証)とプラン・API 契約を追加する ([31ca412](https://github.com/kchan-lab/hoopo/commit/31ca4120a9b88e4374022de48472ebfbabcafc12))
* 部員管理の「年度更新を実行」を有効化する(二段階確認・取り消し) ([0540475](https://github.com/kchan-lab/hoopo/commit/054047582850e01e49ae5fcf67dda2bd089dcf2e))


### Bug Fixes

* fork PRのauto-assignスキップとID失効時の注意を追記 ([64e5e26](https://github.com/kchan-lab/hoopo/commit/64e5e26deaf6216288cbae1429097435f39ca372))
* LINE の環境変数が未設定でも管理画面が起動するようにする ([daf71fd](https://github.com/kchan-lab/hoopo/commit/daf71fd289176ae6e2d7b94ddf28531fd7faa952))
* LINE 送信の通数チェックを直列化し、参加人数を短期キャッシュする ([7d3f17a](https://github.com/kchan-lab/hoopo/commit/7d3f17ac563ccd26514f073ba7b436066869779f))
* local-role.ts のロール名リテラルをLOCAL_APP_ROLE定数に統一する ([280186b](https://github.com/kchan-lab/hoopo/commit/280186bc87b70f255ccb8bf9f97e9ecb1ee85f88))
* prodマイグレーションの適用順序と確認プロンプトの堅牢性を改善する ([#58](https://github.com/kchan-lab/hoopo/issues/58)) ([1061a88](https://github.com/kchan-lab/hoopo/commit/1061a88350fc305a5be7edc7cc13db8c626100aa))
* schedule-editor.tsx の末尾スラッシュ除去も trimTrailingSlash に統一する ([a23561a](https://github.com/kchan-lab/hoopo/commit/a23561a23dedb4fdbd554ae644565a32e1da3f17))
* Webhook の失敗はエラー内容を残し、joinUrl の正規表現を置き換える ([b2be068](https://github.com/kchan-lab/hoopo/commit/b2be068ed8cc724d4f71f797e98a22ec9b1dea40))
* アプリロールのsearch_pathにpg_tempを明示しログインロールへも設定する ([915af45](https://github.com/kchan-lab/hoopo/commit/915af454cefe541ea872a41ddbf65289f813f540))
* ダッシュボードの参加人数を欠席者集計と同じトランザクションの部員数から求める ([50177ed](https://github.com/kchan-lab/hoopo/commit/50177ed0fb8381f7e63b287a64315ccad292e67f))
* ログイン失敗回数の更新を SQL で原子的に行い、E2E と並列テストを追加する ([073b1a4](https://github.com/kchan-lab/hoopo/commit/073b1a4cd31d7fd5f4a896e7c6da0f4ce0f1b722))
* 同じ日に複数の練習がある日のカレンダー操作が一括適用になることを明示する ([1312cf3](https://github.com/kchan-lab/hoopo/commit/1312cf3014ef654b38bca52fdd939039f573cb49))
* 子ども登録 API のレビュー指摘に対応する(兄弟の表示順・続柄の修正・存在確認の統一) ([2ead104](https://github.com/kchan-lab/hoopo/commit/2ead104ffd327548b01f2406f75b3042b6254fbd))
* 実行ログの純ロジックを分離し、audit_logs を追記専用にし、取り消しで戻らない件数を伝える ([388f25b](https://github.com/kchan-lab/hoopo/commit/388f25bf2077ffa50346ec2edd3e93f138c16a25))
* 家族連携の解除を子ども単位のアドバイザリロックで直列化する(同時解除による孤児化を防ぐ) ([fff7ea3](https://github.com/kchan-lab/hoopo/commit/fff7ea396d870667f7024de15807696c62bcf8ba))
* 手動リマインドの二重送信を確認文言で知らせ、通数不足のスキップを通知し、同日の練習を並列に集計する ([5e73086](https://github.com/kchan-lab/hoopo/commit/5e730869ab27d132665d8ef7516a7e6f15f72126))
* 招待コードの乱数を剰余なしで生成する(CodeQL 指摘) ([27de733](https://github.com/kchan-lab/hoopo/commit/27de733b6fb7ac2c4f6f16d21d25b2afca257a6e))
* 月謝レコード生成ジョブの発火時刻を JST の1日に合わせ、psql の stderr をログに出さない ([b18b99c](https://github.com/kchan-lab/hoopo/commit/b18b99cc3469ea7c0816c828dbb0f5af34201a03))
* 登録前の画面(ログイン前・はじめての方・登録画面)にもプライバシーポリシーへのリンクを置く ([b609643](https://github.com/kchan-lab/hoopo/commit/b60964336091d21fbbeeb73705de6b40491cdf80))
* 管理者ログインのダミーハッシュ反復回数とメールの大文字・空白を正規化する ([9b87a89](https://github.com/kchan-lab/hoopo/commit/9b87a89a18a421511d57724b3d5091c101e4332d))
* 練習詳細の UUID 検証を isUuid に統一し、日程 E2E のデバッグ出力を除去してホームの検証を強める ([9af719f](https://github.com/kchan-lab/hoopo/commit/9af719fe382009513f6b6a4589b9c2e49b6d216f))
* 署名ペイロードに用途の判別子を持たせ、未ログインの LINE 連携開始はログイン画面へ返す ([1f869c0](https://github.com/kchan-lab/hoopo/commit/1f869c0daa2fd1acc24e37b84529f626a37c4d0e))
* 認定管理・部員管理のレビュー指摘に対応する(SSR の認可統一・並び順・parseRevoke の Unit) ([4b8c32f](https://github.com/kchan-lab/hoopo/commit/4b8c32f6b31a39098a96a561943757d64c684aec))
