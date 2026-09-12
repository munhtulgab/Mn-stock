export function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 10.5V7.5a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5 7 7 5.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 4v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 11 4.5 4.5L16.5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8 6.3 6.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 8l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M14.5 5.5 18.5 9.5M4 20l.9-3.9 10-10a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8l-10 10L4 20Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EyeIcon({ off, size = 18 }: { off?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      {off && (
        <path d="M4 4 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * Icons below take an optional size so the same glyph can sit in a 14px
 * button label and a 24px toast disc without a second copy.
 */
type IconProps = { size?: number };

export function CheckIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 7v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function InfoIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 11v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function CloseIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="m6.5 6.5 11 11m0-11-11 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SparkIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M18 16.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" fill="currentColor" />
    </svg>
  );
}

export function RefreshIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M20 12a8 8 0 1 1-2.6-5.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SaveIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 5.5A1.5 1.5 0 0 1 6.5 4H16l3 3v11.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.5 4v5h6V4M8 15.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5.5 7h13M9.5 7V5.5h5V7M7 7l.8 12.1A1.5 1.5 0 0 0 9.3 20.5h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SendIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M20 4 3.5 10.5l6.5 2.5 2.5 6.5L20 4Zm0 0-10 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowUpIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 19V6m0 0-5.5 5.5M12 6l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v13m0 0 5.5-5.5M12 18l-5.5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LoginIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M14 4h3.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M10 8.5 13.5 12 10 15.5M13 12H4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserPlusIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 20c1.1-3.4 3.6-5.2 6.5-5.2 1 0 2 .2 2.8.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.5 14v6M14.5 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function BookmarkIcon({ size = 18, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NewsIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 5.5h13v13a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M17 9h2.5A1.5 1.5 0 0 1 21 10.5v8a1.5 1.5 0 0 1-1.5 1.5H17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 9h7M7 12.5h7M7 16h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   Background marks for the portfolio card.

   Watermarks rather than icons: they carry no meaning the text does not
   already state, so they are `aria-hidden` and drawn from `currentColor` at
   whatever opacity the caller sets.

   The two animals are traced from the silhouettes the operator supplied
   rather than drawn here, so they are one path each with `evenodd` filling —
   which is what keeps the gap the bull's tucked foreleg leaves open rather
   than filling it in. `scripts/traceSilhouette.py` is what produced them.

   Each is anchored to the side of the box it is meant to be pinned against:
   the bull left, the bear right. Without that, a box wider than the animal
   centres it and leaves a margin against the edge — which is the one thing
   these two are not allowed to have, since the card's whole arrangement is
   them pushed out to its two ends.
   ------------------------------------------------------------------------- */

/**
 * The two silhouettes, and the light on them.
 *
 * Each animal is one traced outline — the operator's own image, walked pixel
 * by pixel and simplified until it was short enough to inline, rendering
 * within about 4% (IoU 0.95) of the original. The outline is held apart from
 * the component because it is now drawn several times over: the shape is the
 * expensive part of the file and there is no reason to repeat it.
 *
 * Flat before this, and a flat silhouette on a flat card is a sticker. It is
 * given depth the way a solid is: the same outline stepped back and down
 * three times behind the face, which is the wall of the extrusion, then a
 * light laid across the face from the top-left. The steps carry no highlight
 * of their own — they are the same ink at falling strength, which is what a
 * receding surface does.
 *
 * `DEPTH` is in the marks' own units, which are hundredths of the width, so
 * the extrusion is a fixed proportion of the animal at every size rather than
 * a number of pixels that would be a slab on a laptop and invisible on a
 * phone. Each viewBox is that much larger than its drawing on the right and
 * the bottom, so the wall has somewhere to go — without it the far side is
 * cut off square by the edge of the box.
 */
const DEPTH = 0.9;
const STEPS = [3, 2, 1];

/** How much of the ink each step of the wall keeps, nearest the face first. */
const WALL = [0.72, 0.5, 0.3];

const BULL_PATH =
  "M3.7 0.0L4.3 0.3L5.2 2.0L5.2 4.2L5.7 5.2L6.0 5.5L6.4 4.9L6.4 6.6L5.6 7.6L5.5 10.0L3.4 12.9L2.5 13.4L2.4 13.9L3.3 15.7L5.8 18.2L7.2 19.1L9.7 19.9L15.8 19.5L18.5 20.3L20.6 20.3L22.8 19.1L24.1 18.7L25.3 18.7L26.0 18.3L34.5 18.3L42.7 14.0L43.8 13.9L45.9 12.8L46.6 12.7L51.8 10.0L55.9 8.8L57.3 8.7L57.9 8.4L62.8 8.4L63.5 8.8L66.5 9.2L71.8 11.1L75.6 11.6L78.8 12.8L80.2 13.7L83.2 16.7L85.6 17.2L87.0 17.9L87.9 17.9L88.6 17.5L90.3 17.5L91.6 18.0L94.1 19.2L99.0 22.9L99.5 23.4L99.3 23.5L91.9 20.3L89.8 20.3L89.4 20.6L89.2 22.2L89.6 22.9L89.4 26.4L90.8 27.8L92.5 28.7L93.8 29.1L95.9 29.1L95.1 29.5L91.0 29.5L87.9 28.4L86.9 30.0L86.9 32.9L86.1 35.2L86.0 37.0L85.7 37.4L85.2 37.2L83.7 38.1L80.5 37.4L79.7 36.3L77.2 35.8L75.4 33.6L73.3 32.3L72.8 32.4L69.9 35.7L67.6 39.2L65.0 41.9L64.9 43.0L63.7 45.6L63.7 49.3L63.3 50.0L63.3 52.0L62.6 52.9L61.6 53.4L59.1 53.0L55.6 54.6L50.0 54.2L49.3 53.8L47.2 53.8L46.4 53.4L44.6 54.6L43.8 54.7L42.6 55.8L41.4 55.9L40.2 56.9L39.1 56.9L38.7 56.6L39.0 56.0L39.0 54.7L39.9 52.5L41.4 51.1L43.0 51.0L43.8 50.3L45.6 50.8L47.8 48.2L48.6 44.3L46.9 42.2L44.9 43.0L42.0 43.0L41.3 43.4L37.2 43.4L34.6 42.3L33.9 42.3L32.9 42.8L30.8 44.9L29.3 48.0L27.3 49.2L25.6 50.9L28.0 55.1L33.8 61.4L33.8 62.1L33.0 62.5L30.4 62.5L28.2 61.7L27.6 61.0L26.7 58.4L27.0 57.3L26.6 56.5L25.5 55.7L24.6 53.7L23.4 52.0L22.0 51.0L23.5 46.4L22.9 45.6L20.9 44.2L17.8 46.0L16.0 48.1L14.6 48.6L12.1 48.6L11.6 49.0L11.2 50.0L11.2 51.2L11.6 51.9L11.6 55.2L11.3 55.8L13.9 60.6L14.3 62.4L13.0 62.9L10.1 62.9L9.2 62.5L8.0 59.2L8.0 58.6L9.2 56.4L9.2 55.5L8.8 54.8L8.8 52.3L9.2 51.6L9.2 50.0L8.4 48.0L8.9 46.9L10.3 45.5L11.2 43.7L11.2 41.6L10.8 40.9L10.8 33.6L12.4 29.8L17.0 23.5L16.0 22.4L14.3 21.5L10.1 21.5L9.5 21.1L8.4 21.1L4.7 19.0L2.9 17.2L1.6 14.3L1.6 13.2L0.0 10.7L0.0 8.5L0.5 7.4L2.3 5.6L2.4 4.9L2.1 4.4L3.0 4.8L3.6 4.3L3.6 3.6L2.9 2.9L3.2 3.1L3.6 2.5L2.9 1.6L3.6 1.3L4.2 2.2L4.8 1.9L4.7 1.1L3.7 0.0ZM53.5 47.0L54.4 47.0L55.1 47.4L56.6 47.1L58.1 48.6L58.2 49.5L59.3 50.6L59.2 51.0L56.6 51.4L55.9 51.0L54.7 49.6L53.9 49.8L51.9 49.0L53.4 47.0Z";

const BEAR_PATH =
  "M26.2 0.0L26.9 0.1L26.9 1.3L27.5 1.8L29.9 1.8L32.0 0.9L33.9 0.9L34.6 1.8L37.6 1.8L38.1 2.6L39.4 2.7L41.8 4.5L43.9 5.0L47.1 6.7L51.5 7.7L58.4 10.8L59.8 11.8L63.1 15.1L63.7 17.9L64.9 20.1L64.7 21.1L67.5 24.0L69.7 27.5L73.4 31.2L76.0 35.1L83.3 42.1L83.1 42.7L83.4 43.2L83.4 44.7L84.3 46.2L84.8 47.7L84.8 49.2L85.2 49.9L85.2 50.6L84.7 50.3L84.3 50.8L84.3 55.0L84.8 55.9L83.9 56.6L83.9 58.1L83.4 58.9L83.9 64.5L85.6 66.3L87.0 68.7L86.6 70.3L89.1 74.4L88.9 74.9L90.2 79.4L90.6 79.8L92.2 79.8L93.3 80.4L94.9 81.9L95.7 82.2L96.8 83.4L97.8 86.2L99.5 88.4L99.6 90.4L99.0 91.5L96.8 93.2L94.3 93.3L91.3 94.6L89.0 94.6L87.8 93.8L86.2 93.4L85.7 93.6L85.4 93.0L84.8 93.1L84.8 91.6L86.8 90.3L87.0 89.9L86.6 89.3L85.1 89.6L83.5 89.2L81.6 88.3L80.1 87.3L79.7 86.4L77.3 84.0L76.5 84.1L75.5 82.7L74.5 82.9L72.7 81.3L72.1 81.5L71.5 81.2L70.6 81.6L69.0 80.7L66.4 80.2L65.3 79.7L62.6 77.1L59.8 77.1L59.2 77.5L58.7 77.2L58.2 78.0L55.8 78.0L55.0 78.5L52.4 77.7L51.5 79.3L51.1 79.0L50.7 79.4L51.1 80.5L50.2 83.6L50.7 84.6L49.0 87.3L45.9 87.4L44.7 88.3L40.9 88.3L40.5 87.6L39.9 87.8L39.6 87.2L38.7 86.7L39.1 85.6L42.1 84.4L42.8 84.6L44.8 82.3L44.8 80.9L44.4 79.4L43.6 78.5L43.5 77.6L41.3 73.4L41.3 72.3L42.2 70.7L41.8 69.9L43.9 67.8L45.2 65.1L45.0 64.4L46.5 62.9L46.4 62.2L47.9 60.6L45.5 58.0L45.1 57.2L44.0 56.6L43.5 54.8L42.0 52.3L41.2 51.7L40.8 52.4L40.3 51.1L39.7 50.7L35.6 50.7L32.6 51.6L31.2 51.1L30.0 51.5L28.6 50.8L26.4 52.0L22.9 52.5L21.9 53.3L19.8 53.4L19.2 54.6L18.4 53.9L17.6 53.8L17.2 52.6L16.6 52.8L16.7 52.0L18.3 49.9L23.5 47.4L24.6 45.7L22.4 44.4L19.0 44.4L17.3 43.5L16.5 43.6L13.5 46.1L11.9 46.6L10.5 46.6L8.5 45.8L7.3 45.7L5.3 47.1L3.5 47.2L2.7 48.3L1.7 47.1L1.2 47.3L0.9 47.9L0.6 46.4L0.3 46.4L0.0 47.0L0.0 46.2L1.4 44.0L2.9 43.3L5.2 40.5L7.8 38.8L10.6 35.6L14.4 33.7L17.0 33.2L19.3 31.9L20.1 31.8L24.3 30.0L28.1 25.7L28.0 25.3L27.4 25.1L23.7 27.3L21.6 27.4L18.8 29.1L17.7 29.1L16.7 28.7L16.7 27.7L18.4 26.4L18.5 24.6L21.4 20.9L20.2 19.8L19.1 19.3L15.3 19.8L13.8 20.3L13.4 21.0L12.9 20.7L12.3 21.1L10.8 20.6L9.9 20.2L9.4 19.2L9.4 17.7L9.9 16.8L9.0 15.1L9.1 14.4L11.3 13.4L12.1 12.6L17.7 10.1L18.4 7.2L19.5 5.7L21.7 4.3L23.0 2.2L24.0 1.1L26.1 0.0Z";

/**
 * The light. Bright at the top-left corner of the shape, gone by the middle,
 * and turning to shadow at the bottom-right — one diagonal, the same on both
 * animals, so the two are lit by the same sun.
 *
 * `objectBoundingBox` is the default for a gradient's coordinates, so one
 * definition per animal is measured against that animal's own outline; the
 * bull being twice as wide as it is tall does not stretch the light across it
 * differently than the bear's.
 */
function MarkLight({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0.1" y1="0" x2="0.8" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
      <stop offset="0.35" stopColor="#fff" stopOpacity="0.22" />
      <stop offset="0.6" stopColor="#000" stopOpacity="0.06" />
      <stop offset="1" stopColor="#000" stopOpacity="0.5" />
    </linearGradient>
  );
}

/** The wall of the extrusion: the outline behind itself, stepping away. */
function MarkWall({ d }: { d: string }) {
  return (
    <g fill="currentColor">
      {STEPS.map((step, i) => (
        <path key={step} d={d} opacity={WALL[i]} transform={`translate(${step * DEPTH} ${step * DEPTH})`} />
      ))}
    </g>
  );
}

/** The bull, charging. */
export function BullMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${100 + 3 * DEPTH} ${63.3 + 3 * DEPTH}`}
      preserveAspectRatio="xMinYMid meet"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
    >
      <defs>
        <MarkLight id="bull-light" />
      </defs>
      <MarkWall d={BULL_PATH} />
      <path d={BULL_PATH} />
      <path d={BULL_PATH} fill="url(#bull-light)" />
    </svg>
  );
}

/** The bear, reared up: the operator's second silhouette, traced the same way. */
export function BearMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${100 + 3 * DEPTH} ${95.1 + 3 * DEPTH}`}
      preserveAspectRatio="xMaxYMid meet"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
    >
      <defs>
        <MarkLight id="bear-light" />
      </defs>
      <MarkWall d={BEAR_PATH} />
      <path d={BEAR_PATH} />
      <path d={BEAR_PATH} fill="url(#bear-light)" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   The chart the two of them are arguing about.

   Four rounded bars before this, which read as an icon of a chart rather than
   as one. It is a run of sessions now — open, close, high and low apiece, on
   a rising trend, the shape of the picture the card is meant to carry.

   Not in red and green. At the strength a watermark is drawn on a card that
   is itself bright green, a red body comes out as a warm tint of that green
   and a green body comes out as the card; the colour that separates a rising
   session from a falling one would be the one thing lost. Light against dark
   does the same job and survives the opacity: a session that closed up is
   drawn in the card's own light, one that closed down in its ink.
   ------------------------------------------------------------------------- */

/** One session's share of the width, and what the body and wick take of it. */
const PITCH = 10;
const BODY = 6;
const WICK = 1.5;
/** A session that opened and closed at the same price still has to be drawn. */
const MIN_BODY = 1.4;
const CHART_HEIGHT = 100;

/**
 * Open, close, high and low, each as a percentage of the box's height.
 *
 * A fixed series rather than the reader's own: this is the back of a card,
 * and a watermark that moved with the market would be a second chart to read
 * — and a wrong one, since it is one company's shape standing for the idea of
 * a market. Twenty of the twenty-six close up, which is what makes the run
 * climb.
 */
const SESSIONS: readonly (readonly [number, number, number, number])[] = [
  [0.8, 2.4, 4.3, 0.0],
  [2.4, 3.7, 7.1, 1.7],
  [3.7, 12.2, 13.7, 0.0],
  [12.2, 16.3, 17.7, 11.5],
  [16.3, 10.8, 19.4, 9.0],
  [10.8, 16.2, 22.2, 4.5],
  [16.2, 14.6, 17.8, 13.5],
  [14.6, 17.2, 19.1, 12.3],
  [17.2, 21.6, 23.0, 14.8],
  [21.6, 33.1, 35.1, 17.3],
  [33.1, 32.9, 35.8, 31.6],
  [32.9, 35.2, 37.5, 32.0],
  [35.2, 35.8, 39.3, 33.3],
  [35.8, 44.8, 47.7, 35.0],
  [44.8, 49.8, 55.2, 44.7],
  [49.8, 59.3, 66.5, 48.7],
  [59.3, 61.6, 64.5, 57.5],
  [61.6, 64.2, 69.4, 58.6],
  [64.2, 70.4, 73.8, 59.0],
  [70.4, 75.1, 75.5, 65.7],
  [75.1, 81.0, 83.2, 73.5],
  [81.0, 77.6, 84.5, 75.7],
  [77.6, 86.9, 94.2, 72.3],
  [86.9, 91.0, 96.1, 84.8],
  [91.0, 84.3, 100.0, 83.0],
  [84.3, 83.5, 88.3, 80.0],
];

export function CandlesMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SESSIONS.length * PITCH} ${CHART_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      {SESSIONS.map(([open, close, high, low], i) => {
        // The figures count up from the bottom, the way a price does; the box
        // counts down from the top, the way a screen does.
        const y = (value: number) => CHART_HEIGHT - value;
        const rising = close >= open;
        const left = i * PITCH;
        return (
          <g
            key={i}
            fill={rising ? "#fff" : "currentColor"}
            opacity={rising ? 0.95 : 0.8}
          >
            <rect
              x={left + (PITCH - WICK) / 2}
              y={y(high)}
              width={WICK}
              height={y(low) - y(high)}
            />
            <rect
              x={left + (PITCH - BODY) / 2}
              y={Math.min(y(open), y(close))}
              width={BODY}
              height={Math.max(Math.abs(y(close) - y(open)), MIN_BODY)}
              rx={0.7}
            />
          </g>
        );
      })}
    </svg>
  );
}
