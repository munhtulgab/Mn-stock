const PALETTE = [
  "#4C6FFF",
  "#FF6B81",
  "#17C674",
  "#FFA726",
  "#8E63FF",
  "#22C1D6",
  "#F4483D",
  "#2FB8A4",
];

function colorFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function StockAvatar({
  symbol,
  size = 40,
}: {
  symbol: string;
  size?: number;
}) {
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
