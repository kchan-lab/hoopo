// タブバー・行アイコン。パスは docs/wireframes/wireframes-v6.html の <symbol> と同一

const PATHS = {
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6.2 9.6V20h11.6V9.6" />
    </>
  ),
  yen: (
    <>
      <rect x="3" y="6.2" width="18" height="11.6" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  cal: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.8h17M8 3v4M16 3v4" />
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
  send: <path d="M20 4L10.8 13.2M20 4l-5.2 16-3.4-6.6L4 10.2 20 4z" />,
  pin: (
    <>
      <path d="M12 21s-6.4-5.4-6.4-10a6.4 6.4 0 1112.8 0C18.4 15.6 12 21 12 21z" />
      <circle cx="12" cy="10.6" r="2.1" />
    </>
  ),
  note: (
    <>
      <path d="M5 4.5h11L19 7.5V19.5H5z" />
      <path d="M8.5 10h7M8.5 13.5h7" />
    </>
  ),
  chevl: <path d="M14.5 6l-6 6 6 6" />,
  chevr: <path d="M9.5 6l6 6-6 6" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
