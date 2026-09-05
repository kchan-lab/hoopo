"use client";

import { useRouter } from "next/navigation";

// リスト ⇄ カレンダーのトグル(DESIGN §1.3「選択状態は保存」)。
// 選択は Cookie(SSR が初期表示に使う)へ保存し、即時に再描画する。localStorage は使わない

export const VIEW_COOKIE_NAME = "portal_schedule_view";
export type ScheduleView = "list" | "calendar";

export function ViewToggle({
  view,
  month,
}: {
  view: ScheduleView;
  month: string;
}) {
  const router = useRouter();
  function select(next: ScheduleView) {
    if (next === view) return;
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API は Safari 未対応
    document.cookie = `${VIEW_COOKIE_NAME}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    router.replace(`/schedule?month=${month}&view=${next}`);
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
