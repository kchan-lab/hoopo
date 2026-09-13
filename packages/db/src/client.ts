import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// RLS を実効化するための接続ヘルパ(plan.md 設計判断2)。
// - 生の db は export しない。withTeam(teamId, fn) だけを公開し、
//   team コンテキストなしにクエリできないことを型で担保する
// - set_config は必ず第3引数 true(トランザクションローカル)+トランザクション内で実行する。
//   セッションスコープの SET はプール接続の再利用時に他チームへ漏れるため禁止
// - teamId は uuid 形式を検証したうえでバインドパラメータで渡す(sql.raw 禁止)
// - この RLS は where 漏れ・join ミスへの多層防御であり、アプリ侵害への防御ではない。
//   teamId は必ずサーバー側セッションから導出し、リクエスト由来の値を渡さないこと

type AppDb = PostgresJsDatabase<typeof schema>;
export type TeamTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let appDb: AppDb | undefined;
let appConn: ReturnType<typeof postgres> | undefined;

function getAppDb(): AppDb {
  if (!appDb) {
    const url = process.env.APP_DATABASE_URL;
    if (!url) {
      // 未設定のままデフォルト接続先へ繋がる事故を防ぐため fail-fast
      throw new Error(
        "環境変数 APP_DATABASE_URL が設定されていません(.env を確認)",
      );
    }
    // Supavisor transaction mode(6543)は prepared statement 不可のため常に無効(設計判断2b)
    appConn = postgres(url, { prepare: false });
    appDb = drizzle(appConn, { schema });
  }
  return appDb;
}

export function isValidTeamId(teamId: string): boolean {
  return UUID_PATTERN.test(teamId);
}

// withTeam の内側では DB 以外の I/O(LINE API 等)を行わないこと。
// transaction mode のプーラ接続を掴んだまま待つと Free プランの接続枠を圧迫する
export async function withTeam<T>(
  teamId: string,
  fn: (tx: TeamTx) => Promise<T>,
): Promise<T> {
  if (!isValidTeamId(teamId)) {
    throw new Error("teamId が uuid 形式ではありません");
  }
  return getAppDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.team_id', ${teamId}, true)`);
    return fn(tx);
  });
}

// テスト終了時などに接続を明示的に閉じる(アプリからは通常呼ばない)
export async function closeAppDb(): Promise<void> {
  if (appConn) {
    await appConn.end();
    appConn = undefined;
    appDb = undefined;
  }
}

// ---- 招待コードの解決(child-registration/plan.md 設計判断7) ----
// resolve_invite_code は SECURITY DEFINER 関数(0001)で、team コンテキストなしに
// 「コード → child_id / team_id」だけを返す(他チームのコードでも解決できるが、
// 呼び出し側でセッションの teamId と突き合わせて拒否する)。
// 生 db を export しない方針のまま、この関数呼び出しだけを escape hatch として公開する
export async function resolveInviteCode(
  inviteCode: string,
): Promise<{ childId: string; teamId: string } | null> {
  const rows = await getAppDb().execute<{ child_id: string; team_id: string }>(
    sql`select child_id, team_id from resolve_invite_code(${inviteCode})`,
  );
  const row = rows[0];
  return row ? { childId: row.child_id, teamId: row.team_id } : null;
}
