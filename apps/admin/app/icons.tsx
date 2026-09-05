// サイドバー・トップバーのアイコン。パスは docs/wireframes/wireframes-v6.html の <symbol> と同一

const PATHS = {
  ball: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6v16.8M3.6 12h16.8M5.9 6.2a11.4 11.4 0 0012.2 0M5.9 17.8a11.4 11.4 0 0112.2 0" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6.2 9.6V20h11.6V9.6" />
    </>
  ),
  check: <path d="M5 12.6l4.4 4.4L19 7.4" />,
  note: (
    <>
      <path d="M5 4.5h11L19 7.5V19.5H5z" />
      <path d="M8.5 10h7M8.5 13.5h7" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="11" width="13" height="9" rx="2" />
      <path d="M8.5 11V8.4a3.5 3.5 0 017 0V11" />
    </>
  ),
  cal: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.8h17M8 3v4M16 3v4" />
    </>
  ),
  yen: (
    <>
      <rect x="3" y="6.2" width="18" height="11.6" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.6 19c0-3 2.4-4.8 5.4-4.8s5.4 1.8 5.4 4.8" />
      <circle cx="16.8" cy="9.6" r="2.2" />
      <path d="M16.2 14.6c2.5.3 4.2 1.8 4.2 4.1" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
