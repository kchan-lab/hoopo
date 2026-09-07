import { Hono } from "hono";
import {
  type AttendanceReminderJobResult,
  type LineSendDeps,
  runAttendanceReminderJob,
} from "./line-send";

// 定期ジョブの入口(#20。attendance-reminder/plan.md「API 契約」)。
// GitHub Actions schedule から HTTP で叩く(設計判断2: DB 直ではなくアプリのロジックを通し、
// 通数チェックと送信ログを必ず経由させる)。admin 側で /api/jobs にマウントする。
// 管理者セッションではなく Authorization: Bearer <CRON_SECRET> で認証するため、
// createAdminApi とはアプリを分けて Cookie 認証の経路と混ぜない

export interface JobsApiDeps {
  /** 当面は env の単一チーム(admin-app.ts と同じ前提) */
  teamId: string;
  /** 未設定なら 503。ローカル/プレビューで誤って動かさないための既定値なしの明示 */
  cronSecret: string | null;
  line: LineSendDeps;
}

/**
 * 秘密の比較は長さも内容も漏らさない。SHA-256 に通してから固定長で XOR するので、
 * 早期 return による分岐時間の差が出ない(node:crypto は使わず Web Crypto のみ)
 */
async function secretMatches(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    diff |= (x[i] as number) ^ (y[i] as number);
  }
  return diff === 0;
}

/** "Bearer <token>" から token を取り出す(前置きが違えば空文字) */
function bearerToken(header: string | undefined): string {
  if (!header) return "";
  const prefix = "Bearer ";
  return header.startsWith(prefix) ? header.slice(prefix.length) : "";
}

export function createJobsApi(deps: JobsApiDeps) {
  const app = new Hono();

  // 出欠リマインド(毎日 19:00 JST)。対象・スキップの判定は line-send.ts の
  // runAttendanceReminderJob。ここは認証と応答の組み立てだけを持つ
  app.post("/attendance-reminder", async (c) => {
    if (deps.cronSecret === null) {
      return c.json(
        { error: "CRON_SECRET が未設定のため定期ジョブは無効です" },
        503,
      );
    }
    const token = bearerToken(c.req.header("Authorization"));
    if (!(await secretMatches(token, deps.cronSecret))) {
      return c.json({ error: "認証に失敗しました" }, 401);
    }
    const result: AttendanceReminderJobResult = await runAttendanceReminderJob(
      deps.teamId,
      deps.line,
    );
    return c.json(result);
  });

  return app;
}
