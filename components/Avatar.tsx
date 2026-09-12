/**
 * A person's picture, or the first letters of their name when they have none.
 *
 * Shared between the reader's own profile and the admin area's lists so the
 * same account is recognisable in both. Not `next/image`: the source is a
 * `data:` URL held on the user document, already cropped and shrunk to a
 * couple of hundred pixels before it was sent, so there is nothing for an
 * optimiser to fetch or resize.
 */
export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export default function Avatar({
  src,
  name,
  size,
}: {
  src: string;
  name: string;
  size: number;
}) {
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      className="flex items-center justify-center rounded-full bg-brand text-white font-bold shrink-0"
    >
      {initials(name)}
    </div>
  );
}
