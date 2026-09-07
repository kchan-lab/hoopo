import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "ログイン − hoopo 管理",
};

// ログイン画面(wireframes-v6 PC-1 / SP-1)。カードの静的部分はサーバーで描画し、
// 送信まわりだけクライアント(LoginForm)に分離する。
// LINE ログインは画面遷移だけで完結する(GET /api/auth/line/start → LINE → callback)ので
// リンクで足り、結果は ?error= で戻ってくる(admin-line-login/plan.md)

const LINE_ERRORS: Record<string, string> = {
  line_unlinked:
    "このLINEアカウントは管理者として登録されていません。メールでログインして「LINE を連携」してください",
  line_denied: "LINEログインがキャンセルされました",
  line_state: "LINEログインに失敗しました。もう一度お試しください",
  line_failed: "LINEログインに失敗しました。もう一度お試しください",
};

// ワイヤーフレームの #i-ball と同一パス
function BallIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6v16.8M3.6 12h16.8M5.9 6.2a11.4 11.4 0 0012.2 0M5.9 17.8a11.4 11.4 0 0112.2 0" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? LINE_ERRORS[error] : undefined;

  return (
    <main className="lgwrap">
      <div className="acard lgin">
        <div className="mark">
          <BallIcon />
        </div>
        <h1>hoopo 管理コンソール</h1>
        <p className="cap">コーチ・スタッフ専用の画面です</p>
        {message !== undefined && (
          <p className="lgerr" role="alert">
            {message}
          </p>
        )}
        {/* 意匠はモノトーンのまま(LINE 公式の緑ボタンは使わない。plan.md スコープ外) */}
        <a className="lgbtn" href="/api/auth/line/start">
          LINEでログイン
        </a>
        <div className="or" aria-hidden="true">
          <i />
          または
          <i />
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
