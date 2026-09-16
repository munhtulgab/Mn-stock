"use client";

import { useState } from "react";
import { ulaanbaatarStamp } from "@/lib/day";
import Glyph from "./Glyph";
import Select from "./Select";

/**
 * When something happened, chosen rather than typed.
 *
 * It replaces `<input type="datetime-local">` on the one field in the
 * application that sets a moment by hand: the time an order filled, as an
 * administrator corrects it. That input is drawn by the browser, which means
 * it is a different control on every machine the administration pages are
 * opened on — three segments and a tiny calendar mark on a desktop, a full
 * screen wheel on a phone, and on some of them no visible way of clearing the
 * field at all. None of them look like the rest of this page.
 *
 * More to the point, the question being answered is "which day, and what time
 * on it", and a month is far easier to read as a month than as a pair of
 * digits between two slashes. So: a calendar you can see the shape of the
 * month in, and three counters for the clock.
 *
 * It speaks the same string the input did — `YYYY-MM-DDTHH:MM` on
 * Ulaanbaatar's clock face — so nothing downstream had to change.
 * `fromUlaanbaatarStamp` still turns it into a moment.
 *
 * The arithmetic is done on the digits in UTC, as everywhere else in the
 * application that handles an Ulaanbaatar day: handing `2026-09-01` to a
 * local `Date` moves it by a day for a reader in the wrong half of the world.
 */

const MONTHS = [
  "1-р сар",
  "2-р сар",
  "3-р сар",
  "4-р сар",
  "5-р сар",
  "6-р сар",
  "7-р сар",
  "8-р сар",
  "9-р сар",
  "10-р сар",
  "11-р сар",
  "12-р сар",
];

/**
 * Monday first, as the week is counted here and as the activity chart already
 * numbers it. Two letters because seven columns in a 280px panel is 40px a
 * column, and "Даваа" does not fit in one.
 */
const WEEKDAY_HEADS = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];

interface Parts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The clock face in Ulaanbaatar right now, in this component's own form. */
function nowInUlaanbaatar(): string {
  return ulaanbaatarStamp(new Date()).slice(0, 16);
}

function parse(value: string): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  // An unreadable value is this moment in Ulaanbaatar rather than an empty
  // control: the field is never blank on this form, and a blank one would
  // save a correction dated to nothing.
  if (!match) return parse(nowInUlaanbaatar());
  const [, y, m, d, hh, mm] = match;
  return {
    year: Number(y),
    month: Number(m),
    day: Number(d),
    hour: Number(hh),
    minute: Number(mm),
  };
}

