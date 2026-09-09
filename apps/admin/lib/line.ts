import { trimTrailingSlash } from "@hoopo/api/line-shared";
import {
  createFakeLineMessagingClient,
  createLineMessagingClient,
  createUnconfiguredLineMessagingClient,
  type LineMessagingClient,
} from "@hoopo/line";

// LINE 送信の依存を env から組み立てる(line-send/plan.md 6c-1)。
// API ルート(app/api/[[...route]]/route.ts)と、通数メーターを描くサーバーコンポーネント
// (ダッシュボード・日程管理)の両方が同じ組み立てを使うのでここに集約する

/**
 * 送信クライアント。LINE_FAKE=1 はローカル/E2E 専用で、実チャネル(#9)無しでも
 * 送信導線と通数カウンターを貫通させる(フェイク側が Vercel 環境では起動時に拒否する)
 */
export function lineClient(): LineMessagingClient {
  if (process.env.LINE_FAKE === "1") return createFakeLineMessagingClient();
  // Messaging API チャネル(#9)が未設定でも管理画面は動かす。送信ボタンは「参加人数を取得できない」で止まる
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return createUnconfiguredLineMessagingClient();
  return createLineMessagingClient({ channelAccessToken: token });
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
