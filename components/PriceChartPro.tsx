"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { aggregate, type Candle, type Timeframe } from "@/lib/analysis/series";
import { buildPlotRows, type PlotRow } from "@/lib/analysis/plot";
import { alignByDate, type GoldPoint } from "@/lib/gold";
import { goldCandles } from "@/lib/analysis/goldBasis";

/**
 * The price, drawn as candles or as a line, with the whole technical
 * analysis over and under it.
 *
 * Everything the scorecard reports can be shown here, from the same
 * arithmetic — the moving averages and the Bollinger bands laid over the
 * price, and the eight oscillators in their own panes beneath it, each
 * sharing the price's x-axis so a crossing lines up with the bar that caused
 * it. Every indicator is a chip that turns it on and off, because a chart
 * with fourteen things on it at once is a chart nobody can read.
 */

/*
 * Taken from the theme rather than named here.
 *
 * SVG attributes read custom properties like any other, so the chart follows
 * whichever palette is in force. Written out as hex, the price line was white
 * — which on a white card in daylight is a chart with no chart in it.
 */
const UP = "var(--app-positive)";
const DOWN = "var(--app-negative)";
const GRID = "var(--app-divider)";
const AXIS = "var(--app-muted)";
const INK = "var(--app-text)";
const Y_GUTTER = 46;

/** Beyond this the bars are narrower than a pixel; step the interval up. */
const MAX_BARS = 400;

/**
 * A row of chips that scrolls rather than wraps.
 *
 * Six moving averages and nine panes do not fit a phone, and wrapping them
 * costs a line of height that changes with the screen — so the row keeps its
 * height and the finger moves along it. The scrollbar is hidden because on a
 * touch screen it is only a grey line taking a pixel from the chips.
 */
const ROW_SCROLL =
  "-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

type ChartType = "candle" | "line" | "gold";

/**
 * The views on offer, which depend on what the listing is.
 *
 * A company is its own price: a candle chart and a line of it, and the metal
 * has nothing to do with it. A gold tracker is the metal: one view, and it is
 * gold. Neither list is a subset of the other on the screen — Алт is not
 * offered where it means nothing, and Лаа is not offered where it would draw
 * eleven weeks of a seventeen-year story.
 */
const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "candle", label: "Лаа" },
  { key: "line", label: "График" },
];

const GOLD_TYPES: { key: ChartType; label: string }[] = [{ key: "gold", label: "Алт" }];

/**
 * Mongolbank's buying price for gold, over the price itself.
 *
 * A view rather than an overlay chip, because it is not an indicator derived
 * from this security — it is a second instrument, and putting it among the
 * moving averages would say it was one of them. The price line stays under
 * it: gold on its own is a chart of gold, and what is being asked is how
 * this listing has moved against it.
 *
 * The bank quotes a gram, which is around half a million tögrög; a hundredth
 * of a gram lands in the range a share price lives in, which is what lets
 * the two shapes be compared on one axis.
 */
const GOLD = "#e0a80d";
const GOLD_LABEL = "Алт (авах ÷100)";

/**
 * `days` is null for the whole stored history. `timeframe` is where the
 * candle interval starts for that range; it steps up on its own if the
 * window still holds too many bars to tell apart.
 */
const RANGES: { label: string; days: number | null; timeframe: Timeframe }[] = [
  { label: "Бүх цаг үе", days: null, timeframe: "1M" },
  { label: "10 жил", days: 3653, timeframe: "1M" },
  { label: "5 жил", days: 1826, timeframe: "1W" },
  { label: "3 жил", days: 1095, timeframe: "1W" },
  { label: "1 жил", days: 365, timeframe: "1D" },
  { label: "6 сар", days: 182, timeframe: "1D" },
  { label: "3 сар", days: 92, timeframe: "1D" },
  { label: "1 сар", days: 30, timeframe: "1D" },
  { label: "7 хоног", days: 7, timeframe: "1D" },
];

/** Opens on five years: long enough to show a cycle, short enough to read. */
const DEFAULT_RANGE = RANGES.findIndex((r) => r.label === "5 жил");

/** Everything there is, which is what the gold view opens on. */
const WHOLE_HISTORY = RANGES.findIndex((r) => r.days === null);