function format({ year, month, day, hour, minute }: Parts): string {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/** How many days a month has, from the zeroth day of the next one. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which column the first of a month falls in, counting Monday as nought. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** The 12-hour face and the half of the day, from an hour of 24. */
function twelve(hour: number): { hour: number; pm: boolean } {
  return { hour: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 };
}

/** …and back again. */
function twentyFour(hour: number, pm: boolean): number {
  return (hour % 12) + (pm ? 12 : 0);
}

export default function DateTimePicker({
  value,
  onChange,
  label,
  id,
}: {
  /** `YYYY-MM-DDTHH:MM`, on Ulaanbaatar's clock. */
  value: string;
  onChange: (value: string) => void;
  /** The wording in the notch cut into the top border. */
  label: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const parts = parse(value);
  // Which month the calendar is showing, which is not the same question as
  // which day is chosen: leafing forward to check a date should not move the
  // order to it.
  const [shown, setShown] = useState({ year: parts.year, month: parts.month });

  const face = twelve(parts.hour);
  const set = (next: Partial<Parts>) => onChange(format({ ...parts, ...next }));

  function shift(months: number) {
    const at = new Date(Date.UTC(shown.year, shown.month - 1 + months, 1));
    setShown({ year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 });
  }

  function pickDay(day: number) {
    set({ year: shown.year, month: shown.month, day });
  }

  /**
   * Өнөөдөр and Одоо, both read off Ulaanbaatar's clock and not the reader's
   * — an administrator abroad correcting an order still means the exchange's
   * today, which is the whole reason this field is stated in that zone.
   */
  function jumpTo(withTime: boolean) {
    const now = parse(nowInUlaanbaatar());
    const next: Parts = withTime
      ? now
      : { ...parts, year: now.year, month: now.month, day: now.day };
    setShown({ year: next.year, month: next.month });
    onChange(format(next));
  }

  const total = daysIn(shown.year, shown.month);
  const lead = leadingBlanks(shown.year, shown.month);
  const before = daysIn(shown.year, shown.month === 1 ? 12 : shown.month - 1);
  const cells: { day: number; muted: boolean }[] = [
    ...Array.from({ length: lead }, (_, i) => ({ day: before - lead + 1 + i, muted: true })),
    ...Array.from({ length: total }, (_, i) => ({ day: i + 1, muted: false })),
  ];
  // Pad the last week out so the grid keeps its rectangle; the following
  // month's days are not drawn, as on a wall calendar.
  while (cells.length % 7 !== 0) cells.push({ day: 0, muted: true });

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 13 }, (_, i) => thisYear + 1 - i).map((y) => ({
    value: String(y),
    label: String(y),
  }));

  return (
    // A container, because what decides whether the calendar and the clock fit
    // side by side is the width of this field and not of the window. The
    // account ledger halves its panel at `lg`, so the edit form on a 1180px
    // laptop is narrower than the same form on an 800px tablet — and at that
    // width two columns left the month and the year as "9-р…" and "20…".
    <div className="@container relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="relative flex w-full items-center gap-3 rounded-2xl border-2 border-brand bg-app-card px-4 py-3 text-left"
      >
        {/* The wording sits in a notch cut into the border, as on the sheet
            this is modelled on: the field keeps its outline unbroken by a
            label above it, and the outline is what says the field is one
            thing and not two. */}
        <span className="absolute -top-2.5 left-3.5 rounded-full border border-brand bg-app-card px-2 text-[11px] font-semibold text-brand">
          {label}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-app-text">
            <span className="text-brand">
              <Glyph name="calendar" size={17} />
            </span>
            <span className="text-[15px] font-semibold tabular-nums">
              {MONTHS[parts.month - 1]} {pad(parts.day)}, {parts.year}
            </span>
          </span>
          <span className="h-4 w-px bg-app-border" />
          <span className="flex items-center gap-2 text-app-text">
            <span className="text-brand">
              <Glyph name="clock" size={17} />
            </span>
            <span className="text-[15px] font-semibold tabular-nums">
              {pad(face.hour)} : {pad(parts.minute)} {face.pm ? "ҮХ" : "ҮӨ"}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-brand">
          <Glyph name="calendarClock" size={22} />
        </span>
      </button>

      {open && (
        <div className="mt-2 grid gap-4 rounded-2xl border border-app-border bg-app-card p-4 shadow-[0_18px_44px_-16px_rgba(16,24,40,0.28)] @min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          {/* The month */}
          <div className="min-w-0">
            {/* Tight: "10-р сар" has to fit in the month box beside a year and
                two arrows, inside a column that is half of a narrow panel. */}
            <div className="flex items-center gap-1.5">
              <Arrow name="chevronLeft" label="Өмнөх сар" onClick={() => shift(-1)} />
              {/* The two share what the arrows leave, in the ratio their
                  longest wordings need — a fixed width for either one was a
                  fight the other lost at some panel width or other. */}
              <div className="min-w-0 flex-[1.2]">
                <Select
                  dense
                  label="Сар"
                  value={String(shown.month)}
                  options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                  onChange={(m) => setShown({ ...shown, month: Number(m) })}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Select
                  dense
                  label="Он"
                  value={String(shown.year)}
                  options={years}
                  onChange={(y) => setShown({ ...shown, year: Number(y) })}
                />
              </div>
              <Arrow name="chevronRight" label="Дараах сар" onClick={() => shift(1)} />
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1">
              {WEEKDAY_HEADS.map((head) => (
                <div
                  key={head}
                  className="py-1 text-center text-[12px] font-semibold text-app-muted"
                >
                  {head}
                </div>
              ))}
              {cells.map((cell, index) => {
                if (cell.day === 0) return <div key={`pad-${index}`} />;
                const chosen =
                  !cell.muted &&
                  cell.day === parts.day &&
                  shown.month === parts.month &&
                  shown.year === parts.year;
                return (
                  <button
                    key={`${cell.muted ? "x" : "d"}-${index}`}
                    type="button"
                    disabled={cell.muted}
                    aria-current={chosen ? "date" : undefined}
                    onClick={() => pickDay(cell.day)}
                    className={`flex h-9 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums ${
                      cell.muted
                        ? "text-app-muted/60"
                        : chosen
                          ? "bg-brand text-[var(--on-brand)]"
                          : "bg-app-elevated text-app-text hover:bg-brand-light hover:text-brand"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* The clock */}
          <div className="flex min-w-0 flex-col">
            <h4 className="text-[15px] font-semibold text-app-text">Цаг хугацаа</h4>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Counter
                label="Цаг"
                text={pad(face.hour)}
                value={face.hour}
                min={1}
                max={12}
                onStep={(next) => set({ hour: twentyFour(next, face.pm) })}
              />
              <Counter
                label="Минут"
                text={pad(parts.minute)}
                value={parts.minute}
                min={0}
                max={59}
                onStep={(next) => set({ minute: next })}
              />
              <Counter
                label="ҮӨ / ҮХ"
                text={face.pm ? "ҮХ" : "ҮӨ"}
                value={face.pm ? 1 : 0}
                min={0}
                max={1}
                onStep={(next) => set({ hour: twentyFour(face.hour, next === 1) })}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-app-divider pt-4">
              <Quick label="Өнөөдөр" onClick={() => jumpTo(false)} />
              <Quick label="Одоо" onClick={() => jumpTo(true)} />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ color: "var(--on-brand)" }}
              className="mt-2 w-full rounded-xl bg-brand py-3 text-sm font-bold @min-[36rem]:mt-auto"
            >
              Болсон
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One of the two round buttons that leaf a month at a time. */
function Arrow({
  name,
  label,
  onClick,
}: {
  name: "chevronLeft" | "chevronRight";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-elevated text-app-text hover:bg-brand-light hover:text-brand"
    >
      <Glyph name={name} size={16} />
    </button>
  );
}

/**
 * One column of the clock: a chevron up, the figure, a chevron down.
 *
 * It wraps at both ends, so the minute after 59 is 00 rather than nothing —
 * a counter that stops dead at the top of its range makes somebody press the
 * other arrow sixty times. The figure itself is a `spinbutton`, which is what
 * lets the arrow keys do the same thing as the arrows and tells a screen
 * reader what it is looking at.
 */
function Counter({
  label,
  text,
  value,
  min,
  max,
  onStep,
}: {
  label: string;
  text: string;
  value: number;
  min: number;
  max: number;
  onStep: (next: number) => void;
}) {
  const span = max - min + 1;
  const step = (by: number) => onStep(min + (((value - min + by) % span) + span) % span);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-center text-[12px] font-medium text-app-muted">{label}</div>
      <Step name="chevronUp" label={`${label} нэмэх`} onClick={() => step(1)} />
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={text}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            step(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            step(-1);
          }
        }}
        className="my-1.5 flex h-11 items-center justify-center rounded-xl border border-app-border bg-app-card text-[17px] font-bold tabular-nums text-app-text"
      >
        {text}
      </div>
      <Step name="chevron" label={`${label} хасах`} onClick={() => step(-1)} />
    </div>
  );
}

function Step({
  name,
  label,
  onClick,
}: {
  name: "chevronUp" | "chevron";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-full items-center justify-center rounded-lg bg-app-elevated text-app-text hover:bg-brand-light hover:text-brand"
    >
      <Glyph name={name} size={15} />
    </button>
  );
}

function Quick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-app-elevated py-2.5 text-sm font-semibold text-app-text hover:bg-brand-light hover:text-brand"
    >
      {label}
    </button>
  );
}
