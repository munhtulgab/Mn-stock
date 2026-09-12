import Link from "next/link";

export default function Section({
  title,
  note,
  action,
  aside,
  className = "",
  fill = false,
  children,
}: {
  title: string;
  /** Which session the figures belong to, when that isn't obvious. */
  note?: string | null;
  action?: { href: string; label: string };
  /**
   * Anything else for the corner beside the heading — a set of scroll dots,
   * say. A link is what usually goes there and `action` stays the short way
   * to say so; this is for a control that has to be rendered rather than
   * described, which means the section carrying one is a client component.
   */
  aside?: React.ReactNode;
  /** Placement in the wide-screen grid. */
  className?: string;
  /**
   * Stretch to the height of whatever shares this grid row, and give the body
   * the leftover space.
   *
   * For the two side-by-side panels on the wide layout. The grid is
   * `items-start`, so each section is otherwise as tall as its own contents
   * and the two columns end at different places — which looks like one of
   * them failed to load. Stretching both makes the taller one set the height
   * and the shorter one fill it, rather than either being given a fixed
   * figure that is wrong whenever the lists are short.
   */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`${fill ? "lg:self-stretch lg:flex lg:flex-col" : ""} ${className}`}
    >
      <div className="flex items-center justify-between mb-3 lg:shrink-0">
        <h2 className="font-semibold text-app-text text-sm">
          {title}
          {note && <span className="text-app-muted font-normal ml-1.5">· {note}</span>}
        </h2>
        {aside}
        {action && (
          <Link href={action.href} className="text-xs text-brand font-medium">
            {action.label}
          </Link>
        )}
      </div>
      {/* min-h-0 or the body refuses to shrink below its content and the
          scroll never engages — a flex item's default minimum is its content. */}
      {fill ? (
        <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}
