# Plan: チーム名簿(縦切り7a)

Issue: [#28](https://github.com/kchan-lab/hoopo/issues/28)(親: [#17](https://github.com/kchan-lab/hoopo/issues/17))
設計の正: docs/REQUIREMENTS.md §4.2-7(チーム: 全メンバー一覧)/ CLAUDE.md 絶対原則4 / docs/DESIGN_GUIDELINES.md §1.3(名簿行)
視覚の正: docs/wireframes/wireframes-v6.html(portal「チーム」スライド)

## 目的

保護者がタブバー「チーム」から全メンバー一覧(頭文字アバター・氏名・呼び名ひらがな・学年)を見られるようにする。
コート配置(出場メンバー)は 7b(#29)で日程詳細から遷移する。新規マイグレーションはなし。

## 方針

```
[保護者(portal)] タブバー「チーム」→ /team : 名簿行(頭文字丸 33px tint/deep + 氏名 13px/600 + 呼び名 11px sub + 学年ピル)
                 並びは学年降順→名前(部員管理・出欠と同じ規則)
```

### API 契約

- 保護者 API `GET /team/members` → `{ members: [{ id, name, nicknameKana, grade }] }`
  active・非アーカイブの部員。関数 `listTeamMembers(teamId)`(`packages/api/src/team.ts`)
- 性別は載せない(§4.2-7 の表示項目は学年・フルネーム・呼び名。絶対原則4: 表示は必要最小限)

### 設計判断

1. **表示は氏名・呼び名・学年のみ**: 保護者どうしが互いの子を識別できれば足りる。伝達事項・招待コード・保護者数は管理側のみ
2. **頭文字アバターは氏名の先頭1文字**: 顔写真(§9)はチーム内合意待ちのため出さない。写真対応は別 Issue
3. **子ども未連携でも閲覧可**: 日程と同じくチームの公開情報。ただしログインは必須
4. **実行体制**: プランはメインセッション、実装は Opus サブエージェント(7c と並列)。DB を使う検証と PR はメイン

## 完了条件

- /team に全メンバーが学年降順→名前で並び、無効化・アーカイブ済みは出ない
- Integration(API+RLS)/ E2E(タブ「チーム」→ 名簿に登録した子が出る)がグリーン
