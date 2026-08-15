"""Golomt Capital statements -> the transaction list the app can import.

The statement's `Эхний үлдэгдэл` column is not a running balance: on every one
of the 141 rows it is exactly `Эцсийн үлдэгдэл - (Орлого - Зарлага)`, back-
computed from the row's own fill. Follow it and a day with three fills reads
as three separate days. What is real is the fill itself, and the running sum
of those lands on the broker's stated closing balance at the end of every day
in all five statements — which is what makes this parse checkable.
"""

import glob
import json
import re
import sys
from collections import defaultdict

SP = "/tmp/claude-0/-home-user-Mn-stock/0ba0e675-f6cb-51b4-92f1-876183cb02b7/scratchpad"

NUM = r"[\d,]+\.\d{2}"
ROW = re.compile(
    r"(?P<date>\d{4}-\d{2}-\d{2})\s+(?P<name>[^\d]+?)\s+"
    r"(?P<symbol>[A-Z]{2,5})\s+(?P<code>\d+)\s+"
    rf"(?P<opening>{NUM})\s+(?P<inn>{NUM})\s+(?P<out>{NUM})\s+(?P<closing>{NUM})\s+"
    rf"(?P<price>{NUM})\s+(?P<total>{NUM})\s+(?P<fee>{NUM})"
)

n = lambda s: float(s.replace(",", ""))


def rows_of(path):
    flat = re.sub(r"\s+", " ", open(path).read())
    body = flat[flat.index("Гүйлгээний утга") + len("Гүйлгээний утга"):]
    return [
        {
            "date": m["date"], "symbol": m["symbol"], "name": m["name"].strip(),
            "code": int(m["code"]), "opening": n(m["opening"]), "in": n(m["inn"]),
            "out": n(m["out"]), "closing": n(m["closing"]), "price": n(m["price"]),
            "total": n(m["total"]), "fee": n(m["fee"]), "seq": i,
            "file": path.split("/")[-1],
        }
        for i, m in enumerate(ROW.finditer(body))
    ]


def main():
    rows = []
    for f in sorted(glob.glob(f"{SP}/stmt-*.txt")):
        rows += rows_of(f)
    rows.sort(key=lambda r: (r["date"], r["seq"]))

    assert all(
        abs(r["opening"] - (r["closing"] - r["in"] + r["out"])) < 0.001 for r in rows
    ), "the opening column is not derived after all — re-read the statement"

    position, checked = defaultdict(float), 0
    by_day = defaultdict(list)
    for r in rows:
        by_day[(r["symbol"], r["date"])].append(r)
    for r in rows:
        position[r["symbol"]] += r["in"] - r["out"]
        if r is by_day[(r["symbol"], r["date"])][-1]:
            assert abs(position[r["symbol"]] - r["closing"]) < 0.001, (
                f"{r['symbol']} {r['date']}: ran to {position[r['symbol']]},"
                f" broker says {r['closing']}"
            )
            checked += 1
    print(f"{len(rows)} rows, {checked} day-ends reconciled against the broker",
          file=sys.stderr)

    transactions = []
    for r in rows:
        qty = r["in"] - r["out"]
        if qty == 0:
            continue
        transactions.append({
            "date": r["date"],
            "symbol": r["symbol"],
            "companyCode": r["code"],
            "side": "BUY" if qty > 0 else "SELL",
            "quantity": abs(qty),
            "price": r["price"],
            # What the account was debited or credited, commission included.
            "settled": r["total"],
            "fee": r["fee"],
        })

    qty, cost, fees = defaultdict(float), defaultdict(float), defaultdict(float)
    for t in transactions:
        s = t["symbol"]
        fees[s] += t["fee"]
        if t["side"] == "BUY":
            cost[s] += t["quantity"] * t["price"]
            qty[s] += t["quantity"]
        else:
            avg = cost[s] / qty[s] if qty[s] else 0
            cost[s] -= avg * t["quantity"]
            qty[s] -= t["quantity"]

    holdings = []
    for s in sorted(qty):
        if round(qty[s], 4) <= 0:
            continue
        assert abs(qty[s] - position[s]) < 0.001, f"{s} disagrees with the broker"
        holdings.append({
            "symbol": s,
            "companyCode": next(t["companyCode"] for t in transactions if t["symbol"] == s),
            "quantity": round(qty[s]),
            "avgCost": round(cost[s] / qty[s], 4),
        })

    print(f"\n  {'sym':5} {'quantity':>9} {'avg cost':>10} {'cost basis':>14} {'fees':>10}",
          file=sys.stderr)
    for h in holdings:
        basis = h["quantity"] * h["avgCost"]
        print(f"  {h['symbol']:5} {h['quantity']:>9,} {h['avgCost']:>10,.2f}"
              f" {basis:>14,.0f} {fees[h['symbol']]:>10,.0f}", file=sys.stderr)
    total = sum(h["quantity"] * h["avgCost"] for h in holdings)
    print(f"  {'':5} {'':>9} {'':>10} {total:>14,.0f} {sum(fees.values()):>10,.0f}",
          file=sys.stderr)
    sold_out = [s for s in sorted(position) if round(position[s], 4) == 0]
    print(f"\n  closed out: {', '.join(sold_out) or 'none'}", file=sys.stderr)

    json.dump(
        {
            "source": "Golomt Capital ҮЦК — харилцагчийн үнэт цаасны гүйлгээний түүх",
            "range": [transactions[0]["date"], transactions[-1]["date"]],
            "transactions": transactions,
            "holdings": holdings,
        },
        open(f"{SP}/golomt.json", "w"),
        ensure_ascii=False,
        indent=1,
    )
    print(f"\nwrote {len(transactions)} transactions, {len(holdings)} holdings",
          file=sys.stderr)


if __name__ == "__main__":
    main()
