# Plan: 管理ダッシュボード仕上げ(縦切り7c)

Issue: [#30](https://github.com/kchan-lab/hoopo/issues/30)(親: [#17](https://github.com/kchan-lab/hoopo/issues/17))
設計の正: docs/REQUIREMENTS.md §5.2(ダッシュボード: 提出率 / 次回参加人数 / 月謝未提出数)/ docs/DESIGN_GUIDELINES.md §2.3(LINE 通数メーター)
視覚の正: docs/wireframes/wireframes-v6.html(admin PC-2 / SP-3)

## 目的

管理トップ(ダッシュボード)に運用に必要な数字を集約する: 今月の提出率、次回練習の参加人数、今月の月謝未提出数、
未提出の部員一覧、LINE 通数メーター(6c まではプレースホルダ)。既存のドメイン関数(出欠・月謝・練習)を組み合わせ、
新規マイグレーションはなし。

## 方針

```
[コーチ(admin)] / (ダッシュボード): カード3枚(提出率 n% (回答/全体) / 次回参加人数 ○n △n ×n −n / 月謝未提出 n人)
                 + 「未提出の保護者(M月)」の行リスト(部員名・学年・未回答件数)+ 「今月の LINE 通数 − / 200」(6c)
                 各カードから該当画面(出欠管理・欠席者管理・月謝管理)へリンク
```

### API 契約

- 管理 API `GET /dashboard` → `{ month, currentMonth, submission: { answered, total, rate }, nextPractice: { practice: Practice, full, partial, absent, unanswered } | null, fees: { unpaidCount, total }, unansweredMembers: [{ id, name, grade, unanswered }] }`
  - submission: 今月の練習 × 有効な部員のうち回答済みの割合(rate は 0〜100 の整数。total 0 なら 0)
  - nextPractice: Tokyo の今日以降の最初の練習と、その回答内訳(getAbsentees を再利用してよい)
  - fees: 今月の「未」の部員数(fees-coach の getFeeGrid を再利用)
  - unansweredMembers: 今月に未回答の練習が1件以上ある部員(学年降順→名前)
- 関数 `getDashboard(teamId, today)`(`packages/api/src/dashboard.ts`)

### 設計判断

1. **既存関数の合成で作り、新しいクエリを増やさない**: getAttendanceMatrix / getAbsentees / getFeeGrid / getNextPractice の組み合わせ。
   件数の多さは小規模チーム前提(部員 30 人程度)で問題にならない
2. **LINE 通数はプレースホルダ**: 送信ログテーブルは 6c で設計する。カードとメーターだけ置き「6c で有効化」と明記
3. **ホームの「ログインしました」文言は廃止**: E2E(admin-login.spec / admin-*.spec の loginAsCoach)が依存しているので、
   ダッシュボードの見出し「ダッシュボード」に置き換え、E2E の期待値を更新する
4. **実行体制**: プランはメインセッション、実装は Opus サブエージェント(7a と並列)。DB を使う検証と PR はメイン

## 完了条件

- 管理トップに3カード・未提出一覧・通数プレースホルダが出て、数字が Integration で検証されている
- E2E(登録→提出→ダッシュボードの数字と未提出一覧に反映)がグリーン
