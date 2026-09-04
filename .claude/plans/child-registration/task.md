# Task: 子ども登録フローと部員管理(縦切り2)

Issue: [#12](https://github.com/kchan-lab/hoopo/issues/12) / Plan: [plan.md](plan.md)

Sub-issue 2本(12a → 12b の順)で実装する。起票時に親 #12 へ紐付ける
(`gh api -X POST repos/kchan-lab/hoopo/issues/12/sub_issues -F sub_issue_id=<id>`)。

## 着手前(ドキュメント先行・共通基盤)

- [x] REQUIREMENTS.md 更新: §3 に「コーチへの通知=管理画面(認定管理)での確認」と
      続柄入力を明記、§5.2 認定管理の表現を追随(plan.md 判断1・4)
- [x] Sub-issue 12a(#66)/ 12b(#67)を起票し、親 #12 に紐付け・ボード確認(#66 In Progress)

## 12a: 保護者の登録導線(portal)— #66 / feat/child-registration

- [x] packages/db: `resolveInviteCode(code)` ヘルパ(client.ts)+ 招待コード
      衝突リトライ+表示/入力フォーマッタ(5-5 ハイフン・正規化)+ Unit(6件)
- [x] packages/api: requireGuardian / requireCoach ミドルウェア切り出し(guard.ts。/me を移行)
- [x] packages/api: `POST /children`(①②の一括登録: 兄弟複数・availabilities 展開・
      relation。自動認定 active)/ `POST /family-links`(コード連携)/
      `GET /children`(自分の子一覧。分岐判定にも使用)/ `GET /family`(家族の設定用)
- [x] portal UI 基盤: globals.css(§1 トークン・fld2/inbox/seg2/days7/cta 相当)
- [x] 画面: 分岐(ワイヤー15)→ 登録①(兄弟追加可)→ ②(曜日7ボタン・時間レンジ・
      伝達事項・続柄)→ 完了でホームへ / 招待コード入力 / 家族の設定(ワイヤー14)
- [x] e2e/login.spec.ts・smoke.spec.ts の文言依存を修正(page.tsx 変更に追随)
- [x] Unit: parseRegistration / parseLink(15件)/ Integration: 登録・連携・冪等・
      無効化後の不可視・他チームのコード・RLS 越境・保持列の範囲(8件)/
      E2E: 新規登録導線(兄弟2人→ホーム→家族の設定)+コード連携導線(2件×2端末)
- [x] e2e-check: Unit 61 / Integration 43 / E2E 16 passed(2026-09-05)
- [ ] PR(`Refs #12` + `Closes #66`)→ CI → merge commit でマージ

## 12b: 管理の認定管理・部員管理(admin)

- [ ] admin レイアウト基盤: PC=左サイドバー(170px)/ モバイル=ドロワー(§5.1)
- [ ] packages/api(admin): `GET /registrations`(認定履歴: children+guardian_children を
      新着順にマージ)/ `POST /registrations/revoke`(種別+id で status=revoked)/
      `GET /members`(部員一覧+詳細)
- [ ] 画面: 認定管理(カード+認定済(自動)ピル+無効化ボタン、ワイヤー PC-5/SP-6)/
      部員管理(テーブル+行詳細、年度更新ボタンは disabled、ワイヤー PC-8/SP-9)
- [ ] Integration: revoke 後に保護者から見えないこと・RLS / E2E: 登録→認定管理に
      表示→無効化の導線
- [ ] PR(`Closes #12` + `Closes #67`)→ CI → merge commit でマージ

## マージ後

- [ ] stg で実 LINE アカウントから登録導線を確認(#9 の LIFF 設定は済み)
- [x] (#68 起票済み)compose の portal / admin が同時に `pnpm install` して node_modules ボリュームで競合する
      問題(`rename ... .pnpm-workspace-state-v1.json ENOENT` で portal が exit)を Issue 化。
      2026-08-20/21 の nightly 失敗(`dependency failed to start`)もこれの可能性が高い
- [ ] 年度更新の Issue を起票(部員管理のボタン有効化とセット)
