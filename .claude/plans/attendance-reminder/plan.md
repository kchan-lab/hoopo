# Plan: 出欠リマインド(手動+定期ジョブ)とバックアップジョブ(#20)

Issue: [#20](https://github.com/kchan-lab/hoopo/issues/20)
設計の正: docs/REQUIREMENTS.md §5.2(欠席者管理「未回答者はリマインド対象に指定可」)・§6(必須通知2: 出欠回答を促すリマインド、グループ宛て 1 通、月 200 通)/ CLAUDE.md 絶対原則3・技術スタック(定期ジョブは GitHub Actions schedule)/ line-send/plan.md 設計判断6(kind='reminder' は sendToGroup を再利用)

## 目的

未提出の保護者へ「出欠の提出をお願いします」をグループ宛て 1 通で送る。コーチが欠席者管理から手動で送れることに加え、練習の 2 日前に未提出があれば自動で 1 通送る。あわせて日次バックアップの定期ジョブを用意する(接続情報が揃うまではスキップ)。

## 方針

```
[手動] 欠席者管理(admin): 練習ごとの「未回答 n 人」の横に「リマインドを送る」→ 二段階確認(人数・通数・残り)→ POST /line/send/reminder { practiceId }
[自動] GitHub Actions(毎日 19:00 JST)→ POST <admin>/api/jobs/attendance-reminder(Authorization: Bearer CRON_SECRET)
       → 2 日後(Asia/Tokyo)に開催の練習で未回答が 1 人以上あれば、その日付分をまとめて 1 通(既に同じ日付の reminder ログが当日あればスキップ)
[バックアップ] GitHub Actions(毎日 04:00 JST)→ pg_dump(セッションモード 5432 の接続文字列)→ gzip → R2 へ `aws s3 cp`(S3 互換)。シークレット未設定の環境はスキップして通知だけ
```

### API 契約

**手動送信**(`admin-app.ts`。ロジックは `line-send.ts` の `sendAttendanceReminderToLine(teamId, practiceId, deps)`)
- `POST /line/send/reminder` body `{ practiceId }` → `201 { message, usage }`。練習が無い/非 UUID は 404、過去の練習(held_on < 今日)は 400「終了した練習には送れません」、未回答 0 人は 400「未回答の部員はいません」。未連携 409・枠超過 409・push 失敗 502 は他の送信と同じ
- 本文(`line-shared.ts` に `buildReminderMessages({ dates: [{ label, unanswered }], liffUrl })` を追加、Unit): 「M/D (曜) の練習の出欠がまだ提出されていない方は、提出をお願いします(未提出 n 人)。\n提出はこちらから\n<liffUrl>/attendance」。複数日はまとめて 1 通(行を並べる)。個人名は載せない(グループ宛てのため)
- ログ: kind='reminder'、ref=held_on(YYYY-MM-DD。複数日は先頭日付)

**定期ジョブ**(`packages/api/src/jobs-app.ts` の `createJobsApi(deps)`。admin の route.ts で `/api/jobs` にマウント。認証は `Authorization: Bearer <CRON_SECRET>`(timing-safe 比較。未設定なら 503))
- `POST /jobs/attendance-reminder` → `200 { sent: boolean, dates: string[], unanswered: number, skipped?: "already_sent" | "no_target" | "quota" }`。
  対象 = 今日(Asia/Tokyo)+2 日に開催の練習。`getAbsentees` の unanswered が 1 人以上の練習だけ。既に当日(JST)に同じ ref の reminder が sent ならスキップ。枠不足はスキップ(送らない・ログも残さない)
- ロジック `runAttendanceReminderJob(teamId, deps, now)`(`line-send.ts`)。手動送信と同じ `sendToGroup`

**ワークフロー**
- `.github/workflows/attendance-reminder.yml`: `cron: "0 10 * * *"`(19:00 JST)+ workflow_dispatch。STG/PROD それぞれ `${env}_ADMIN_URL` と `${env}_CRON_SECRET` が揃っていれば curl。応答の JSON を出力。fee-records.yml と同じ「未設定はスキップ・失敗は ::error」
- `.github/workflows/backup.yml`: `cron: "0 19 * * *"`(04:00 JST)。`${env}_BACKUP_DATABASE_URL`(5432 セッションモード・読み取り専用ロールでよい)、`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`。`pg_dump --no-owner --no-privileges -Fc` → `aws s3 cp --endpoint-url https://<account>.r2.cloudflarestorage.com` へ `hoopo/<env>/<YYYY-MM-DD>.dump`。世代管理は R2 側のライフサイクル(30 日)を推奨と README に記載。自宅 Proxmox への複製は R2 から rclone で取る運用(手順のみ docs)
- `.env.example` に `CRON_SECRET`

### 画面(admin 欠席者管理)

- 各練習カードの未回答欄に「リマインドを送る」(未回答 0 人・過去日は disabled)。二段階確認「グループ n 人に送信します(n 通消費・残り m 通)」→ 「送信しました HH:mm」。通数メーターは既存の LineMeter を再利用

### 設計判断

1. **自動は 2 日前・1 日 1 通まで**: 通数を抑えつつ提出の猶予を残す。同じ日に複数の練習があっても 1 通にまとめる
2. **ジョブは admin の API を HTTP で叩く**(DB 直よりアプリのロジック=通数・ログを通したい)。CRON_SECRET は Vercel の env と GitHub Secrets の両方に置く
3. **未回答 0 人なら送らない**(通数の無駄打ちをしない)。手動も同じ
4. **バックアップは R2(無料枠 10GB)**。pg_dump は Supavisor のトランザクションモード(6543)では動かないため 5432 のセッションモードを使う(接続文字列は承認者が用意)
5. **実行体制**: プランはメイン、実装は Opus サブエージェント(#21 後半と並列。admin-app.ts の競合は import 周辺のみ)。検証と PR はメイン

## スコープ外

- 個人宛てのリマインド(絶対原則3)。Proxmox への自動複製(手順のみ)。Supabase ping(#54 で実装済み)

## 完了条件

- 手動: 欠席者管理からリマインドを送ると reminder のログと通数が増え、本文に日付と未提出人数が入る
- 自動: CRON_SECRET 付きで叩くと 2 日後の未回答がある練習分だけ 1 通送り、同日の再実行はスキップ。秘密が違えば 401
- ワークフロー 2 本が `docker compose config` 相当で妥当(actionlint 相当のチェック)、未設定環境をスキップする
- Unit(本文・対象日の判定)/ Integration(手動送信の条件分岐・ジョブの送信/スキップ/401)/ E2E(欠席者管理から送信 1 本)がグリーン
