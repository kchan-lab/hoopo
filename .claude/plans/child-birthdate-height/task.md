# Task: 生年月日からの学年判定と身長の保持

Issue: [#128](https://github.com/kchan-lab/hoopo/issues/128) / Plan: [plan.md](plan.md)

## 128a: ドキュメント・DB・API(feat/child-birthdate-height-api)

- [x] CLAUDE.md 絶対原則 4 を改定(保持対象に生年月日・身長を追加、保護者本人の情報は従来どおり保存しない)
- [x] docs/REQUIREMENTS.md §3(初回登録①: 学年→生年月日・身長)・§5.2(部員管理の列・編集)・§7(children に birth_date / height_cm)
- [x] マイグレーション 0010(birth_date / height_cm、height の CHECK)+ schema/tables.ts + seed
- [x] `grade-shared.ts`: gradeFromBirthDate / HEIGHT_MIN・MAX / parseChildPatch + Unit(4/1・4/2・うるう年・範囲外)
- [x] registration-shared.ts: ChildInput を birthDate / heightCm に変更(grade はサーバーで算出)
- [x] registration.ts: registerChildren で算出、getFamily に birthDate / heightCm、updateChildByGuardian
- [x] members.ts: listMembers / detail に birthDate / heightCm、updateMemberByCoach
- [x] portal / admin の Route Handler: PATCH /api/children/:id、PATCH /api/members/:id
- [x] Integration: 登録で学年が算出される / 編集で再計算される / 他チーム不可視
- [ ] PR 作成 → CI グリーン → development へ merge commit でマージ(`Closes #131`)

## 128b: portal(feat/child-birthdate-height-portal)

- [x] 登録①: 学年セレクトを生年月日(date 入力)+身長(number)に置き換え、算出した学年を表示
- [x] 家族の設定: 子どもごとに生年月日・身長を編集(学年は再計算表示)
- [x] プライバシーポリシー: 取得する情報に生年月日・身長を追加、「生年月日はお聞きしません」を保護者本人に限定
- [x] E2E: registration.spec / family-links.spec / privacy.spec の更新
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #132`)

## 128c: admin(feat/child-birthdate-height-admin)

- [ ] 部員管理: 一覧に生年月日・身長(モバイルは詳細側)、行詳細に編集フォーム
- [ ] E2E: admin-members.spec の更新
- [ ] PR 作成 → CI グリーン → development へマージ(`Closes #133`)

## 仕上げ

- [ ] stg に 0010 を適用(`pnpm db:migrate:stg`)し、実機で登録→学年表示を確認
- [ ] リリース PR で prod に 0010 を適用(docs/DEVELOPMENT.md「prod マイグレーション適用」)
