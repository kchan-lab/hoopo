# Plan: 保護者アプリのフォーム部品を 16px 以上にする

Issue: [#205](https://github.com/kchan-lab/hoopo/issues/205)
設計の正: `docs/DESIGN_GUIDELINES.md` §3 アクセシビリティ、CLAUDE.md 絶対原則6(保護者UI)

## 目的

保護者アプリ(portal)を iPhone で操作したとき、フォームにフォーカスすると自動でズームし、
入力後に手で縮小しないと次のフォームへ進めない状態を解消する。

iOS Safari はフォーカスしたフォーム部品の実効フォントサイズが 16px 未満だと自動的に拡大し、
**blur しても元の倍率に戻さない**。そのため次のフォームへ移るたびに手動でピンチアウトが要る。

## 原因(調査済み)

`apps/portal/app/globals.css` でフォーム部品に 16px 未満が直接指定されているのは2系統。

| セレクタ | 行 | 現状 | 影響する画面 |
|---|---|---|---|
| `.inbox` | :402 | 13px | 招待コード入力 / お子さんの登録 / 家族設定の編集(24箇所) |
| `.sbr input` | :1199 | 11.5px | 参加予定の提出 |
| `.sbr select` | :1186 | 11.5px | 参加予定の提出 |

`.inbox` の使用箇所は `apps/portal/app/invite-form.tsx` /
`apps/portal/app/register/register-form.tsx` / `apps/portal/app/family/child-edit.tsx`。

`input, select, textarea { font-size: inherit }`(:38)のため、上記以外にも
**親の指定次第で 16px を割る部品が残る可能性がある**。実装時に棚卸しする。

## 方針

フォーム部品(input / select / textarea)の実効フォントサイズを **一律 16px 以上**にする。

### 設計判断

1. **ズーム禁止(`user-scalable=no` / `maximum-scale=1`)は採用しない**:
   iOS 10 以降の Safari は `user-scalable=no` を無視する(Apple がアクセシビリティ保護のため
   意図的にそうしている)一方、Android Chrome は素直に効く。結果として
   「iPhone では拡大できるが Android では拡大できない」という環境で割れた状態になる。
   `maximum-scale=1` のみで自動ズームが止まるという説もあるが iOS のバージョンで挙動が変わる領域で、
   確実でない方法に依存しない。加えて `docs/DESIGN_GUIDELINES.md` §3 の
   「コントラスト4.5:1以上」「タップ領域44px」という視認性重視の方針と逆を向く。
   保護者には送迎する祖父母が含まれうる。

2. **タッチ端末限定(`@media (pointer: coarse)`)にせず一律にする**:
   portal はスマホがメインの導線(LINE のトークから LIFF で開く)であり、
   PC のために規則を二重に持つ理由が薄い。規則を分けると今後 PC とスマホで見え方が食い違い、
   どちらを正とするかの判断が増える。そもそも 11.5px / 13px は PC で見ても小さい。

3. **窮屈になったら文字を戻さずレイアウトを調整する**:
   `.sbr`(参加予定の提出)は 11.5px → 16px で 4.5px 上がるため行が窮屈になりうる。
   その場合は行の高さ・余白・列幅の側を調整する。優先順位は
   **「読めること > 既存の見た目の維持」**。タップ領域44px(§3)は維持する。

4. **判断を `docs/DESIGN_GUIDELINES.md` §3 に規範として残す**:
   「フォーム部品の実効フォントサイズは 16px 以上(iOS の自動ズーム回避。ズーム禁止は行わない)」
   を追記する。追記しないと、将来また小さい値が入って同じ問題が再発する。

5. **viewport 設定は変えない**: `apps/portal/app/layout.tsx:9` の
   `width: device-width` / `initialScale: 1` / `viewportFit: cover` は現状が正しい。
   `maximumScale` を足さない(設計判断1)。

6. **管理アプリ(admin)は対象外**: admin はモノトーンで文字サイズ3段階を持つ別世界
   (CLAUDE.md 絶対原則6)。PC 利用が主で、同じ問題があっても別 Issue として扱う。

## 完了条件

- iPhone でフォームにフォーカスしても自動ズームが起きない
- ピンチズームは従来どおり使える(`maximum-scale` でズームを禁止していない)
- 文字サイズ変更による表示崩れがない。タップ領域44pxを維持している
- 保護者向けの全フォーム画面で 16px 未満のフォーム部品が残っていない
- `docs/DESIGN_GUIDELINES.md` §3 に方針が明記されている
- Unit / Integration / E2E が green
