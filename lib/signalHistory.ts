import type { Db } from "mongodb";
import { getDashboardRows } from "@/lib/data";
import { sendPushToAll } from "@/lib/push";
import type { Signal } from "@/lib/types";

interface SignalHistoryDoc {
  companyCode: number;
  symbol: string;
  signal: Signal;
  updatedAt: Date;
}

export interface SignalChange {
  symbol: string;
  name: string;
  from: Signal | "NEW";
  to: Signal;
}

/**
 * Compares freshly computed recommendations against the last-known signal
 * per company. On the very first run (no history yet) it just seeds the
 * baseline silently — otherwise every company would show up as "changed".
 * Any real BUY/SELL/HOLD transitions found after that are pushed to all
 * subscribed devices as a single summary notification.
 */
export async function checkSignalChangesAndNotify(
  db: Db,
): Promise<{ changes: SignalChange[]; notified: boolean }> {
  const rows = await getDashboardRows(db);
  const priced = rows.filter((r) => r.lastPrice !== null);

  const historyCollection = db.collection<SignalHistoryDoc>("signalHistory");
  const existing = await historyCollection.find({}).toArray();
  const isFirstRun = existing.length === 0;
  const previousByCode = new Map(existing.map((h) => [h.companyCode, h.signal]));

  const changes: SignalChange[] = [];
  const ops = priced.map((row) => {
    const previous = previousByCode.get(row.companyCode);
    if (!isFirstRun && previous !== row.signal) {
      changes.push({
        symbol: row.symbol,
        name: row.name,
        from: previous ?? "NEW",
        to: row.signal,
      });
    }
    return {
      updateOne: {
        filter: { companyCode: row.companyCode },
        update: {
          $set: {
            companyCode: row.companyCode,
            symbol: row.symbol,
            signal: row.signal,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await historyCollection.bulkWrite(ops, { ordered: false });
  }

  if (isFirstRun || changes.length === 0) {
    return { changes, notified: false };
  }

  const preview = changes
    .slice(0, 5)
    .map((c) => `${c.symbol} ${c.from}→${c.to}`)
    .join(", ");
  const body =
    changes.length > 5 ? `${preview} +${changes.length - 5} бусад` : preview;

  const result = await sendPushToAll(db, {
    title: `MSE: ${changes.length} дохио шинэчлэгдлээ`,
    body,
    url: "/",
    tag: "mse-signal-change",
  });

  return { changes, notified: result.sent > 0 };
}