const INTERVAL_LABELS: Record<Timeframe, string> = {
  "1D": "өдрийн",
  "1W": "долоо хоногийн",
  "1M": "сарын",
};

/** Laid over the price itself. */
const OVERLAYS: { key: string; label: string; colour: string; fields: (keyof PlotRow)[] }[] = [
  { key: "ma5", label: "MA5", colour: "#7dd3fc", fields: ["ma5"] },
  { key: "ma10", label: "MA10", colour: "#a78bfa", fields: ["ma10"] },
  { key: "ma20", label: "MA20", colour: "#00d16c", fields: ["ma20"] },
  { key: "ma50", label: "MA50", colour: "#ffb020", fields: ["ma50"] },
  { key: "ma100", label: "MA100", colour: "#f472b6", fields: ["ma100"] },
  { key: "ma200", label: "MA200", colour: "#60a5fa", fields: ["ma200"] },
  {
    key: "bb",
    label: "Bollinger",
    colour: "#8b90a0",
    fields: ["bbUpper", "bbMiddle", "bbLower"],
  },
];

/** Drawn in their own pane under the price. */
type PaneKey = "volume" | "rsi" | "macd" | "stoch" | "adx" | "atr" | "obv" | "roc";

const PANES: { key: PaneKey; label: string }[] = [
  { key: "volume", label: "Арилжаа" },
  { key: "rsi", label: "RSI(14)" },
  { key: "macd", label: "MACD" },
  { key: "stoch", label: "Stochastic" },
  { key: "adx", label: "ADX(14)" },
  { key: "atr", label: "ATR(14)" },
  { key: "obv", label: "OBV" },
  { key: "roc", label: "ROC(12)" },
];

/**
 * What is on when the card first opens.
 *
 * The two averages every chart carries, the bands, and the three panes that
 * answer the questions people actually arrive with — how much traded, is it
 * overbought, has the trend turned. The rest is one tap away rather than
 * stacked on by default, because all eight panes at once is a page and a
 * half of chart before the reader has asked for anything.
 */
/**
 * Nothing, on either row.
 *
 * The chart opened carrying two moving averages, the bands and three panes —
 * six lines over a price somebody had come to look at, and a page and a half
 * of oscillator under it. Every one of them is a question worth asking and
 * none of them had been asked. They are a tap away instead.
 */
const DEFAULT_OVERLAYS: string[] = [];
const DEFAULT_PANES: PaneKey[] = [];

function shortNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}тэрбум`;
  if (magnitude >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}сая`;
  }
  if (magnitude >= 10_000) return `${(value / 1_000).toFixed(0)}мя`;
  return value.toFixed(magnitude < 10 && value % 1 !== 0 ? 1 : 0);
}

/** A wick from low to high with the open-to-close body drawn on it. */
/** A swatch and a name: which mark on the chart is which. */
function Key({
  colour,
  square,
  children,
}: {
  colour?: string;
  /** Candles are a body, not a line, so the mark is a block. */
  square?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={square ? "h-2.5 w-1.5 rounded-[1px]" : "h-0.5 w-4 rounded-full"}
        style={{ backgroundColor: colour ?? UP }}
      />
      {children}
    </span>
  );
}

function CandleShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: PlotRow;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;

  const { open, close, high, low } = payload;
  const span = high - low;
  const at = (price: number) =>
    span === 0 ? y + height / 2 : y + ((high - price) / span) * height;

  const rising = close >= open;
  const colour = rising ? UP : DOWN;
  // A session that opened, closed, peaked and bottomed at one price — most
  // sessions for most of this market — would otherwise draw nothing.
  const bodyHeight = Math.max(1, Math.abs(at(close) - at(open)));
  const bodyWidth = Math.max(1, width * 0.7);
  const centre = x + width / 2;

  return (
    <g>
      <line x1={centre} x2={centre} y1={y} y2={y + height} stroke={colour} strokeWidth={1} />
      <rect
        x={x + (width - bodyWidth) / 2}
        y={at(Math.max(open, close))}
        width={bodyWidth}
        height={bodyHeight}
        fill={rising ? "transparent" : colour}
        stroke={colour}
        strokeWidth={1}
      />
    </g>
  );
}

