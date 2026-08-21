import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * The top of a section: its name, and the two things that should be one tap
 * away from anywhere — search, and what has happened since you last looked.
 *
 * Both used to live on the home page alone, which meant reaching either one
 * from the market list or the portfolio was a trip through the tab bar. The
 * unread count is read here rather than passed in, so a page only has to say
 * what it is called.
 */
export default async function PageHeader({
  title,
  eyebrow,
}: {
  title: React.ReactNode;
  /** Small line above the title, e.g. a greeting. */
  eyebrow?: string;
}) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const unread = user ? await getUnreadCount(db, user) : 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-app-muted text-sm">{eyebrow}</p>}
        <h1 className="text-xl font-bold text-app-text truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ThemeToggle />
        <Link
          href="/discover"
          aria-label="Хайх"
          className="w-10 h-10 rounded-full bg-app-card border border-app-border flex items-center justify-center text-app-muted active:scale-95 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </Link>
        <Link
          href="/notifications"
          aria-label={`Мэдэгдэл${unread > 0 ? ` (${unread} шинэ)` : ""}`}
          className="relative w-10 h-10 rounded-full bg-app-card border border-app-border flex items-center justify-center text-app-muted active:scale-95 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M13.7 19a2 2 0 0 1-3.4 0"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand text-black text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
