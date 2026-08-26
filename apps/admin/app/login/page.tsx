import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "ログイン − hoopo 管理",
};

// ログイン画面(wireframes-v6 PC-1 / SP-1)。カードの静的部分はサーバーで描画し、
// 送信まわりだけクライアント(LoginForm)に分離する

// ワイヤーフレームの #i-ball と同一パス
function BallIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6v16.8M3.6 12h16.8M5.9 6.2a11.4 11.4 0 0012.2 0M5.9 17.8a11.4 11.4 0 0112.2 0" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="lgwrap">
      <div className="acard lgin">
        <div className="mark">
          <BallIcon />
        </div>
        <h1>hoopo 管理コンソール</h1>
        <p className="cap">コーチ・スタッフ専用の画面です</p>
        {/* LINE ログインは別 Issue(admin-app.ts のコメント参照)。導線だけ先に見せておく */}
        <button type="button" className="lgbtn" disabled>
          LINEでログイン<small>(準備中)</small>
        </button>
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
