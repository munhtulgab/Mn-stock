"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { labelOf, type FilterOption } from "@/lib/adminFilters";

/**
 * The one control at the top of a list page: a search box, three questions,
 * and a plain statement of what is currently being asked.
 *
 * It replaced a bare text input on each of the two lists. The input was not
 * wrong, it was simply the only question either page could be asked — so
 * "which accounts signed up and never traded" and "which of last week's
 * orders were corrections" were answered by reading fifty rows at a time, and
 * on the orders page by reading them fifty at a time across several pages.
 *
 * Three things make it more than a row of selects:
 *
 *  - Everything is in the URL. A filtered list is a link, which is how one
 *    administrator shows another what they are looking at.
 *  - The chips underneath say what is being asked in the same words the
 *    controls use, and each one can be taken back on its own. A count of
 *    active filters with no way to see them is how a reader ends up staring
 *    at an empty list wondering what they left switched on.
 *  - A select applies itself. Making somebody choose and then press Apply is
 *    a second click for nothing — but the typed query needs a moment to
 *    finish being typed, so that one waits for Enter or the button. Either
 *    way the whole form is sent, so a half-typed search is never thrown away
 *    by touching a select beside it.
 *
 * `page` is deliberately not a field: rebuilding the query from the form is
 * what returns a filtered list to its first page, which is where the rows
 * that match it now are.
 */
export interface FilterSelect {
  name: string;
  label: string;
  /** What is currently applied — from the URL, not from the control. */
  value: string;
  options: readonly FilterOption[];
  icon: GlyphName;
}

