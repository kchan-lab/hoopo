# Plan: LINE グループ送信+通数カウンター(縦切り6c)

Issue: [#27](https://github.com/kchan-lab/hoopo/issues/27)(親: [#16](https://github.com/kchan-lab/hoopo/issues/16))
Sub-issue: [#107](https://github.com/kchan-lab/hoopo/issues/107)(6c-1: 送信 API+管理 UI)/ [#108](https://github.com/kchan-lab/hoopo/issues/108)(6c-2: Webhook・クライアント)
設計の正: docs/REQUIREMENTS.md §6(LINE 連携)・§5.2(日程管理・お知らせ管理)・§7(line_messages)/ CLAUDE.md 絶対原則3(通数)・4(最小保持)・開発ルール(破壊的操作は確認+実行ログ、Webhook は署名検証)/ docs/DESIGN_GUIDELINES.md §2.3(通数メーター)

## 目的

発行した予定表とお知らせを「グループ宛て 1 push」で LINE に送り、管理画面に通数カウンター(n/200)を常設する。
Webhook で groupId を受け取って teams に保存し、実チャネル(#9)が揃えば stg でそのまま使える状態にする。
ローカル/E2E は `LINE_FAKE=1` のフェイク送信で導線を貫通させる。

## 方針

```
[コーチ(admin)] 日程管理: 発行済みの月に「LINE へ送信」→ 二段階確認(グループ n 人 × 1 通、残り m 通)→ POST /line/send/schedule { month }
               お知らせ管理: 通知ありで公開済みのお知らせに「LINE へ送信」→ 同確認 → POST /line/send/announcement { id }
               ダッシュボード・日程管理: 通数メーター(GET /line/usage)+ 送信ログ(GET /line/messages)
[packages/api]  line-send.ts: 参加人数取得 → canSend → pushToGroup → line_messages に sent/failed を記録(1 送信 = 1 行)
[packages/line] messaging-http.ts: POST /v2/bot/message/push(to=groupId)、GET /v2/bot/group/{groupId}/members/count。
               webhook.ts: x-line-signature(HMAC-SHA256 base64、channel secret)の検証とイベントの取り出し
[portal]        POST /api/line/webhook: 署名検証 → join イベントの groupId を teams.line_group_id に保存(他は 200 で無視)
```

### DB(実装済み・マイグレーション 0007)

`line_messages(id, team_id, kind[schedule/announcement/reminder], ref, recipient_count, status[sent/failed], error, sent_at)`。
本文は保存しない。当月(Asia/Tokyo)の sent 行の recipient_count 合計が使用済み通数。`teams.line_group_id` は既存列。

### 共通(実装済み)

- `packages/api/src/line-shared.ts`(DB 非依存、`@hoopo/api/line-shared`): `LINE_MONTHLY_QUOTA`、`computeLineUsage(rows, now)`、
  `canSend(usage, recipientCount)`、`buildScheduleMessages` / `buildAnnouncementMessages`、`describeLineMessage`
- `packages/line/src/messaging.ts`: `LineMessagingClient { pushToGroup(groupId, messages); getGroupMemberCount(groupId) }`、
  `createFakeLineMessagingClient({ memberCount?, failNext? })`(参加人数は固定 12。Vercel では起動時エラー)

### API 契約(6c-1 と 6c-2 が並列で実装するため先に固定する)

**6c-1 管理 API**(`packages/api/src/admin-app.ts`。ロジックは `line-send.ts`。deps に `line: { client: LineMessagingClient }`, `portalUrl`, `liffUrl` を追加)
- `GET /line/usage` → `{ month, used, quota, remaining, groupLinked: boolean, memberCount: number | null }`
  memberCount は groupLinked のときだけ API から取得(失敗なら null)。確認ダイアログの「n 人 × 1 通」に使う
- `GET /line/messages?limit=10` → `{ messages: LineMessageLogEntry[] }`(新しい順)
- `POST /line/send/schedule` body `{ month }` → `201 { message: LineMessageLogEntry, usage }`。
  条件: 月に発行済み(published_at あり)の練習がある(なければ 400「先に発行してください」)、groupLinked(なければ 409「LINE グループが未連携です」)、
  canSend(だめなら 409 に理由)。本文は `buildScheduleMessages({ month, monthLabel, imageUrl: ${portalUrl}/api/schedule/${month}.png, liffUrl })`。
  push 失敗は line_messages に failed(error 付き)で記録し 502。成功は sent
- `POST /line/send/announcement` body `{ id }` → 同上。条件: 公開済み かつ notify_line=true(でなければ 400)
- 関数: `getLineUsage(teamId, client, now)`, `listLineMessages(teamId, limit)`, `sendScheduleToLine(teamId, month, deps)`, `sendAnnouncementToLine(teamId, id, deps)`
- 送信は `withTeam` で `line_messages` に insert(sent/failed)。同じ ref への再送は許可(再発行後の送り直し。確認文言で「n 回目」を出す)

**6c-2 Webhook・送信クライアント**(`packages/line`、`packages/api/src/line-group.ts`、portal `app.ts`)
- `packages/line/src/webhook.ts`: `verifyLineSignature(rawBody, signature, channelSecret)`(HMAC-SHA256 → base64、timing-safe 比較)、
  `parseWebhookEvents(rawBody)` → `{ type: "join" | "leave" | "other", groupId?: string }[]`(group 以外の source は other)
- `packages/line/src/messaging-http.ts`: `createLineMessagingClient({ channelAccessToken, fetchFn })`。
  push は `POST https://api.line.me/v2/bot/message/push` `{ to: groupId, messages }`(Authorization: Bearer)。
  人数は `GET https://api.line.me/v2/bot/group/{groupId}/members/count` → `{ count }`。非 2xx は `{ ok: false, reason }`(本文は含めない)
- portal `POST /line/webhook`(`packages/api/src/app.ts`、認証なし。`ApiDeps` に `lineChannelSecret: string | null` を追加):
  署名不一致は 401。`join` の groupId を `setLineGroupId(teamId, groupId)`(`line-group.ts`、withTeam で teams を更新。既に別の groupId があれば上書きしない=最初のグループを守る)。
  `leave` は `clearLineGroupId`。それ以外は無視。常に `{ ok: true }` を返す(LINE の再送を避ける)。
  channelSecret が未設定(ローカル)なら 503。イベント本文・userId は保存もログ出力もしない
- `.env.example`: `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` は既存。`LINE_FAKE=1` を追記済み

### 画面(apps/admin。モノトーン、DESIGN_GUIDELINES §2.3 メーターは aink 単色)

- 日程管理: 「LINE へ送信」を有効化(発行済みのときだけ押せる)。二段階確認「グループ n 人に送信します(n 通消費・残り m 通)」→ 送信 →
  「送信しました M/D HH:mm」。通数メーターを `/line/usage` で実値に。下に送信ログ(最新 5 件: 種別・日時・通数・結果)
- お知らせ管理: 公開済み かつ 通知ありの行に「LINE へ送信」+ 送信済みなら「送信済み M/D」。確認は同形式
- ダッシュボード: 通数メーターを実値に(プレースホルダ撤去)
- 未連携(groupLinked=false)のときはボタンを disabled にし「LINE グループが未連携です(Bot をグループに招待してください)」を表示

### 設計判断

1. **送信 API は 2 本だけ、宛先は teams.line_group_id 固定**: userId 宛て push / multicast / broadcast は `LineMessagingClient` にも API にも存在させない(絶対原則3)
2. **通数は送信ログから導出**: カウンター用の別テーブルや teams の列は持たない。参加人数は送信時に API から取り、ログに固定する
   (後から人数が変わっても過去の通数は変えない)。LINE 側の実消費と厳密には一致し得ないので「目安」と表示する
3. **枠は事前チェックで止める**: `canSend` が false なら push しない(超過月は LINE が送信不可になるため無駄打ちを避ける)
4. **Webhook は groupId の取得専用**: メッセージ本文・送信者を保存しない(絶対原則4)。返信・応答メッセージは実装しない(通数)
5. **フェイクは `LINE_FAKE=1`**(AUTH_FAKE と独立。Vercel では拒否): 参加人数 12 固定で E2E の通数表示を決定的にする
6. **リマインド(§6 必須通知2)は kind='reminder' を予約するだけ**: 定期ジョブは #20 で、この送信関数(`sendToGroup`)を再利用する
7. **実行体制**: プラン・DB・共通モジュールはメイン、6c-1 / 6c-2 を Opus サブエージェントに並列委譲。DB を使う検証と PR はメイン

## スコープ外

- 出欠リマインドの定期ジョブ(#20)
- 実チャネルでの疎通(#9 の Messaging API チャネル・Bot のグループ招待後に stg で確認)
- LINE 公式アカウントの応答メッセージ設定(LINE Official Account Manager 側で「応答しない」にする運用)

## 完了条件

- フェイクで: 発行 → 「LINE へ送信」→ 確認 → 送信ログに sent(12 通)→ メーターが 12/200 になる。お知らせも同様
- 未連携・枠超過・未発行では送れず、理由が画面に出る
- Webhook: 署名 OK の join で teams.line_group_id が入る。署名 NG は 401
- Unit(通数計算・本文・署名検証・HTTP クライアント)/ Integration(送信 API・Webhook・RLS)/ E2E(送信導線 1 本)がグリーン
