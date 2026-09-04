"use client";

import { useState } from "react";

// 招待コードのコピー。クリップボード非対応環境(古い LINE 内ブラウザ等)では選択して手動コピーに委ねる
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className="addlink boxed" onClick={copy}>
      {copied ? "コピーしました" : "コードをコピー"}
    </button>
  );
}