function Chip({
  active,
  onClick,
  children,
  colour,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  colour?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
        active
          ? "bg-brand text-black"
          : "bg-app-bg text-app-muted border border-app-border"
      }`}
    >
      {colour && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: active ? "#000" : colour }}
        />
      )}
      {children}
    </button>
  );
}

/** Shared axis settings, so every pane lines up with the price above it. */
const xAxis = {
  dataKey: "date",
  tick: { fontSize: 10, fill: AXIS },
  minTickGap: 40,
  axisLine: { stroke: GRID },
  tickLine: { stroke: GRID },
};

const tooltip = {
  contentStyle: {
    background: "var(--app-card)",
    border: `1px solid ${GRID}`,
    borderRadius: 12,
    fontSize: 11,
  },
  labelStyle: { color: INK, fontWeight: 600 },
};

function Pane({
  pane,
  rows,
}: {
  pane: PaneKey;
  rows: PlotRow[];
}) {
  const common = (
    <>
      <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
      <XAxis {...xAxis} hide />
      <Tooltip
        {...tooltip}
        formatter={(value) =>
          typeof value === "number" ? value.toLocaleString("mn-MN", { maximumFractionDigits: 2 }) : String(value)
        }
      />
    </>
  );

  const yAxis = (extra: Record<string, unknown> = {}) => (
    <YAxis
      tick={{ fontSize: 9, fill: AXIS }}
      width={Y_GUTTER}
      tickMargin={4}
      tickFormatter={shortNumber}
      axisLine={{ stroke: GRID }}
      tickLine={{ stroke: GRID }}
      {...extra}
    />
  );

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: Y_GUTTER, bottom: 0, left: 0 }}>
          {common}
          {pane === "volume" && (
            <>
              {yAxis()}
              <Bar dataKey="volume" isAnimationActive={false} name="Хэмжээ">
                {rows.map((row, i) => (
                  <Cell key={i} fill={row.rising ? UP : DOWN} fillOpacity={0.55} />
                ))}
              </Bar>
            </>
          )}

          {pane === "rsi" && (
            <>
              {yAxis({ domain: [0, 100], ticks: [30, 50, 70] })}
              {/* The levels the verdict is read against, drawn so the line
                  crossing them means the same thing on the chart as it does
                  on the scorecard. */}
              <ReferenceLine y={70} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={30} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="RSI" />
            </>
          )}

          {pane === "macd" && (
            <>
              {yAxis()}
              <ReferenceLine y={0} stroke={GRID} />
              <Bar dataKey="macdHistogram" isAnimationActive={false} name="Гистограм">
                {rows.map((row, i) => (
                  <Cell key={i} fill={(row.macdHistogram ?? 0) >= 0 ? UP : DOWN} fillOpacity={0.5} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="macd" stroke="#60a5fa" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="MACD" />
              <Line type="monotone" dataKey="macdSignal" stroke="#ffb020" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="Дохио" />
            </>
          )}

          {pane === "stoch" && (
            <>
              {yAxis({ domain: [0, 100], ticks: [20, 50, 80] })}
              <ReferenceLine y={80} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={20} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="stochK" stroke="#7dd3fc" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="%K" />
              <Line type="monotone" dataKey="stochD" stroke="#f472b6" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="%D" />
            </>
          )}

          {pane === "adx" && (
            <>
              {yAxis({ domain: [0, "auto"] })}
              {/* Below 20 the ADX says there is no trend to be with. */}
              <ReferenceLine y={20} stroke={AXIS} strokeDasharray="3 3" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="adx" stroke={INK} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls name="ADX" />
              <Line type="monotone" dataKey="plusDi" stroke={UP} strokeWidth={1} dot={false} isAnimationActive={false} connectNulls name="+DI" />
              <Line type="monotone" dataKey="minusDi" stroke={DOWN} strokeWidth={1} dot={false} isAnimationActive={false} connectNulls name="−DI" />
            </>
          )}

          {pane === "atr" && (
            <>
              {yAxis()}
              <Area type="monotone" dataKey="atr" stroke="#ffb020" fill="#ffb020" fillOpacity={0.15} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="ATR" />
            </>
          )}

          {pane === "obv" && (
            <>
              {yAxis()}
              <Line type="monotone" dataKey="obv" stroke="#7dd3fc" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="OBV" />
            </>
          )}

          {pane === "roc" && (
            <>
              {yAxis()}
              <ReferenceLine y={0} stroke={GRID} />
              <Line type="monotone" dataKey="roc" stroke="#a78bfa" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls name="ROC" />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PriceChartPro({
  candles,
  symbol,
  goldOnly = false,
}: {
  candles: Candle[];
  /** Needed only to fetch the rest of the history for the whole-life range. */
  symbol: string;
  /**
   * Which chart this listing has.
   *
   * A gold tracker three months old has a candle chart of seventy-seven bars
   * and a line chart of the same, and neither is what the page is opened to
   * see: there the one view is the metal, and it opens on the whole of it.
   * Everywhere else the metal is not on the page at all — a brewer's price
   * has nothing to do with the gold price, and a chip offering to draw it
   * beside APU was a question nobody had asked.
   */
  goldOnly?: boolean;
}) {
  // Opens on the line and on five years, as asked — or on the metal and all
  // of it, where the listing is the metal.
  const [type, setType] = useState<ChartType>(goldOnly ? "gold" : "line");
  const [rangeIndex, setRangeIndex] = useState(goldOnly ? WHOLE_HISTORY : DEFAULT_RANGE);
  const [overlays, setOverlays] = useState<string[]>(DEFAULT_OVERLAYS);
  const [panes, setPanes] = useState<PaneKey[]>(DEFAULT_PANES);
  /** The full stored series, once somebody has asked to see all of it. */
  const [everything, setEverything] = useState<Candle[] | null>(null);
  /** The gold series, once somebody has asked to see it. */
  const [gold, setGold] = useState<GoldPoint[] | null>(null);
  /** True once the metal has been asked for and did not answer. */
  const [goldFailed, setGoldFailed] = useState(false);

  const range = RANGES[rangeIndex];

  // The page is sent with twelve years, which is what the scorecards need.
  // "Бүх цаг үе" means more than that for anything listed longer ago, so the
  // rest is fetched the first time that range is picked — and kept, so
  // moving off it and back does not ask again.
  useEffect(() => {
    if (range.days !== null || everything) return;
    let cancelled = false;
    fetch(`/api/securities/${symbol}/candles`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled && Array.isArray(data.candles) && data.candles.length > 0) {
          setEverything(data.candles as Candle[]);
        }
      })
      // The twelve years already on the page are a reasonable answer to fall
      // back on, and saying so louder than that helps nobody.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [range.days, everything, symbol]);

  // Asked for the first time the gold view is picked, and kept: it is one
  // series for the whole app and it moves once a working day.
  useEffect(() => {
    if (type !== "gold" || gold) return;
    let cancelled = false;
    fetch("/api/gold")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.prices) && data.prices.length > 0) {
          setGold(data.prices as GoldPoint[]);
        } else {
          setGoldFailed(true);
        }
      })
      // Quietly on a chart that has a price of its own to fall back on; on a
      // listing where the metal is the whole chart the reader is told, because
      // there the fallback is a stub of a series and looks like the answer.
      .catch(() => {
        if (!cancelled) setGoldFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [type, gold]);

  const { rows, timeframe } = useMemo(() => {
    // Whichever is longer. The stored series ends at the last close, while
    // the page's own candles may carry today's live bar on the end, so the
    // two are joined rather than swapped.
    const own =
      range.days === null && everything
        ? [...everything, ...candles.filter((c) => c.date > (everything.at(-1)?.date ?? ""))]
        : candles;

    // In the gold view the metal is the chart, and the listing is drawn on
    // it. That is the whole reason for the view: ALTT has traded since May
    // 2026 and gold has been quoted since January 2009, and a chart of the
    // metal that begins where the fund listed shows three months of a
    // seventeen-year series. So the spine — the dates, the range chips, the
    // bar interval, the averages laid over it — is gold's, and the fund's
    // own closes are attached to it where they exist.
    const onGold = type === "gold" && gold !== null && gold.length > 0;
    const source = onGold ? goldCandles(gold) : own;

    let windowed = source;
    if (range.days !== null) {
      const from = new Date();
      from.setUTCDate(from.getUTCDate() - range.days);
      const key = from.toISOString().slice(0, 10);
      const inRange = source.filter((c) => c.date >= key);
      // A thinly traded listing can have almost nothing inside a short
      // window; its last few dozen prints beat an empty box.
      windowed = inRange.length >= 5 ? inRange : source.slice(-60);
    }

    const order: Timeframe[] = ["1D", "1W", "1M"];
    let chosen: Timeframe = range.timeframe;
    let bars = aggregate(windowed, chosen);
    for (let i = order.indexOf(chosen) + 1; i < order.length && bars.length > MAX_BARS; i++) {
      chosen = order[i];
      bars = aggregate(windowed, chosen);
    }

    // Indicators are computed on the interval being drawn, so a weekly chart
    // shows weekly averages — the same figures the scorecard reports when it
    // is set to the same interval. On the gold spine they are the metal's,
    // which is what the panels under this chart report too.
    const plot = buildPlotRows(bars);
    if (!onGold) return { rows: plot, timeframe: chosen };

    // `close` is the spine's, so on the gold spine it is the metal's. It
    // moves to `gold`, and `close` is emptied before the listing's own is
    // joined on — left in place it would still hold the metal's price for
    // every bar before the fund existed, and the fund's line would be drawn
    // over seventeen years of gold pretending to be ALTT.
    const spine = plot.map(({ close, ...rest }) => ({ ...rest, gold: close }));
    const withFund = alignByDate(
      spine,
      own.map((c) => ({ date: c.date, price: c.close })),
      "close",
    );
    // The rows carry every field a pane reads; `close` is the one that may be
    // absent, and recharts draws a gap where a key is missing — which is what
    // a fund that had not listed yet should look like.
    return { rows: withFund as unknown as PlotRow[], timeframe: chosen };
  }, [candles, everything, range, type, gold]);

  const toggle = <T extends string>(list: T[], key: T, set: (next: T[]) => void) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  if (rows.length === 0) {
    return <p className="text-xs text-app-muted">Арилжааны түүх алга.</p>;
  }

  // On a metal listing, wait for the metal rather than flashing up the
  // listing's own three months and redrawing a second later.
  if (goldOnly && gold === null && !goldFailed) {
    return (
      <div>
        <h2 className="mb-2 truncate text-sm font-semibold text-app-text">График</h2>
        <div className="flex h-72 w-full items-center justify-center rounded-xl border border-dashed border-app-border">
          <span className="text-xs text-app-muted">Алтны ханш ачаалж байна…</span>
        </div>
      </div>
    );
  }

  const priceRows = rows;

  return (
    <div>
      {/* The chart's own name, and what kind of chart it is. */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-app-text truncate">График</h2>
        <div className="flex items-center gap-1 shrink-0">
          {(goldOnly ? GOLD_TYPES : CHART_TYPES).map((option) => (
            <Chip
              key={option.key}
              active={option.key === type}
              onClick={() => setType(option.key)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* How far back, on its own line so eight ranges do not crowd the
          title on a phone. It scrolls rather than wrapping to two rows. */}
      <div className={`mb-2 ${ROW_SCROLL}`}>
        {RANGES.map((option, i) => (
          <span key={option.label} className="shrink-0">
            <Chip active={i === rangeIndex} onClick={() => setRangeIndex(i)}>
              {option.label}
            </Chip>
          </span>
        ))}
      </div>

      <p className="text-[10px] text-app-muted mb-2">
        {rows.length.toLocaleString("mn-MN")} {INTERVAL_LABELS[timeframe]} үе ·{" "}
        {rows[0].date} – {rows[rows.length - 1].date}
      </p>

      {/* The price, with whatever is laid over it. */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={priceRows} margin={{ top: 8, right: Y_GUTTER, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
            <XAxis {...xAxis} />
            <YAxis
              tick={{ fontSize: 10, fill: AXIS }}
              domain={["dataMin", "dataMax"]}
              width={Y_GUTTER}
              tickMargin={4}
              tickFormatter={shortNumber}
              axisLine={{ stroke: GRID }}
              tickLine={{ stroke: GRID }}
            />
            <Tooltip
              {...tooltip}
              formatter={(value, name, item) => {
                // The candle's own four prices, named, rather than the
                // low-to-high pair the body is scaled inside.
                if (name === "Ханш" || name === "range") {
                  const row = item?.payload as PlotRow | undefined;
                  if (!row) return null;
                  const n = (v: number) => v.toLocaleString("mn-MN");
                  return [
                    `Н ${n(row.open)} · Ө ${n(row.high)} · Д ${n(row.low)} · Х ${n(row.close)}`,
                    "Ханш",
                  ];
                }
                return [
                  typeof value === "number"
                    ? value.toLocaleString("mn-MN", { maximumFractionDigits: 2 })
                    : String(value),
                  name,
                ];
              }}
            />

            {/* Gold first, so the listing's own line is drawn over it. The
                two run within a percent or two of each other by design, and
                whichever is painted last is the only one visible where they
                touch — which should be the security whose page this is. */}
            {type === "gold" && (
              <Line
                type="monotone"
                dataKey="gold"
                stroke={GOLD}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
                name={GOLD_LABEL}
              />
            )}

            {type === "candle" ? (
              <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} name="Ханш" />
            ) : (
              <Line
                type="monotone"
                dataKey="close"
                stroke={INK}
                strokeWidth={type === "gold" ? 2 : 1.5}
                dot={false}
                isAnimationActive={false}
                name="Хаалтын ханш"
              />
            )}

            {OVERLAYS.filter((o) => overlays.includes(o.key)).flatMap((overlay) =>
              overlay.fields.map((field) => (
                <Line
                  key={String(field)}
                  type="monotone"
                  dataKey={field as string}
                  stroke={overlay.colour}
                  // The band's middle is its own MA20; drawn thinner so it
                  // does not compete with the average when both are on.
                  strokeWidth={field === "bbMiddle" ? 0.8 : 1}
                  strokeDasharray={overlay.key === "bb" ? "3 3" : undefined}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                  name={overlay.label}
                />
              )),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {goldOnly && goldFailed && (
        <p className="mb-2 text-[10px] text-app-negative">
          Алтны ханш татагдсангүй. Доорх нь сангийн өөрийн арилжааны түүх.
        </p>
      )}

      {/* What the lines are.
          
          The chart drew two of them in the gold view and named neither: the
          reader was left to work out which was the listing they had opened
          and which was the metal. A tooltip says it, but only once the
          pointer is on the line and only for whichever line it is nearest —
          which is no help at all on a phone. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-app-muted">
        <Key colour={type === "candle" ? undefined : INK} square={type === "candle"}>
          {symbol}
          {type === "candle" ? " (лаа)" : " (хаалтын ханш)"}
        </Key>
        {type === "gold" && <Key colour={GOLD}>{GOLD_LABEL}</Key>}
      </div>

      {/* What is laid over the price. One line that scrolls sideways rather
          than two or three that wrap: wrapped rows push the oscillators down
          the page by a different amount on every screen width, and the row
          stops being something the eye can skim along. */}
      <div className={`mt-2 ${ROW_SCROLL}`}>
        {OVERLAYS.map((overlay) => (
          <span key={overlay.key} className="shrink-0">
            <Chip
              active={overlays.includes(overlay.key)}
              colour={overlay.colour}
              onClick={() => toggle(overlays, overlay.key, setOverlays)}
            >
              {overlay.label}
            </Chip>
          </span>
        ))}
      </div>

      {/* The oscillators, each in its own pane under the price. */}
      <div className="mt-3 space-y-2">
        {PANES.filter((pane) => panes.includes(pane.key)).map((pane) => (
          <div key={pane.key}>
            <div className="text-[10px] text-app-muted mb-0.5">{pane.label}</div>
            <Pane pane={pane.key} rows={rows} />
          </div>
        ))}
      </div>

      <div className={`mt-3 ${ROW_SCROLL}`}>
        {PANES.map((pane) => (
          <span key={pane.key} className="shrink-0">
            <Chip
              active={panes.includes(pane.key)}
              onClick={() => toggle(panes, pane.key, setPanes)}
            >
              {pane.label}
            </Chip>
          </span>
        ))}
        <span className="shrink-0">
        <Chip
          active={panes.length === PANES.length}
          onClick={() =>
            setPanes(panes.length === PANES.length ? [] : PANES.map((p) => p.key))
          }
        >
          {panes.length === PANES.length ? "Бүгдийг хаах" : "Бүгд"}
        </Chip>
        </span>
      </div>
    </div>
  );
}
