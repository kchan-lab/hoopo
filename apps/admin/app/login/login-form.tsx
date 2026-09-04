"use client";

import { type FormEvent, useState } from "react";

// メール+パスワードでのログイン。API 契約は POST /api/auth/login(packages/api/admin-app.ts)。
// 401 は資格情報の誤り(email 不明/パスワード不一致は区別されない)、それ以外は汎用文言に落とす

const CREDENTIAL_ERROR = "メールアドレスまたはパスワードが違います";
const GENERIC_ERROR = "ログインできませんでした。もう一度お試しください";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      if (res.ok) {
        // 成功時は submitting のままホームへ(戻る操作でフォームを再送させない)
        window.location.href = "/";
        return;
      }
      setError(res.status === 401 ? CREDENTIAL_ERROR : GENERIC_ERROR);
      setSubmitting(false);
    } catch {
      setError(GENERIC_ERROR);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
      <div className="lgfld">
        <label htmlFor="login-email">メールアドレス</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>
      <div className="lgfld">
        <label htmlFor="login-password">パスワード</label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <button type="submit" className="lgbtn fill" disabled={submitting}>
        {submitting ? "ログインしています…" : "ログイン"}
      </button>
    </form>
  );
}
