"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ホーム右上の丸ボタン。押すと「家族の設定 / プライバシーポリシー / ログアウト」を選べる
// メニューが開く(family-settings-entry/plan.md 設計判断0)。
// 確認はネイティブの confirm() ではなく行内の二段階確認にする(CLAUDE.md 開発ルール。
// apps/portal/app/family/unlink-button.tsx と同じ作り)

export function AccountMenu({ initial }: { initial: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  // useEffect の依存に入れるので、毎回作り直さない(作り直すと Esc の購読が張り直される)
  const close = useCallback(() => {
    setOpen(false);
    setConfirming(false);
    setError(null);
    // 閉じたら丸ボタンに戻す(キーボード操作で行き先を失わないように)
    triggerRef.current?.focus();
  }, []);

  // Esc で閉じる。開いたら先頭の項目へ移し、キーボードだけでも辿れるようにする
  // (項目は丸ボタンの直後にあるので Tab でそのまま進める)
  useEffect(() => {
    if (!open) return;
    // 閉じ方は1か所にまとめる(ここで書き写すと、close() に手を入れたとき
    // Esc だけ追従し忘れる。#189 のレビュー指摘)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    firstItemRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.status === 204) {
        // Cookie が消えたので、ホームを読み直すと未ログインの画面に落ち着く
        window.location.href = "/";
        return;
      }
      setError("ログアウトできませんでした。もう一度お試しください");
      setBusy(false);
    } catch {
      setError("ログアウトできませんでした。もう一度お試しください");
      setBusy(false);
    }
  }

  return (
    <div className="acct">
      <button
        type="button"
        ref={triggerRef}
        className="avatar"
        aria-label="メニュー"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {initial}
      </button>
      {open && (
        <>
          <nav className="acct-menu" aria-label="メニュー">
            <Link
              href="/family"
              className="acct-item"
              ref={firstItemRef}
              onClick={() => setOpen(false)}
            >
              家族の設定
              <small>招待コードの共有・連携済みの家族</small>
            </Link>
            <Link
              href="/privacy"
              className="acct-item"
              onClick={() => setOpen(false)}
            >
              プライバシーポリシー
            </Link>
            {confirming ? (
              <div className="acct-confirm">
                <span className="q">ログアウトしますか?</span>
                <span className="q">
                  LINEのトークからこのアプリを開き直すと、また入れます
                </span>
                <div className="btns">
                  <button
                    type="button"
                    className="cta inline sec2"
                    onClick={() => {
                      // 前回の失敗の文言も消す。残すと、やり直していないのに
                      // 失敗したように見える(#189 のレビュー指摘)
                      setConfirming(false);
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="cta inline"
                    onClick={logout}
                    disabled={busy}
                  >
                    {busy ? "ログアウト中…" : "ログアウトする"}
                  </button>
                </div>
                {error !== null && (
                  <p className="err" role="alert">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="acct-item"
                onClick={() => setConfirming(true)}
              >
                ログアウト
              </button>
            )}
          </nav>
          {/* 外側をタップしても閉じる。読み上げでも閉じ方が分かるように名前を付ける
           * (apps/admin の .ascrim と同じ作り)。項目の後ろに置き、Tab の順序を崩さない */}
          <button
            type="button"
            className="acct-scrim"
            aria-label="メニューを閉じる"
            onClick={close}
          />
        </>
      )}
    </div>
  );
}
