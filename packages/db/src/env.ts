// DB スクリプト(migrate / seed)の接続先ガード。
// prod への誤適用・誤シードは Free プランではバックアップがなく復旧不能のため、
// 既定のスクリプトはローカル以外への接続を拒否する(plan.md 設計判断14)。

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "host.docker.internal"]);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // 未設定のままデフォルト接続先へ繋がる事故を防ぐため fail-fast にする
    throw new Error(`環境変数 ${name} が設定されていません(.env を確認)`);
  }
  return value;
}

// CLI はホスト側で実行するため、コンテナ用ホスト名は localhost に読み替える(.env.example 参照)
export function toHostUrl(databaseUrl: string): string {
  return databaseUrl.replace("host.docker.internal", "localhost");
}

export function assertLocalDatabaseUrl(databaseUrl: string): void {
  const host = new URL(databaseUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `接続先 ${host} はローカルではありません。クラウドへの適用は db:migrate:stg 等の環境明示スクリプトを使ってください`,
    );
  }
}

// db:migrate 系スクリプトのターゲット→接続先の解決。
// 誤爆防止ガード(local のローカル限定・prod の確認要求)の回帰を Unit テストで固定するため、
// process.env に依存しない純関数にしている
export function resolveMigrateTarget(
  target: string,
  env: Record<string, string | undefined>,
): { url: string; requiresConfirmation: boolean } {
  const readRequiredEnv = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(
        `環境変数 ${name} が設定されていません(接続先の .env 系ファイルを確認)`,
      );
    }
    return value;
  };
  if (target === "local") {
    const url = toHostUrl(readRequiredEnv("DATABASE_URL"));
    assertLocalDatabaseUrl(url);
    return { url, requiresConfirmation: false };
  }
  if (target === "stg") {
    return {
      url: readRequiredEnv("STG_DATABASE_URL"),
      requiresConfirmation: false,
    };
  }
  if (target === "prod") {
    // prod のみ実行前の確認を要求する(CLAUDE.md 開発ルール: 破壊的操作は確認+実行ログ)
    return {
      url: readRequiredEnv("PROD_DATABASE_URL"),
      requiresConfirmation: true,
    };
  }
  throw new Error(`不明なターゲット: ${target}(local | stg | prod)`);
}
