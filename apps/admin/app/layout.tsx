import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import {
  FONT_SIZES,
  FS_COOKIE_NAME,
  pickKnown,
  THEME_COOKIE_NAME,
  THEMES,
} from "./display-prefs";
import { DisplaySettings } from "./display-settings";
import "./globals.css";

export const metadata: Metadata = {
  title: "hoopo 管理",
};

// テーマ/文字サイズは Cookie で保持し、SSR 時に html 属性へ反映してちらつきを防ぐ。
// テーマ Cookie 未設定時は data-theme を出力せず、CSS の prefers-color-scheme で
// OS 設定に追随させる(DESIGN_GUIDELINES §2.1「初期値はOS設定、選択は保存」)

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = await cookies();
  const theme = pickKnown(store.get(THEME_COOKIE_NAME)?.value, THEMES);
  const fs = pickKnown(store.get(FS_COOKIE_NAME)?.value, FONT_SIZES) ?? "m";

  return (
    <html lang="ja" data-theme={theme} data-fs={fs}>
      <body>
        <header className="ahead">
          <span className="lg">hoopo 管理</span>
          <DisplaySettings initialTheme={theme ?? null} initialFs={fs} />
        </header>
        {children}
      </body>
    </html>
  );
}