export default function FilterBar({
  action,
  search,
  selects,
}: {
  /** The path the list lives at, e.g. `/admin/users`. */
  action: string;
  search: { name: string; label: string; placeholder: string; value: string };
  selects: FilterSelect[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  // The box holds a draft; `search.value` is what the list is actually
  // filtered by. They differ for as long as somebody is typing, and the
  // chips below must follow the second rather than the first.
  //
  // When the applied value changes under it — a chip removed, the clear
  // pressed, the back button — the draft has to follow, or the box goes on
  // showing a search that is no longer being made. Adjusted during render
  // rather than in an effect: React re-runs this component before anything
  // is painted, so the stale value never reaches the screen, whereas an
  // effect would show it for a frame and then correct it.
  const [draft, setDraft] = useState(search.value);
  const [lastApplied, setLastApplied] = useState(search.value);
  if (lastApplied !== search.value) {
    setLastApplied(search.value);
    setDraft(search.value);
  }

  const applied = [
    ...(search.value ? [{ name: search.name, label: search.label, text: search.value }] : []),
    ...selects
      .filter((s) => s.value)
      .map((s) => ({ name: s.name, label: s.label, text: labelOf(s.options, s.value) })),
  ];

  /**
   * Send the form, with `clear` emptied if given.
   *
   * Read off the form rather than off props, so whatever is on screen is what
   * gets asked for — including a query typed but not yet submitted when a
   * select beside it is changed.
   */
  function apply(clear?: string) {
    const data = new FormData(form.current!);
    const query = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const text = key === clear ? "" : String(value).trim();
      if (text) query.set(key, text);
    }
    if (clear === search.name) setDraft("");
    const asked = query.toString();
    start(() => router.push(asked ? `${action}?${asked}` : action));
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="overflow-hidden rounded-2xl border border-app-border bg-app-card"
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-3 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <Glyph name="sliders" />
        </span>
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-app-text">
          Шүүлтүүр
        </h2>
        {applied.length > 0 && (
          <span className="rounded-full bg-brand-light px-2.5 py-1 text-[12px] font-semibold text-brand">
            {applied.length} идэвхтэй
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {applied.length > 0 && (
            <button
              type="button"
              onClick={() => start(() => router.push(action))}
              className="rounded-full px-3 py-2 text-[13px] font-semibold text-app-muted hover:bg-app-elevated hover:text-app-text"
            >
              Бүгдийг цэвэрлэх
            </button>
          )}
          <button
            type="submit"
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-[var(--on-brand)] ${
              pending ? "opacity-70" : ""
            }`}
            style={{
              background:
                "linear-gradient(180deg, var(--admin-fill-from), var(--admin-fill-to))",
            }}
          >
            {pending && <Spinner />}
            Шүүх
          </button>
        </div>
      </div>

      <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
        <Field label={search.label} htmlFor={`filter-${search.name}`}>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted">
            <Glyph name="search" />
          </span>
          <input
            id={`filter-${search.name}`}
            name={search.name}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={search.placeholder}
            autoComplete="off"
            className="w-full rounded-xl border border-app-border bg-app-card py-2.5 pr-9 pl-9 text-sm text-app-text placeholder:text-app-muted"
          />
          {draft && (
            <button
              type="button"
              onClick={() => apply(search.name)}
              aria-label="Хайлтыг цэвэрлэх"
              className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-app-muted hover:bg-app-elevated hover:text-app-text"
            >
              <Glyph name="close" />
            </button>
          )}
        </Field>

        {selects.map((s) => (
          <Field key={s.name} label={s.label} htmlFor={`filter-${s.name}`}>
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-app-muted">
              <Glyph name={s.icon} />
            </span>
            <select
              id={`filter-${s.name}`}
              name={s.name}
              defaultValue={s.value}
              onChange={() => apply()}
              className="w-full appearance-none rounded-xl border border-app-border bg-app-card py-2.5 pr-9 pl-9 text-sm font-medium text-app-text"
            >
              {s.options.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-app-muted">
              <Glyph name="chevron" />
            </span>
          </Field>
        ))}
      </div>

      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-app-divider px-4 py-3 sm:px-5">
          {applied.map((chip) => (
            <span
              key={chip.name}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-app-border bg-app-elevated py-1 pr-1.5 pl-3 text-[12px] text-app-text"
            >
              <span className="truncate">
                <span className="text-app-muted">{chip.label}:</span>{" "}
                <span className="font-semibold">{chip.text}</span>
              </span>
              <button
                type="button"
                onClick={() => apply(chip.name)}
                aria-label={`${chip.label} шүүлтийг авах`}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-app-muted hover:bg-app-card hover:text-app-text"
              >
                <Glyph name="close" />
              </button>
            </span>
          ))}
        </div>
      )}
    </form>
  );
}

/**
 * One labelled control.
 *
 * The label sits above rather than inside. A placeholder that doubles as a
 * label disappears the moment the field is filled in, which is exactly when
 * a row of four of them stops being readable.
 */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12px] font-medium text-app-muted"
      >
        {label}
      </label>
      <div className="relative">{children}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2.6" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export type GlyphName =
  | "sliders"
  | "search"
  | "close"
  | "chevron"
  | "shield"
  | "receipt"
  | "calendar"
  | "swap"
  | "tag";

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<GlyphName, React.ReactNode> = {
  sliders: (
    <>
      <path d="M4 7.5h5.5M13.5 7.5H20M4 16.5h7.5M15.5 16.5H20" />
      <circle cx="11.5" cy="7.5" r="2.1" />
      <circle cx="13.5" cy="16.5" r="2.1" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.4 15.4 4 4" />
    </>
  ),
  close: <path d="m6.8 6.8 10.4 10.4M17.2 6.8 6.8 17.2" />,
  chevron: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  shield: (
    <>
      <path d="M12 3.4 5 6v5.6c0 4 2.8 7.4 7 9 4.2-1.6 7-5 7-9V6z" />
      <path d="m9.2 11.9 2 2 3.6-3.8" />
    </>
  ),
  receipt: (
    <>
      <path d="M5.8 3.8h12.4v16.4l-3.1-1.9-3.1 1.9-3.1-1.9-3.1 1.9z" />
      <path d="M9 8.6h6M9 12.2h3.6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.8" y="5.4" width="16.4" height="14.8" rx="2.6" />
      <path d="M3.8 10h16.4M8.4 3.4v3.4M15.6 3.4v3.4" />
    </>
  ),
  swap: <path d="M7.5 4.5v13M4.2 14.2l3.3 3.3 3.3-3.3M16.5 19.5v-13M13.2 9.8l3.3-3.3 3.3 3.3" />,
  tag: (
    <>
      <path d="M11.2 3.6H20v8.8l-8.4 8.4-8.8-8.8z" />
      <circle cx="16.1" cy="7.9" r="1.5" />
    </>
  ),
};

function Glyph({ name }: { name: GlyphName }) {
  const small = name === "close" || name === "chevron";
  return (
    <svg {...LINE} width={small ? 14 : 16} height={small ? 14 : 16} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
