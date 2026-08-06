/**
 * The app's five destinations, plus the alert feed.
 *
 * The feed is not one of the tabs: it is reached from the bell every page
 * header carries, which is a place a reader already looks for it. Keeping it
 * in the list anyway means {@link isActive} can say the home tab owns it,
 * rather than every page having to know.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: () => React.ReactElement;
  /** Reached from the bell in the header rather than from the bar. */
  headerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Нүүр", icon: PieIcon },
  { href: "/discover", label: "Зах зээл", icon: TrendIcon },
  { href: "/portfolio", label: "Багц", icon: CertificateIcon },
  { href: "/news", label: "Мэдээ", icon: NewsIcon },
  { href: "/notifications", label: "Мэдэгдэл", icon: BellIcon, headerOnly: true },
  { href: "/profile", label: "Профайл", icon: PersonIcon },
];

/**
 * Which tab owns a page.
 *
 * Pages that are a section's second screen light that section: the order
 * history belongs to the portfolio, a company's page to the market list, and
 * the alert feed to home, whose header carries the bell that opens it.
 */
export function isActive(pathname: string, href: string): boolean {
  switch (href) {
    case "/":
      return pathname === "/" || pathname.startsWith("/notifications");
    case "/discover":
      return pathname.startsWith("/discover") || pathname.startsWith("/stock");
    case "/portfolio":
      return pathname.startsWith("/portfolio") || pathname.startsWith("/orders");
    case "/profile":
      return pathname.startsWith("/profile") || pathname === "/settings";
    default:
      return pathname.startsWith(href);
  }
}

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

function PieIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="8.5" {...STROKE} />
      <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12H12V3.5Z" fill="currentColor" />
      <path d="M12 3.5v8.5h8.5" {...STROKE} />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <path d="M4 4v16h16" {...STROKE} />
      <path d="m7.5 15.5 3.5-3.8 2.6 2.4L19 8" {...STROKE} />
      <path d="M14.9 8H19v4.1" {...STROKE} />
    </svg>
  );
}

function CertificateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <rect x="2.8" y="4.5" width="13.4" height="10.5" rx="1" {...STROKE} />
      <path d="M5.8 8.3h7.4M5.8 11.4h4.6" {...STROKE} />
      <circle cx="17.2" cy="14.4" r="3.1" {...STROKE} />
      <path d="m15.4 16.9-.5 3.6 2.3-1.4 2.3 1.4-.5-3.6" {...STROKE} />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <path d="M4 5.5h13v13a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" {...STROKE} />
      <path d="M17 9h2.5A1.5 1.5 0 0 1 21 10.5v8a1.5 1.5 0 0 1-1.5 1.5H17" {...STROKE} />
      <path d="M7 9h7M7 12.5h7M7 16h4" {...STROKE} />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" {...STROKE} />
      <path d="M13.7 19.5a2 2 0 0 1-3.4 0" {...STROKE} />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="8" r="3.4" {...STROKE} />
      <path d="M5 20c1.2-3.7 4-5.5 7-5.5s5.8 1.8 7 5.5" {...STROKE} />
    </svg>
  );
}
