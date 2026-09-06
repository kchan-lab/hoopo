"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Icon, type IconName } from "../icons";

// 管理アプリの画面骨格(REQUIREMENTS §5.1 / DESIGN_GUIDELINES §2.3)。
// PC: 左サイドバー 168px。モバイル(<640px): ハンバーガー → 同じナビをドロワーで表示。
// 項目はワイヤーフレーム sbItems と同順。未実装の画面はリンクにせず「準備中」で置く

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  href?: string;
}

const NAV: NavItem[] = [
  { key: "dash", label: "ダッシュボード", icon: "home", href: "/" },
  { key: "att", label: "出欠管理", icon: "check", href: "/attendance" },
  { key: "abs", label: "欠席者管理", icon: "note", href: "/absentees" },
  { key: "cert", label: "認定管理", icon: "lock", href: "/registrations" },
  { key: "sched", label: "日程管理", icon: "cal", href: "/schedule" },
  { key: "fee", label: "月謝管理", icon: "yen" },
  { key: "mem", label: "部員管理", icon: "team", href: "/members" },
];

function activeKey(pathname: string): string {
  const hit = NAV.filter((n) => n.href && n.href !== "/").find((n) =>
    pathname.startsWith(n.href as string),
  );
  return hit?.key ?? "dash";
}

function NavList({
  active,
  onNavigate,
}: {
  active: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="lg">
        <Icon name="ball" />
        hoopo 管理
      </div>
      {NAV.map((n) =>
        n.href ? (
          <Link
            key={n.key}
            href={n.href}
            className={`ai${n.key === active ? " on" : ""}`}
            aria-current={n.key === active ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ) : (
          <span key={n.key} className="ai soon" aria-disabled="true">
            <Icon name={n.icon} />
            {n.label}
            <small>準備中</small>
          </span>
        ),
      )}
    </>
  );
}

export function Shell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeKey(pathname);
  const [open, setOpen] = useState(false);

  // ドロワー表示中は背面のスクロールを止める。Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="aapp">
      <nav className="aside" aria-label="管理メニュー">
        <NavList active={active} />
      </nav>
      <div className="amain">
        <div className="mhead">
          <button
            type="button"
            className="menu-btn"
            aria-label="メニューを開く"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span>{title}</span>
        </div>
        {children}
      </div>
      {open && (
        <div className="adrawer-wrap">
          <nav className="aside adrawer" aria-label="管理メニュー">
            <NavList active={active} onNavigate={() => setOpen(false)} />
          </nav>
          <button
            type="button"
            className="ascrim"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
