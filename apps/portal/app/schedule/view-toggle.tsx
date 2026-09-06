"use client";

import { useRouter } from "next/navigation";

// リスト ⇄ カレンダーのトグル(DESIGN §1.3「選択状態は保存」)。
// 選択は Cookie(SSR が初期表示に使う)へ保存し、即時に再描画する。localStorage は使わない。
// 日程(#13)と提出(#14)で Cookie を分け、それぞれ独立に記憶する

export const VIEW_COOKIE_NAME = "portal_schedule_view";
export const ATTENDANCE_VIEW_COOKIE_NAME = "portal_attendance_view";
export type ScheduleView = "list" | "calendar";

export function ViewToggle({
  view,
  month,
  basePath = "/schedule",
  cookieName = VIEW_COOKIE_NAME,
  onSelect,
}: {
  view: ScheduleView;
  month: string;
  basePath?: string;
  cookieName?: string;
  /** 指定すると遷移せず、呼び出し側のローカル状態で切り替える(未保存の入力を保つ) */
  onSelect?: (next: ScheduleView) => void;
}) {
  const router = useRouter();
  function select(next: ScheduleView) {
    if (next === view) return;
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API は Safari 未対応
    document.cookie = `${cookieName}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    if (onSelect) {
      onSelect(next);
      return;
    }
    router.replace(`${basePath}?month=${month}&view=${next}`);
  }
  return (
    <div className="seg" role="tablist" aria-label="表示形式">
      <button
        type="button"
        role="tab"
        aria-selected={view === "list"}
        onClick={() => select("list")}
      >
        リスト
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "calendar"}
        onClick={() => select("calendar")}
      >
        カレンダー
      </button>
    </div>
  );
}
