"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { labelOf, type FilterOption } from "@/lib/adminFilters";
import Glyph from "@/components/ui/Glyph";
import Select from "@/components/ui/Select";

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
 *  - A dropdown applies itself. Making somebody choose and then press Apply
 *    is a second click for nothing — but the typed query needs a moment to
 *    finish being typed, so that one waits for Enter or the button. Either
 *    way the whole form is sent, so a half-typed search is never thrown away
 *    by touching a dropdown beside it.
 *  - Every choice carries its own mark. `Авсан` and `Зарсан`, `Захиалга
 *    хийсэн` and `Захиалга хийгээгүй` are opposites, and an arrow in against
 *    an arrow out says so before either word has been read. The browser's
 *    `<select>` cannot draw one, which is why these are `components/ui/Select`.
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

  // The dropdowns are the same story one step on. A `<select>` could be left
  // uncontrolled and read back off the form at the moment of asking; a button
  // and a list have to be told what they are showing, so what is on screen is
  // held here and what is applied arrives in `selects`. The two are pulled
  // back together during render for the reason above.
  const chosen = () => Object.fromEntries(selects.map((s) => [s.name, s.value]));
  const applyKey = selects.map((s) => `${s.name}=${s.value}`).join("&");
  const [values, setValues] = useState<Record<string, string>>(chosen);
  const [lastKey, setLastKey] = useState(applyKey);
  if (lastKey !== applyKey) {
    setLastKey(applyKey);
    setValues(chosen());
  }

  const applied = [
    ...(search.value ? [{ name: search.name, label: search.label, text: search.value }] : []),
    ...selects
      .filter((s) => s.value)
      .map((s) => ({ name: s.name, label: s.label, text: labelOf(s.options, s.value) })),
  ];

  /**
   * Ask for what is on screen, with `next` taking precedence over it.
   *
   * Built from what the controls are showing rather than from what is
   * applied, so a query typed but not yet submitted survives a dropdown
   * being changed beside it. The override exists because a choice has to be
   * acted on in the same breath it is made: React has not re-rendered with
   * the new value yet at the moment this runs.
   */
  function apply(next: { query?: string; values?: Record<string, string> } = {}) {
    const query = new URLSearchParams();
    const typed = (next.query ?? draft).trim();
    if (typed) query.set(search.name, typed);
    const picked = next.values ?? values;
    for (const s of selects) {
      const value = (picked[s.name] ?? "").trim();
      if (value) query.set(s.name, value);
    }
    const asked = query.toString();
    start(() => router.push(asked ? `${action}?${asked}` : action));
  }

  /** Take one filter back, by name, and ask again without it. */
  function clear(name: string) {
    if (name === search.name) {
      setDraft("");
      apply({ query: "" });
      return;
    }
    const without = { ...values, [name]: "" };
    setValues(without);
    apply({ values: without });
  }

  return (
    <form
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
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-app-muted hover:bg-app-elevated hover:text-app-text"
            >
              <Glyph name="close" size={13} />
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
            {pending ? <Spinner /> : <Glyph name="search" size={15} />}
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
              onClick={() => clear(search.name)}
              aria-label="Хайлтыг цэвэрлэх"
              className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-app-muted hover:bg-app-elevated hover:text-app-text"
            >
              <Glyph name="close" />
            </button>
          )}
        </Field>

        {selects.map((s) => (
          <Field key={s.name} label={s.label} htmlFor={`filter-${s.name}`}>
            <Select
              id={`filter-${s.name}`}
              name={s.name}
              label={s.label}
              value={values[s.name] ?? ""}
              options={s.options}
              onChange={(value) => {
                const next = { ...values, [s.name]: value };
                setValues(next);
                apply({ values: next });
              }}
            />
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
                onClick={() => clear(chip.name)}
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
