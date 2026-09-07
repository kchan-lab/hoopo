import { getCoachAccount } from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { LogoutButton } from "../logout-button";
import { Shell } from "../shell";
import { UnlinkLineButton } from "./unlink-line-button";

export const dynamic = "force-dynamic";

// アカウント(admin-line-login/plan.md)。ログイン手段の確認と LINE 連携の開始・解除だけを置く。
// 連携は「ログイン済みのコーチが自分で」行う(設計判断3)。表示するのは連携の有無だけで、
// LINE userId そのものは出さない(絶対原則4)

const ERRORS: Record<string, string> = {
  line_taken: "このLINEアカウントは別のコーチが連携済みです",
  line_denied: "LINE連携がキャンセルされました",
  line_state: "LINE連携に失敗しました。もう一度お試しください",
  line_failed: "LINE連携に失敗しました。もう一度お試しください",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { linked, error } = await searchParams;
  const account = await getCoachAccount(session.teamId, session.sub);
  if (!account) redirect("/login");
  const errorMessage = error ? ERRORS[error] : undefined;

  return (
    <Shell title="アカウント">
      <main>
        <div className="ah">
          <b>アカウント</b>
        </div>

        {linked === "1" && <p className="anotice">LINE を連携しました</p>}
        {errorMessage !== undefined && (
          <p className="lgerr" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="acard">
          <div className="arow">
            <b>メールアドレス</b>
            <span>{account.email}</span>
          </div>
          <div className="arow">
            <b>LINE 連携</b>
            <span className="pill">
              {account.lineLinked ? "連携済み" : "未連携"}
            </span>
          </div>
          <div className="acts">
            {account.lineLinked ? (
              <UnlinkLineButton />
            ) : (
              <a className="abtn" href="/api/auth/line/start?mode=link">
                LINE を連携
              </a>
            )}
          </div>
          <p className="anote">
            LINE
            を連携すると、次回からログイン画面の「LINEでログイン」だけで管理画面に入れます
          </p>
        </div>

        {/* 共有 PC を想定した明示的なログアウト(ダッシュボードの配置は変えない) */}
        <div className="dfoot">
          <LogoutButton />
        </div>
      </main>
    </Shell>
  );
}
