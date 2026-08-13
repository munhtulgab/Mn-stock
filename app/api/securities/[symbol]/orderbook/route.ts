import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fetchLiveQuotes } from "@/lib/marketinfo/quotes";
import { fetchOrderBook } from "@/lib/marketinfo/orderBook";
import type { Security } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The standing orders for one security, level by level.
 *
 * Read server-side rather than from the page, because the token it needs is
 * the operator's and belongs in settings, not in a browser. Kept out of the
 * quote endpoint that polls every few seconds: this is a second request to a
 * third party and is only wanted while somebody has the trade modal open.
 *
 * Answers 200 with a null book rather than an error when there is no token,
 * or the token has expired, or marketinfo is down. None of those is a fault
 * the reader can do anything about, and the modal has figures to fall back
 * on either way.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const db = await getDb();
  // Signed in only: this spends the operator's token, and the modal it feeds
  // is behind a login anyway.
  if (!(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const ticker = symbol.toUpperCase();

  const settings = await getSettings(db);
  const token = settings.marketinfoToken;
  if (!token) return NextResponse.json({ book: null, reason: "no-token" });

  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: ticker }, { projection: { _id: 0, companyCode: 1 } });
  if (!security) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The book is keyed by the exchange's order-book code, which the quote feed
  // is what knows: it cannot be rebuilt from the ticker for every listing.
  const quotes = await fetchLiveQuotes({ extraCaCerts: settings.extraCaCerts }).catch(
    () => null,
  );
  const bookSymbol = quotes?.get(security.companyCode)?.bookSymbol;
  if (!bookSymbol) return NextResponse.json({ book: null, reason: "no-symbol" });

  const book = await fetchOrderBook(bookSymbol, token);
  return NextResponse.json({
    book,
    // Names the likely cause so the settings page can say something useful
    // rather than the modal silently drawing nothing.
    reason: book ? null : "unauthorized-or-empty",
  });
}
