"use client";

import { useEffect, useState } from "react";
import {
  FONT_SIZES,
  type FontSize,
  FS_COOKIE_NAME,
  THEME_COOKIE_NAME,
  type Theme,
} from "./display-prefs";

// ヘッダー常設の表示設定(DESIGN_GUIDELINES §2.1・§2.2)。
// 選択は Cookie に保存して次回 SSR に反映し、html 属性を即時更新して再読込なしで切り替える

const FS_LABELS: Record<FontSize, string> = { s: "小", m: "中", l: "大" };

function saveCookie(name: string, value: string) {
  // Max-Age 1年。httpOnly にしない(クライアントで書き換える表示設定のため)。
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API は Safari 未対応のため document.cookie を使う
  document.cookie = `${name}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

// アイコンはワイヤーフレームの #i-moon / #i-sun と同一パス
function MoonIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 13.6A8.2 8.2 0 1110.3 4a6.6 6.6 0 009.7 9.6z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.7 5.7l1.6 1.6M16.7 16.7l1.6 1.6M18.3 5.7l-1.6 1.6M7.3 16.7l-1.6 1.6" />
    </svg>
  );
}

export function DisplaySettings({
  initialTheme,
  initialFs,
}: {
  /** Cookie 未設定(OS 追随)のときは null */
  initialTheme: Theme | null;
  initialFs: FontSize;
}) {
  const [theme, setTheme] = useState<Theme | null>(initialTheme);
  const [fs, setFs] = useState<FontSize>(initialFs);

  // OS 追随中はサーバーが実際の見た目を知らないため、
  // マウント後に OS 設定を読んでトグルの表示状態だけ同期する(html 属性は触らない)
  useEffect(() => {
    if (initialTheme === null) {
      setTheme(
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      );
    }
  }, [initialTheme]);

  const dark = theme === "dark";

  function toggleTheme() {
    const next: Theme = dark ? "light" : "dark";
    setTheme(next);
    saveCookie(THEME_COOKIE_NAME, next);
    document.documentElement.dataset.theme = next;
  }

  function changeFs(next: FontSize) {
    setFs(next);
    saveCookie(FS_COOKIE_NAME, next);
    document.documentElement.dataset.fs = next;
  }

  return (
    <div className="set">
      <button
        type="button"
        className="tgl"
        aria-pressed={dark}
        onClick={toggleTheme}
      >
        {dark ? <SunIcon /> : <MoonIcon />}
        ダークモード
        <span className="sw2">
          <i />
        </span>
      </button>
      <fieldset className="fseg" aria-label="文字サイズ">
        {FONT_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={size === fs ? "on" : undefined}
            aria-pressed={size === fs}
            onClick={() => changeFs(size)}
          >
            {FS_LABELS[size]}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
