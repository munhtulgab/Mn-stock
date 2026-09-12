import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { orderFilter } from "@/lib/adminUsers";
import { applyChange, OrderCorrectionError, type OrderLike } from "@/lib/adminOrders";
import { requireAdminRequest } from "@/lib/roles";
import { fromUlaanbaatarStamp } from "@/lib/day";
import type { Transaction } from "@/lib/types";

/**
 * One order in someone's history, edited or taken out.
 *
 * Both go through `lib/adminOrders`, which moves the cash balance and the
 * position by the difference the change makes. Editing a row and leaving the
 * account alone would be the more obvious implementation and the wrong one:
 * the order is not a record of the trade, it is half of what the trade did.
 */
async function load(db: Awaited<ReturnType<typeof getDb>>, userId: string, orderId: string) {
  const tx = await db
    .collection<Transaction>("transactions")
    .findOne({ ...orderFilter(orderId), userId } as never);
  return tx ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const db = await getDb();
  const gate = await requireAdminRequest(db);
  if (gate.error) return gate.error;
  const { id, orderId } = await params;

  const tx = await load(db, id, orderId);
  if (!tx) return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const side = body.side === "BUY" || body.side === "SELL" ? body.side : tx.side;
  const quantity = num(body.quantity, tx.quantity);
  const price = num(body.price, tx.price);
  // Sent as the clock face the administrator typed, read as Ulaanbaatar's —
  // see `fromUlaanbaatarStamp`. Anything else is a caller that did not use the
  // form, and is refused below rather than guessed at.
  const createdAt =
    typeof body.createdAt === "string" && body.createdAt !== ""
      ? fromUlaanbaatarStamp(body.createdAt)
      : tx.createdAt;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Тоо ширхэг бүхэл, эерэг тоо байна" }, { status: 400 });
  }
  if (!(price > 0)) {
    return NextResponse.json({ error: "Үнэ эерэг тоо байна" }, { status: 400 });
  }
  if (Number.isNaN(createdAt.getTime())) {
    return NextResponse.json({ error: "Огноо танигдсангүй" }, { status: 400 });
  }

  const after: OrderLike = { side, quantity, total: quantity * price };
  try {
    await applyChange(db, id, tx.companyCode, tx.symbol, tx, after);
  } catch (err) {
    if (err instanceof OrderCorrectionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  await db.collection<Transaction>("transactions").updateOne(
    { ...orderFilter(orderId), userId: id } as never,
    {
      $set: {
        side,
        quantity,
        price,
        total: after.total,
        createdAt,
        editedAt: new Date(),
        editedBy: gate.admin.username,
      },
    },
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const db = await getDb();
  const gate = await requireAdminRequest(db);
  if (gate.error) return gate.error;
  const { id, orderId } = await params;

  const tx = await load(db, id, orderId);
  if (!tx) return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });

  try {
    await applyChange(db, id, tx.companyCode, tx.symbol, tx, null);
  } catch (err) {
    if (err instanceof OrderCorrectionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
  await db
    .collection<Transaction>("transactions")
    .deleteOne({ ...orderFilter(orderId), userId: id } as never);
  // A correcting row that pointed at this one now points at nothing, which
  // would leave the page marking an order as undone by an order that is gone.
  await db
    .collection<Transaction>("transactions")
    .updateMany({ userId: id, reversalOf: orderId } as never, { $unset: { reversalOf: "" } });
  return NextResponse.json({ ok: true });
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}
