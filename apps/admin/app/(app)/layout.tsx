import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCoachSession } from "../../lib/session";

// 認証済み画面のルートグループ。未ログイン(または保護者セッション)は /login へ。
// 画面骨格(Shell)は各ページがタイトル付きで描画する
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await getCoachSession())) redirect("/login");
  return children;
}
