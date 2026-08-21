import { hasLogo } from "@/lib/logos";
import { colorFor } from "@/lib/symbolColor";

export default function StockAvatar({
  symbol,
  size = 40,
}: {
  symbol: string;
  size?: number;
}) {
  if (hasLogo(symbol)) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={`/logos/${symbol.toUpperCase()}.png`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="rounded-full object-contain bg-white shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        background: colorFor(symbol),
        fontSize: size * 0.32,
      }}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}
