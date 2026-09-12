import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { orderFilter } from "@/lib/adminUsers";
import { applyChange, mirrorOf, OrderCorrectionError } from "@/lib/adminOrders";
import { requireAdminRequest } from "@/lib/roles";
import type { Transaction } from "@/lib/types";

/**
 * Cancels an order out without pretending it never happened.
 *
 * Deleting leaves a history that never contained the trade; reversing leaves
 * one that contains it and the order that undid it. Which of the two is wanted
 * depends on what went wrong — a test order somebody placed by accident should
 * go, a real trade that has to be unwound should show as unwound — so the page
 * offers both rather than choosing.
 *
 * The correcting row is the same shares at the same price the other way round,
 * so the account lands exactly where it started.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> },
) {
  const db = await getDb();
  const gate = await requireAdminRequest(db);
  if (gate.error) return gate.error;
  const { id, orderId } = await params;

  const tx = await db
    .collection<Transaction>("transactions")
    .findOne({ ...orderFilter(orderId), userId: id } as never);
  if (!tx) return NextResponse.json({ error: "Захиалга олдсонгүй" }, { status: 404 });

  const already = await db
    .collection<Transaction>("transactions")
    .findOne({ userId: id, reversalOf: orderId } as never);
  if (already) {
    return NextResponse.json({ error: "Энэ захиалга аль хэдийн буцаагдсан" }, { status: 409 });
  }

  const mirror = mirrorOf({ ...tx, _id: orderId });
  try {
    await applyChange(db, id, tx.companyCode, tx.symbol, null, mirror);
  } catch (err) {
    if (err instanceof OrderCorrectionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
  await db
    .collection<Transaction>("transactions")
    .insertOne({ ...mirror, editedBy: gate.admin.username } as never);
  return NextResponse.json({ ok: true });
}
