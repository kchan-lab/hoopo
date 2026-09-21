# Task: 保護者アプリのフォーム部品を 16px 以上にする

Issue: [#205](https://github.com/kchan-lab/hoopo/issues/205) / Plan: [plan.md](plan.md)

## 棚卸し

- [x] portal の input / select / textarea を洗い出し、実効フォントサイズが 16px 未満のものを特定する
      (`font-size: inherit` のため親の指定にも依存する。クラス定義だけを見て終わりにしない)

## ドキュメント

- [x] `docs/DESIGN_GUIDELINES.md` §3 に「フォーム部品の実効フォントサイズは 16px 以上」を追記する

## 実装

- [x] `.inbox`(globals.css:402)を 16px 以上にする
- [x] `.sbr input` / `.sbr select`(:1186, :1199)を 16px 以上にする
- [x] 棚卸しで見つかったその他のフォーム部品を 16px 以上にする
- [x] 崩れた箇所のレイアウトを調整する(行の高さ・余白・列幅。タップ領域44pxは維持)

## 検証(このエージェントの担当)

- [x] Unit テストを追加・更新する
- [x] `pnpm lint` が green
- [x] `pnpm typecheck` が green

## 検証(メインセッションが直列で実施)

- [x] `pnpm test:int`
- [x] `pnpm test:e2e`
- [ ] 各フォーム画面(招待コード入力・お子さんの登録・家族設定・参加予定の提出)の目視確認
- [ ] 実機(iPhone)で自動ズームが起きないことの確認

## 仕上げ

- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #205`)

## 検証の記録

- Unit `pnpm test`: 297 passed(`apps/portal/app/globals.test.ts` の8件を含む)
- Integration `pnpm test:int`: 244 passed。唯一の失敗 `packages/db/test/catalog.int.test.ts` は
  本ブランチの変更を退避しても再現する既存問題(#206 として起票済み)
- E2E `pnpm test:e2e`: 122 passed / 4 skipped、失敗ゼロ
- `pnpm lint` / `pnpm typecheck`: green

### 統合時に直したもの

`e2e/registration.spec.ts` の `expectNoAutoZoom` のスコープが `page.locator("main")` になっていたが、
お子さんの登録画面と招待コード入力画面には `<main>` 要素が無く(`<header>` + `<form>` 構造)、
対象0件でヘルパーのガードが発火して desktop / mobile の2件が落ちていた。スコープを `page` に変更した。
