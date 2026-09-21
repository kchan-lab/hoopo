# Task: @types/node を Node 24 系にそろえる

Issue: [#209](https://github.com/kchan-lab/hoopo/issues/209) / Plan: [plan.md](plan.md)

- [x] ワークスペース全体(ルート・api・line・db・portal・admin)の `@types/node` を `^24.13.6` に統一
- [x] api の `session.ts` で `CryptoKey` を型として使っていた箇所を推論に置き換え(24 系の型定義では値のみ)
- [x] `renovate.json` に `@types/node` の `allowedVersions: "<25"` を追加
- [x] `pnpm install` でロックファイルを作り直し、全 importer が 24 系に解決されることを確認
- [x] lint / typecheck / test / test-int をローカルで通す(test-int のカタログ検査 1 件は既存の別問題: 0001 以降に追加した 3 テーブルで anon / authenticated の権限が剥奪されていない。別 Issue で対応)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #209`)
- [ ] マージ後、Renovate が作り直した #197 の CI が通ることを確認
