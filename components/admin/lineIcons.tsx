const LINE = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "shrink-0 text-app-muted",
};

export function UserIcon() {
  return (
    <svg {...LINE}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.8 19.4c1.2-3.4 4-5 7.2-5s6 1.6 7.2 5" />
    </svg>
  );
}

export function BadgeIcon() {
  return (
    <svg {...LINE}>
      <rect x="4" y="4.5" width="16" height="15" rx="2.4" />
      <circle cx="12" cy="10" r="2.4" />
      <path d="M8.4 17.2c.8-1.8 2-2.6 3.6-2.6s2.8.8 3.6 2.6" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...LINE}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg {...LINE}>
      <path d="M7.4 3.6 9.8 6a1.6 1.6 0 0 1-.2 2.2L8.2 9.4a11 11 0 0 0 6.4 6.4l1.2-1.4a1.6 1.6 0 0 1 2.2-.2l2.4 2.4c.6.6.5 1.6-.2 2.1-1 .8-2.4 1.4-3.9 1.1-4.3-.8-8.9-5.4-9.7-9.7-.3-1.5.3-2.9 1.1-3.9.5-.7 1.5-.8 2.1-.2Z" />
    </svg>
  );
}

export function CashIcon() {
  return (
    <svg {...LINE}>
      <rect x="2.8" y="6.4" width="18.4" height="11.2" rx="2.2" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...LINE}>
      <path d="M12 3.6 19 6.4v5.4c0 4.4-2.9 7.3-7 8.6-4.1-1.3-7-4.2-7-8.6V6.4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function DeviceIcon() {
  return (
    <svg {...LINE}>
      <rect x="2.8" y="4.6" width="18.4" height="12" rx="2.2" />
      <path d="M8.4 20.2h7.2" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg {...LINE}>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" />
      <path d="M3.4 9.8h17.2M8.2 3.4v3.6M15.8 3.4v3.6" />
    </svg>
  );
}

/**
 * The same drawing, without a colour of its own.
 *
 * `LINE` paints itself `text-app-muted`, which is right for a label in a list
 * of details and wrong everywhere the mark is meant to take the colour of
 * what it sits in — a panel heading's brand-tinted tile, or a figure that is
 * green when it is a gain. These inherit instead.
 */
const MARK = { ...LINE, className: "shrink-0" };

/** Bars: a chart, or the activity one is drawn from. */
export function ChartMark() {
  return (
    <svg {...MARK}>
      <path d="M6.5 17.5v-5M12 17.5v-11M17.5 17.5v-7" />
    </svg>
  );
}

/** A heartbeat over a box: the installation, and whether it is running. */
export function PulseMark() {
  return (
    <svg {...MARK}>
      <rect x="3" y="4.6" width="18" height="14.8" rx="2.6" />
      <path d="M6.6 12.4h2.6l1.5-3 2.3 6 1.8-3h2.6" />
    </svg>
  );
}

/** A docket: one order, and by extension a list of them. */
export function ReceiptMark() {
  return (
    <svg {...MARK}>
      <path d="M5.8 3.8h12.4v16.4l-3.1-1.9-3.1 1.9-3.1-1.9-3.1 1.9z" />
      <path d="M9 8.6h6M9 12.2h3.6" />
    </svg>
  );
}

/** A person with a plus: an account that has just been opened. */
export function UserPlusMark() {
  return (
    <svg {...MARK}>
      <circle cx="10" cy="8.2" r="3.4" />
      <path d="M3.8 19.2c1-3.3 3.4-4.9 6.2-4.9" />
      <path d="M16.6 13.6v6M13.6 16.6h6" />
    </svg>
  );
}

/** A stack of coins: an amount of money rather than a count of things. */
export function CoinMark() {
  return (
    <svg {...MARK}>
      <ellipse cx="9" cy="7" rx="5.6" ry="2.6" />
      <path d="M3.4 7v3.4c0 1.4 2.5 2.6 5.6 2.6s5.6-1.2 5.6-2.6V7" />
      <path d="M14.6 10.6c2.7.3 4.6 1.4 4.6 2.6 0 1.4-2.5 2.6-5.6 2.6-1 0-2-.1-2.8-.4" />
      <path d="M8 16.3v.5c0 1.4 2.5 2.6 5.6 2.6s5.6-1.2 5.6-2.6v-3.6" />
    </svg>
  );
}

/** A day on a calendar. */
export function CalendarMark() {
  return (
    <svg {...MARK}>
      <rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2.4" />
      <path d="M3.4 9.8h17.2M8.2 3.4v3.6M15.8 3.4v3.6" />
    </svg>
  );
}

/** A peak: the highest of whatever is being compared. */
export function PeakMark() {
  return (
    <svg {...MARK}>
      <path d="M3.4 18.6 9 9l3.6 4.4L20.6 4" />
      <path d="M15.4 4h5.2v5.2" />
    </svg>
  );
}
