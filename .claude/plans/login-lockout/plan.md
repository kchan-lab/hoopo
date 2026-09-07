# Plan: 管理者ログインの試行回数制限(#65)

Issue: [#65](https://github.com/kchan-lab/hoopo/issues/65)
設計の正: docs/REQUIREMENTS.md §3(管理者の認証)・§7(coaches)/ admin-login/plan.md 設計判断9(資格情報エラーの非区別)・10(暫定実装)/ CLAUDE.md 絶対原則1(Redis 等を増やさない)

## 目的

メール+パスワードの総当たりを DB の列だけで抑止する。5 回連続で失敗したら 15 分ロック。ロック中も応答は通常の失敗と同じ(email の存在やロック状態を推測させない)。成功でリセット。

## 方針(DB は実装済み・マイグレーション 0008)

`coaches.failed_login_count integer not null default 0` / `coaches.locked_until timestamptz null`。

`POST /auth/login`(admin-app.ts)の流れ:
1. email で coach を引く(withTeam)。無ければ従来どおりダミーハッシュ照合 → 401
2. `locked_until > now` ならロック中: **それでもハッシュ照合は 1 回行い**(応答時間を揃える)、結果によらず 401(同じ文言)。カウンタは増やさない(ロック延長で締め出しを長引かせない)
3. 照合失敗: `failed_login_count + 1`。5 以上になったら `locked_until = now + 15 分`、`failed_login_count = 0`(ロック明けは 5 回からやり直し)→ 401
4. 照合成功: `failed_login_count = 0, locked_until = null` → セッション発行
更新は `withTeam` 内の UPDATE 1 文(`RETURNING` で新しい値を得る)。同時リクエストの厳密な直列化はしない(数回ずれても抑止目的は満たす)

定数は `packages/api/src/login-lockout-shared.ts`(DB 非依存): `MAX_FAILED_LOGINS = 5`, `LOCKOUT_MS = 15 * 60 * 1000`, `nextLockoutState(current, ok, now)` → `{ failedLoginCount, lockedUntil }`(Unit テスト)。
ロック中の判定 `isLocked(lockedUntil, now)`。

## 設計判断

1. **ロック中は失敗回数を増やさない**: 攻撃者がロックを永続化できないように。正規ユーザーは 15 分待てば 5 回試せる
2. **応答は常に同じ 401**: admin-login 設計判断9 を維持。ロックの案内は出さない(UI 文言も変えない)
3. **LINE ログインは対象外**: パスワードを持たない経路には総当たりが無い。LINE で入れるコーチはロック中でも LINE で入れる(予備経路が生きる)
4. **実行体制**: プラン・DB はメイン、実装は Opus サブエージェント。DB を使う検証と PR はメイン

## スコープ外

- IP 単位の制限(Vercel の前段で足りるまで見送り)、パスワードリセット(§10 未決)

## 完了条件

- 5 回失敗 → 6 回目は正しいパスワードでも 401 → 15 分後は入れる。成功でカウンタが 0 に戻る
- 失敗応答の status / 文言がロックの有無で変わらない
- Unit(状態遷移)/ Integration(5 回失敗→ロック→時間経過で解除→成功でリセット、LINE ログインは影響なし)がグリーン
