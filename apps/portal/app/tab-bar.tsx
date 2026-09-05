import Link from "next/link";
import { Icon, type IconName } from "./icons";

// タブバー(DESIGN_GUIDELINES §1.3): ホーム / 月謝 / 日程(中央の黒丸) / チーム / 提出。
// 未実装のタブはリンクにせず無効表示(月謝 #15、チーム #28、提出 #14)

type TabKey = "home" | "yen" | "cal" | "team" | "send";

const TABS: { key: TabKey; label: string; icon: IconName; href?: string }[] = [
  { key: "home", label: "ホーム", icon: "home", href: "/" },
  { key: "yen", label: "月謝", icon: "yen" },
  { key: "cal", label: "日程", icon: "cal", href: "/schedule" },
  { key: "team", label: "チーム", icon: "team" },
  { key: "send", label: "提出", icon: "send" },
];

export function TabBar({ active }: { active: TabKey }) {
  return (
    <nav className="tabbar" aria-label="メインメニュー">
      {TABS.map((t) => {
        const on = t.key === active;
        const cls = `tb${t.key === "cal" ? " center" : ""}${on ? " on" : ""}`;
        const inner =
          t.key === "cal" ? (
            <>
              <span className="orb">
                <Icon name={t.icon} />
              </span>
              {t.label}
            </>
          ) : (
            <>
              <Icon name={t.icon} />
              {t.label}
            </>
          );
        return t.href ? (
          <Link
            key={t.key}
            href={t.href}
            className={cls}
            aria-current={on ? "page" : undefined}
          >
            {inner}
          </Link>
        ) : (
          <span
            key={t.key}
            className={`${cls} soon`}
            aria-disabled="true"
            title="準備中"
          >
            {inner}
          </span>
        );
      })}
    </nav>
  );
}
