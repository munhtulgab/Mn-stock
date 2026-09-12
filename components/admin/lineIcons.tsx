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
