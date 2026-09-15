# Task: 初回登録に確認画面(③)を挟む

Issue: [#157](https://github.com/kchan-lab/hoopo/issues/157) / Plan: [plan.md](plan.md)

## 実装(feat/registration-confirm-step)

- [x] docs: REQUIREMENTS §3(2ステップ → 3ステップ・③の項目)と §4.2-2(初回登録①②③)
- [x] portal: `step` を `1 | 2 | 3` に。見出しを `1/3` `2/3` `3/3` へ
- [x] portal: ②の CTA を「登録を完了する」→「確認へ進む」にし、曜日・続柄の検証を②→③へ移す
- [x] portal: ③(入力内容の確認)の描画 — お子さんごとに お名前 / よみ / 呼び名 / 生年月日 /
      学年 / 身長 / 性別、続けて 参加できる曜日 / 時間帯 / 続柄 / 伝達事項。任意項目の空欄は「未入力」
- [x] portal: ③の CTA「この内容で登録する」(送信)と「修正する」(②へ)。お子さんの欄に「①を修正」
- [x] portal: 分岐画面の「登録画面(1/2)へ進みます」→ `1/3`
- [x] css: `.news .row .val`(伝達事項の改行を保って折り返す)だけ追加
- [x] test: E2E 既存の「兄弟2人を登録」を③経由に更新、「③から修正して戻る」を追加
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #157`)

## 確認(ローカル)

- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test`
- [ ] `pnpm test:e2e`(親セッションが実行。共有コンテナのため同時実行しない)
