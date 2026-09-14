# Task: お子さんの名前を姓と名に分けて保持する

Issue: [#155](https://github.com/kchan-lab/hoopo/issues/155) / Plan: [plan.md](plan.md)

## 実装(feat/child-name-split)

- [x] docs: REQUIREMENTS §3 / §4.2-7 / §4.2-9 / §5.2 / §7 と PRIVACY_POLICY の「名前」の記述
- [x] db: マイグレーション 0011(family_name / given_name / family_name_kana / given_name_kana を NOT NULL で追加、name を削除)+ schema + seed
- [x] api: `fullName()` を共通化し、検証(姓・名・よみがそれぞれ必須・25 文字以内、よみはひらがなのみ)を registration-shared へ
- [x] api: 登録・家族・部員管理・名簿・出欠・月謝・編成・ダッシュボード・予定表画像・LINE 文面の参照を置換
- [x] api: 並び順を `grade desc, family_name_kana, given_name_kana`(五十音順)に
- [x] portal: 登録フォーム(姓 → 姓のよみ → 名 → 名のよみ → 呼び名)、家族の設定の編集、ホーム・名簿・出欠・月謝・編成の表示
- [x] admin: 部員管理(一覧・行詳細・卒団)、出欠・欠席者・月謝・編成・ダッシュボードの表示
- [x] test: Unit(検証・組み立て)、Integration(登録・編集・並び順)、E2E(登録 → 名簿 → 管理)
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #155`)

## 適用(マイグレーション 0011 はデータ 0 件が前提)

- [ ] stg: `children` の件数を確認(0 でなければ、読みが `ふめい` で埋まるので作り直すか手で直す)
- [ ] stg: `pnpm db:migrate:stg` → 実機で登録・名簿・部員管理を確認
- [ ] prod: リリース PR の前に件数 0 を確認し、`pnpm db:migrate:prod`(docs/DEVELOPMENT.md の手順)
