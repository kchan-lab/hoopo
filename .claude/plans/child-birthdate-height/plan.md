# Plan: 生年月日からの学年判定と身長の保持

Issue: [#128](https://github.com/kchan-lab/hoopo/issues/128)
Sub-issue: [#131](https://github.com/kchan-lab/hoopo/issues/131)(128a: docs・DB・API)/ [#132](https://github.com/kchan-lab/hoopo/issues/132)(128b: portal)/ [#133](https://github.com/kchan-lab/hoopo/issues/133)(128c: admin)
設計の正: CLAUDE.md 絶対原則 2・4(本 Issue で 4 を改定)/ docs/REQUIREMENTS.md §3(初回登録)・§5.2(部員管理)・§7(データモデル)/ docs/DESIGN_GUIDELINES.md §1・§2
関連プラン: child-registration(登録フロー)/ year-rollover(年度更新)/ member-deletion(削除)/ privacy-policy(掲示文)

## 目的

保護者が子どもを登録するとき、学年を選ぶ代わりに生年月日を入力すると学年が自動で決まるようにする。
生年月日と身長を部員の情報として保持し、保護者は家族の設定から、コーチは部員管理から後から直せるようにする。

## 方針

```
[入力]  生年月日(YYYY-MM-DD) ──→ gradeFromBirthDate(基準日 = 今日 Asia/Tokyo) ──→ 学年(1..6)
        身長(cm・整数)                                                         │
[保存]  children.birth_date / children.height_cm / children.grade(従来どおり列として保持)
[表示]  学年は従来どおり children.grade を使う(名簿・出欠・月謝・編成・年度更新は無変更)
[編集]  portal 家族の設定: 生年月日・身長を修正 → 学年を再計算して保存
        admin 部員管理: 一覧に生年月日・身長、行詳細から修正
```

学齢の基準は日本の小学校(4 月 2 日〜翌 4 月 1 日生まれが同学年)。基準日は Asia/Tokyo の「今日」。

### 設計判断

1. **生年月日と身長を保存する(絶対原則 4 の改定)**: 承認者が 2026-09-13 に「保存する」を選択。
   身長は成長記録として、生年月日は学年の正として持つ。CLAUDE.md 原則 4 の保持対象に
   「生年月日・身長」を加え、「生年月日は保存しない」の文言は保護者本人の情報に限定する。
   REQUIREMENTS §3・§5.2・§7 とプライバシーポリシー(portal の掲示文)も同時に改定する。
   退けた案: 生年月日を学年算出だけに使って捨てる(原則 4 は守れるが、家族の設定での
   再計算や年度のズレ検知ができず、承認者の要望とも合わない)。
2. **children.grade は列として残し、生年月日から「入力時に」算出して保存する**:
   学年を読む箇所(名簿・出欠・月謝・編成・ダッシュボード・年度更新・削除ログ)が多く、
   生成列や毎回の算出に置き換えると差分が広がる。年度更新の「+1」は学齢基準で 1 年進む
   ことと等価なので、生年月日がある部員でも rollover のロジックは変えない(snapshot・
   取り消しも既存のまま)。生年月日と grade の食い違いは、保護者・コーチの編集時に再計算で
   解消する。退けた案: 年度更新で生年月日から再計算(取り消しの意味論が複雑になり、
   「学年は据え置きで卒団」の仕様とも噛み合わない)。
3. **新規登録は生年月日・身長とも必須、既存部員は NULL 許容**: 承認者の指定(身長は必須)。
   既存行に値は無いので列は NULL 許容で追加(additive)し、既存部員は家族の設定または
   部員管理から後から入れる。生年月日から算出した学年が 1〜6 に入らないときは
   「小学生の生年月日を入力してください」で拒否する。身長は 80〜220 cm の整数(CHECK 制約)。
4. **学年算出は DB 非依存の純関数として `@hoopo/api/shared` に置く**:
   `gradeFromBirthDate(birthDate, today)`。portal のクライアントで入力中に学年を即表示し、
   サーバーで同じ関数を使って保存する(クライアント表示は目安、正はサーバー)。
   境界(4/1・4/2、うるう年、入学前・卒業後)は Unit テストで固定する。
5. **編集 API を新設する(これまで子ども情報の編集はなかった)**:
   - 保護者: `PATCH /api/children/:id`(name / nicknameKana / birthDate / heightCm / gender)。
     active な guardian_children 経由で見える子だけ。学年は birthDate から再計算
   - コーチ: `PATCH /api/members/:id`(同項目)。RLS 配下で自チームのみ
   退けた案: 生年月日・身長だけの専用エンドポイント(名前の修正も同じ画面でできる方が自然で、
   項目を絞る理由がない)。
6. **削除ログ(audit_logs)には生年月日・身長を入れない**: 削除の記録が個人情報の保持に
   ならないようにする(member-deletion 設計判断 3 と同じ)。
7. **Sub-issue 3 本に分けて実装する**(issue-plan の実行体制):
   - 128a: ドキュメント改定+DB(0010)+共通モジュール+API(登録・編集)+Integration
   - 128b: portal(登録①の学年セレクト→生年月日・身長入力、家族の設定の編集、プライバシーポリシー文言)+E2E
   - 128c: admin(部員管理の列追加・行詳細の編集)+E2E
   128a が先行。128b / 128c は 128a の API 契約(下記)に依存し、互いには独立なので並列可。

## API 契約(128b / 128c が依存)

- `POST /api/children`(既存・変更): `children[].grade` を廃止し `birthDate`("YYYY-MM-DD")と
  `heightCm`(整数)を必須にする。レスポンスは従来どおり(grade は算出値)
- `PATCH /api/children/:id`(portal・新規): body `{ name?, nicknameKana?, birthDate?, heightCm?, gender? }`
  → 200 `{ id, name, nicknameKana, grade, gender, birthDate, heightCm }` / 400(検証)/ 404(見えない)
- `GET /api/family`(既存・拡張): 子どもごとに `birthDate` / `heightCm` を追加
- `listMembers` / `getMemberDetail`(admin・拡張): `birthDate` / `heightCm` を追加
- `PATCH /api/members/:id`(admin・新規): body・レスポンスは portal と同形
- 共通: `gradeFromBirthDate(birthDate: string, today: string): number | null`(1..6 以外は null)、
  `parseChildPatch(body)`、`HEIGHT_MIN = 80` / `HEIGHT_MAX = 220`

## DB(マイグレーション 0010)

```sql
ALTER TABLE children ADD COLUMN birth_date date, ADD COLUMN height_cm smallint;
ALTER TABLE children ADD CONSTRAINT children_height_cm_check CHECK (height_cm IS NULL OR height_cm BETWEEN 80 AND 220);
```

RLS ポリシーは既存(team_id)のままで追加なし。seed の子どもに生年月日・身長を入れる(E2E 用)。

## 完了条件

- 4/1 生まれと 4/2 生まれで学年が分かれ、入学前・卒業後は拒否される(Unit)
- 登録 API が生年月日・身長を保存し、学年が算出値になる。編集 API で身長・生年月日を直すと学年が再計算される。他チームからは見えない(Integration)
- portal で生年月日・身長を入力して登録すると学年が表示され、家族の設定から身長を直せる。admin の部員管理で生年月日・身長が見え、編集できる(E2E)
- CLAUDE.md 原則 4・REQUIREMENTS §3/§5.2/§7・プライバシーポリシーが改定されている
- prod への 0010 適用はリリース手順(docs/DEVELOPMENT.md)に従う
