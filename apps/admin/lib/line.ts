import { trimTrailingSlash } from "@hoopo/api/line-shared";
import {
  createFakeLineMessagingClient,
  createLineMessagingClient,
  type LineMessagingClient,
} from "@hoopo/line";

// LINE 送信の依存を env から組み立てる(line-send/plan.md 6c-1)。
// API ルート(app/api/[[...route]]/route.ts)と、通数メーターを描くサーバーコンポーネント
// (ダッシュボード・日程管理)の両方が同じ組み立てを使うのでここに集約する

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません(.env を確認)`);
  }
  return value;
}

/**
 * 送信クライアント。LINE_FAKE=1 はローカル/E2E 専用で、実チャネル(#9)無しでも
 * 送信導線と通数カウンターを貫通させる(フェイク側が Vercel 環境では起動時に拒否する)
 */
export function lineClient(): LineMessagingClient {
  if (process.env.LINE_FAKE === "1") return createFakeLineMessagingClient();
  return createLineMessagingClient({
    channelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
  });
}

/** 予定表画像を載せる保護者アプリの URL(末尾スラッシュは落とす) */
export function portalUrl(): string {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_PORTAL_URL ?? "");
}

/** LINE のメッセージから開く入口。LIFF 未取得(#9)のうちは保護者アプリの URL で代用する */
export function liffUrl(): string {
  const liffId = process.env.LIFF_ID;
  return liffId ? `https://liff.line.me/${liffId}` : portalUrl();
}
