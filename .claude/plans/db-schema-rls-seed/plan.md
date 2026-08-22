# Plan: Supabase プロジェクト作成+Drizzle スキーマ・RLS・シード

Issue: [#6](https://github.com/kchan-lab/hoopo/issues/6)
設計の正: docs/REQUIREMENTS.md §7(データモデル・ER図) / CLAUDE.md 絶対原則5 /
docs/DEVELOPMENT.md「テスト戦略」(Integration ジョブは Issue #6 で追加する取り決め)
レビュー: 2026-08-19 に5観点(スキーマ/RLS/コスト/テスト/スコープ)の並列レビューを実施し、
その指摘を本プランに反映済み

## 目的

確定 ER 図どおりの全12テーブルを Drizzle で定義し、RLS(team_id 境界)とシードデータまで整える。
あわせて stg 用・本番用の Supabase Free プロジェクトを作成し(適用は stg のみ)、
DEVELOPMENT.md の取り決めどおり Integration テスト(RLS 越境テスト必須)と CI ジョブを新設する。

## 方針

```
packages/db/
├─ drizzle.config.ts        … Drizzle Kit 設定(entities.roles provider=supabase 必須)
├─ drizzle/                 … 生成マイグレーション SQL(カスタムマイグレーション含む、コミット対象)
└─ src/
   ├─ schema/               … テーブル定義(enum・FK・index・pgPolicy を含む)
   ├─ client.ts             … withTeam ヘルパのみ公開(生の db は export しない)
   ├─ invite-code.ts        … 招待コード生成(Unit テスト対象)
   ├─ seed.ts               … 開発用シード(2チーム分、ローカル専用)
   └─ index.ts              … re-export
packages/db/test/*.int.test.ts … Integration テスト(命名で Unit と分離)
.github/workflows/ci.yml    … test-int ジョブを追加(postgres サービスコンテナ)
docs/REQUIREMENTS.md §7     … 実装前に更新(ドキュメント先行)
```

**PR は2本の Stacked PR に分割する**(1 Issue = 1 関心事は維持。異種成果物の同居で
AI レビュー精度が落ちるため。PR-B は PR-A のスキーマに全面依存するので、A のマージを待たずに
積み上げられる Stacked 構成が適する):

- **PR-A** `feat: Drizzleスキーマとマイグレーション・開発用シード`(Refs #6、base: development)
  — REQUIREMENTS §7 更新 / Drizzle 導入 / 12テーブル / マイグレーション / シード
- **PR-B** `feat: RLSポリシーとIntegrationテスト基盤`(Closes #6、**base: PR-A ブランチ**)
  — アプリロール / pgPolicy / withTeam / 越境テスト / CI ジョブ / ルールセット
- **Stacked 運用の注意**: development は squash マージのため、PR-A マージ後に PR-A の
  コミットは履歴から消える。PR-B は base が development に自動付け替えされた後、
  **最新 development へ `git rebase --onto development <旧PR-Aブランチ先端>` してから**
  CI を回してマージする(重複 diff・コンフリクトの防止)

**接続経路**(全環境で固定。理由は設計判断2b):

| 環境 | 経路 |
|---|---|
| ローカル / CI | 直結(54322 / postgres コンテナ) |
| stg / prod(アプリ・マイグレーション) | **Supavisor transaction mode(6543)+ `prepare: false`**。直結(5432)は IPv6 専用で Vercel から不可、IPv4 add-on は有料のため**使用禁止** |

### 設計判断

1. **RLS ポリシーも Drizzle スキーマ内(`pgPolicy`)で定義する**: 手動 SQL・`supabase db push` 禁止
   (CLAUDE.md)のもとでスキーマとポリシーを1系統に揃えるため。supabase/migrations での SQL 管理は
   二重管理になるため退けた。**宣言で表現できない DDL(ロール作成・GRANT・FORCE RLS・生成列等)は
   `drizzle-kit generate --custom` のカスタムマイグレーションで補い、Drizzle の管理下でコミットする**。
   `drizzle.config.ts` に `entities: { roles: { provider: 'supabase' } }` を指定する
   (指定しないと drizzle-kit が anon/authenticated 等を DROP する SQL を吐く)
2. **RLS の実効化方式**(このプランの核。レビューで成立条件を確定):
   - **(a) コンテキスト設定**: `set_config('app.team_id', $1, true)`(**第3引数 is_local=true 必須**)を
     **必ずトランザクション内**で実行。`is_local=false`/トランザクション外の SET は接続プール再利用で
     他チームへ漏れるため禁止。RLS 配下のクエリは読み取り含めすべて `db.transaction()` 内で実行する。
     `client.ts` は生の `db` を export せず **`withTeam(teamId, fn)` のみを公開**し、コンテキストなしに
     クエリできないことを型で担保。teamId は uuid 形式を検証してからバインドパラメータで渡す
     (`sql.raw` 禁止)。`withTeam` 内では DB 以外の I/O をしない(プーラ接続の長時間占有防止)
   - **(b) 接続経路**: stg/prod は Supavisor transaction mode(6543)固定・`prepare: false`。
     Integration テストで**プーラ経由の GUC 残留がないこと**を最低1ケース検証する
     (`supabase/config.toml` の `[db.pooler]` を有効化)
   - **(c) ポリシー式**: `team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)`。
     missing_ok + nullif で「未設定 = NULL = 0行/書き込み拒否」の fail-closed に統一。
     `(select ...)` で包むのは initPlan 化で index scan を効かせるため。
     ポリシーは1テーブル1本の FOR ALL とし、**USING と WITH CHECK を両方明示**する
     (暗黙の流用に依存しない。team_id 書き換え UPDATE を塞ぐのは WITH CHECK 側)
   - **(d) ロール設計**: 権限保持ロール `hoopo_app`(NOLOGIN/NOSUPERUSER/**NOBYPASSRLS**/NOCREATEROLE)を
     カスタムマイグレーションで作成し、**テーブル単位で GRANT**(`ALTER DEFAULT PRIVILEGES` は
     ポリシー未設定の新テーブルが自動で開くため使わない)。`anon`/`authenticated` からは REVOKE。
     全テーブル **`FORCE ROW LEVEL SECURITY`**(所有者バイパスの封止)。search_path は
     `public, extensions, pg_temp` に固定(pg_temp 末尾明示で一時テーブルによる隠蔽を封止)。
     環境別ログインロール(`hoopo_app_local`/`_stg`/`_prod`)はパスワードを含むため手動作成し
     `GRANT hoopo_app TO ...` で継承(ロール+GRANT=マイグレーション、パスワード設定のみ手動、が線引き)。
     ロール別の設定値は GRANT では継承されないため、search_path は各ログインロール自身にも同じ値を設定する
   - **(e) env 分離**: `DATABASE_URL`(マイグレーション/シード用=所有者)と
     `APP_DATABASE_URL`(アプリ・Integration テスト用=hoopo_app 系)の2本。
     `client.ts` は `APP_DATABASE_URL` のみを読む
   - **(f) 位置づけの注記**: この RLS は「where 漏れ・join ミス」への多層防御であり、アプリ侵害への
     防御ではない。teamId は必ずサーバー側セッションから導出し、リクエスト由来の値を渡さない。
     また RLS はテナント境界(team)専用で、**同一チーム内の家庭間の可視範囲は API 層の責務**
     (guardian 単位の GUC `app.guardian_id` は縦切り1で追加予定として名前だけ予約)
3. **列挙値は「変わりにくいもののみ」Postgres enum**: attendance(full/partial/absent)、
   guardian_children・children の status(active/revoked)、fee(paid/unpaid)、lineup role(starter/bench)は
   UI 仕様で確定済みのため enum(TS への型伝播を優先)。**position と relation は text + CHECK**
   (§4.2-7 の配置仕様は動く前提、relation は §7 に値定義がない。Postgres enum は値の削除・改名が
   実質不可のため、変わり得るものには使わない)。fee の「未来」状態はアプリで year/month から導出
   (レコード生成は定期ジョブの Issue)。enum の値変更が必要になった場合は型再作成マイグレーションを
   手当てする制約を認識しておく
4. **id は uuid(`gen_random_uuid()`、PG17 コア組み込み)**。**招待コードは別物**:
   `children.invite_code` は text NOT NULL **UNIQUE(グローバル一意)**、8〜10文字の
   Crockford Base32 相当(口頭伝達・手入力に耐える長さで推測困難)。生成関数は
   `invite-code.ts` に切り出し Unit テスト対象。DB default は置かない
5. **テナント整合は複合 FK で DB レベル担保**: FK 整合性チェックは RLS をバイパスするため、
   単純 FK では「team_id=A の行から B チームの practice_id を参照」が作れてしまう。
   親(guardians/children/practices)に `UNIQUE (id, team_id)` を張り、子は
   `FOREIGN KEY (xxx_id, team_id) REFERENCES 親 (id, team_id)` の複合 FK で参照する
6. **一意制約・CHECK を明示定義**(集計と重複防止の土台):
   - `attendances`: UNIQUE (practice_id, child_id) / comment は `CHECK (status = 'partial' OR comment IS NULL)`
   - `fee_records`: UNIQUE (child_id, year, month) / month は CHECK (1..12)、year/month は smallint
   - `guardian_children`: PRIMARY KEY (guardian_id, child_id)
   - `lineups`: UNIQUE (practice_id, child_id)
   - `child_availabilities`: UNIQUE (child_id, weekday, start_time)
   - `coaches.email` UNIQUE / `teams.line_group_id` UNIQUE / `children.invite_code` UNIQUE
   - `children.grade`: smallint CHECK (1..6)。卒団は `archived=true` + `archived_at`(grade 据え置き)
7. **日付・時刻の型**(Asia/Tokyo 固定、CLAUDE.md): `held_on` は `date`、`start_time`/`end_time` は
   `time`(timetz 不使用)。曜日は生成列 `GENERATED ALWAYS AS (EXTRACT(DOW FROM held_on)) STORED`
   (0=日、`child_availabilities.weekday` と同一規約)。`published_at`/`submitted_at`/`received_at` は
   `timestamptz`。全テーブルに `created_at`(+更新のある表は `updated_at`)— §5.2 認定管理の
   「登録履歴」表示に必要
8. **line_user_id は「暗号文 + 検索キー」の2列構成**: 暗号文 `line_user_id`(text)に加え、
   検索用 `line_user_id_lookup`(HMAC-SHA256 hex、`UNIQUE (team_id, line_user_id_lookup)`)を持つ。
   確率的暗号のみだと LIFF ログインで guardian を引けず導線が成立しないため、**列と制約はこの Issue、
   暗号化・HMAC 実装は packages/line(縦切り1)**の分担。平文混入事故は
   `CHECK (line_user_id !~ '^U[0-9a-f]{32}$')`(LINE userId の既知形式を拒否)で DB 側でも防ぐ
9. **team 未確定導線の escape hatch は SECURITY DEFINER 関数2本に限定**: 初回登録(招待コード)と
   LIFF ログイン(line_user_id→guardian)は team コンテキスト確定前に DB を引く鶏と卵になる。
   `resolve_invite_code(code)` / `resolve_guardian_by_lookup(lookup)`(返す列は ID と team_id のみ、
   `SET search_path = public, pg_temp`、EXECUTE は hoopo_app のみ)をカスタムマイグレーションで定義。
   これ以外の目的で service_role/postgres をアプリから使うことは禁止
10. **CI の DB は素の `postgres:17` サービスコンテナ**(supabase start は使わない):
    RLS が Supabase 固有ロール・拡張に依存しない設計(判断2)のため Postgres だけで検証でき、
    毎 PR 数分のイメージ pull と supabase CLI 更新起因の破壊を回避できる。ローカルは従来どおり
    `supabase start`(Studio 目視の利点)。ジョブ名は **`test-int`**、`timeout-minutes: 15`。
    マイグレーション生成漏れ検知(`db:generate` 後に `git diff --exit-code drizzle/` + `drizzle-kit check`)も
    同ジョブに含める。「Supabase 固有物に非依存」はメタテスト(判断11)で機械強制する
11. **Integration テストの設計**:
    - 命名 `*.int.test.ts` で Unit と分離(現行 `vitest.config.ts` の include が
      `packages/db/test/*.test.ts` を拾って test ジョブが赤になるのを防ぐ)。専用 config +
      `fileParallelism: false`。接続文字列未設定時は fail-fast(空 DB 相手の全緑を防ぐ)
    - リセットは**beforeEach の TRUNCATE + フィクスチャ再作成**(当初はテストごとの
      トランザクション+ロールバックを想定したが、withTeam が自前でトランザクションを張るため
      不成立と判明し変更。直列実行(`fileParallelism: false`)+シャッフル耐性で同等の独立性を
      担保)。テストクライアントは `max: 1`
    - テストフィクスチャは開発用シードと分離(シードは UI 確認用に増減するため依存させない)
    - **必須ケース**: ①越境 SELECT/INSERT/UPDATE/DELETE ②team_id 書き換え UPDATE(WITH CHECK)
      ③GUC 未設定で全テーブル 0 行/拒否 ④不正値(非 uuid)で拒否側に倒れる
      ⑤プーラ経由で GUC 残留なし ⑥平文 line_user_id の INSERT 拒否
      ⑦**メタテスト**: pg_catalog 走査で「public 全テーブルが RLS 有効+FORCE+ポリシー1本以上+
      team_id 列あり(teams 除く)」「アプリロールが非 BYPASSRLS/非 superuser/非所有者」
      「anon/authenticated が権限を持たない」「SECURITY DEFINER 関数が判断9の2本のみ」を検証
      — 将来のテーブル追加時に絶対原則5を CI で恒久強制する
12. **Unit テストの対象**: 招待コード生成(文字種・長さ・重複耐性)、withTeam の入力検証
    (uuid 検証・sql.raw 不使用)。テーブル定義・ポリシー自体は DB なしで意味がないため
    Unit 対象外とし Integration で担保する(判断として明記)
13. **Integration 層の初期形は DB/RLS 直結**: DEVELOPMENT.md の定義は「Hono の `app.request()`」だが、
    packages/api が空の現段階では書けない。API 経由の Integration は縦切り1以降で追加
14. **シードはローカル開発専用(2チーム分)**: 2チーム目は RLS 越境検証を兼ねる。
    **seed.ts は withTeam(RLS 配下)で実行**し、投入できること自体が WITH CHECK の検証になる。
    `supabase/config.toml` の `[db.seed]`(seed.sql)は無効化して系統を一本化。
    seed/migrate スクリプトは**接続先がローカル以外なら abort するガード**を入れ、
    クラウド向けは `db:migrate:stg` 等の環境明示スクリプトに分離(prod 誤爆＝復旧不能の防止)
15. **stg のみ適用、prod は作成だけして空のまま**: prod は実運用開始まで Free の自動一時停止で
    眠り続けるため、適用は初回リリース PR(development→main)のタイミングで行う
    (「本番へのマイグレーション適用はリリースフロー」の原則にも合致)。stg への適用も
    **PR-B マージ後**に行う(main に無いスキーマを先に環境へ入れない)。
    適用済みの正は `__drizzle_migrations` テーブルとする
16. **Free 枠の制約を前提として記録**: Free は組織あたりアクティブ2プロジェクトが上限で、
    stg/prod で使い切る。**以後 CI・プレビュー用のクラウド DB という選択肢はない**(CI は常に
    ローカル Postgres、判断10の根拠)。自動一時停止(約1週間無アクセス)対策の ping は
    フェーズ3予定だが、コスト0・数行なので前倒しの小 Issue を起票する(申し送り参照)

## この Issue でやらないこと(意図的な非対象)

- アプリ(portal/admin)からの DB 接続・画面実装(縦切り1以降)。縦切り1に残るのは
  **Hono ミドルウェア化(セッション→withTeam)と暗号鍵・HMAC 鍵の管理のみ**になるよう、
  withTeam・lookup 列・SECURITY DEFINER 関数までは本 Issue で作り切る
- line_user_id の暗号化・HMAC 実装(packages/line、縦切り1)。列・制約は本 Issue(判断8)
- coaches の認証詳細: 今回は `email` + `auth_type`(line/email、text+CHECK)のみ。
  `password_hash`・リセットトークンは §10 未決(リセット手段の選定)のため縦切り1b(#24)で追加
- guardian 単位の行制限(`app.guardian_id`): 縦切り1で追加。GUC 名と対象テーブルのみ予約(判断2f)
- LINE 通数カウンター・破壊的操作の実行ログ用テーブル: §7 未定義のため対象外。
  縦切り6c 等で REQUIREMENTS.md §7 を更新してから追加する
- lineups の左右(C=リング横の左右指定): §7 に列がなく未確定。§10 に申し送り
- stg/prod へのマイグレーション自動適用(リリースフロー組み込み): フォローアップ Issue を起票する
- バックアップジョブ(フェーズ3)。ただし「prod に実データが入る前に日次 pg_dump を稼働させる」を
  リスクメモとして残す

## 申し送り(この Issue で起票・記録だけするもの)

- フォローアップ Issue: ①リリース PR マージ時の prod マイグレーション適用の運用
  ②Supabase 停止対策 ping の前倒し(cron で週1 `select 1`、コスト0)
- Renovate: `supabase` CLI を devDependencies グループから分離しバージョン固定(CI 破壊の切り分け用)
  — PR-A に同乗
- Vercel 接続 Issue(#7)への申し送り: Function Region を `hnd1`(東京)に設定
  (Supabase 東京と揃えないと往復 150-200ms×クエリ数が乗る。Hobby でも設定可・無料)

## 完了条件

- `hoopo-stg` / `hoopo-prod` の Supabase Free プロジェクトが作成されている(東京リージョン。
  適用は stg のみ、prod は空)
- docs/REQUIREMENTS.md §7 が実装と一致している(guardian_children の team_id、coaches の確定列、
  共通 created_at/updated_at、teams の扱いを明記)
- 全テーブル(teams 除く)に team_id があり、`drizzle-kit migrate` でローカル・stg に
  同一マイグレーションが適用できる(手動 SQL・db push なし)
- 全テーブルで RLS 有効 + FORCE RLS、USING/WITH CHECK 両方のポリシーが設定されている
- Integration テスト(判断11の必須ケース①〜⑦)がグリーンで、テスト順序シャッフルでもグリーン
- `pnpm db:seed` でローカルに2チーム分のシードが RLS 配下で投入できる
- CI に `test-int` ジョブ(postgres サービスコンテナ+生成漏れ検知)が加わり、
  development / main 両ルールセットの必須チェックに `test-int` が入っている
- Unit テスト(招待コード生成・withTeam 入力検証)がグリーン
