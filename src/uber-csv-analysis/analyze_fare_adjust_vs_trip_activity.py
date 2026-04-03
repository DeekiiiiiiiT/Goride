import csv
import re
from pathlib import Path
from collections import Counter


def parse_cur(x: object) -> float:
    if x is None:
        return 0.0
    s = str(x).replace(",", "")
    s = re.sub(r"[^0-9.-]", "", s)
    if s in ("", "-", "."):
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0


def norm_desc(s: object) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def is_fare_adjust(desc: object) -> bool:
    n = norm_desc(desc)
    token = "trip fare adjust order"
    return n == token or n.startswith(token + " ")


def main() -> None:
    # Change this base path if you want a different week folder
    base = Path(
        r"C:\Users\deeki\OneDrive\Documents\Business\Roam\Reports\RideShare Trips\Uber\2026\March 23 - March 30"
    )
    ptx = base / "payments_transaction.csv"
    trip = base / "trip_activity.csv"

    trip_ids = set()
    with open(trip, "r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            tid = (row.get("Trip UUID") or row.get("trip uuid") or row.get("trip_uuid") or "").strip()
            if tid:
                trip_ids.add(tid)

    rows = []
    with open(ptx, "r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            if not is_fare_adjust(row.get("Description", "")):
                continue

            trip_uuid = (row.get("Trip UUID") or row.get("trip uuid") or "").strip()
            tip_col = parse_cur(
                row.get("Paid to you:Your earnings:Tip")
                or row.get("Paid to you : Your earnings : Tip")
            )

            earnings_val = parse_cur(
                row.get("Paid to you : Your earnings")
                or row.get("Paid to you:Your earnings")
                or row.get("Paid to you")
                or row.get("Fare")
            )

            net_payout_raw = parse_cur(row.get("Paid to you"))

            in_trip_activity = trip_uuid in trip_ids

            # Mirrors the current csvHelpers priorAmt priority
            if tip_col != 0:
                prior_amt = tip_col
            elif earnings_val != 0:
                prior_amt = earnings_val
            else:
                prior_amt = abs(net_payout_raw)

            is_prior = not in_trip_activity
            prior_bucket = prior_amt if is_prior else 0.0
            tips_bucket = 0.0 if is_prior else tip_col

            rows.append(
                {
                    "trip_uuid": trip_uuid,
                    "tip_col": tip_col,
                    "earnings_val": earnings_val,
                    "net_payout_raw": net_payout_raw,
                    "in_trip_activity": in_trip_activity,
                    "prior_amt": prior_amt,
                    "prior_bucket": prior_bucket,
                    "tips_bucket": tips_bucket,
                }
            )

    print("Fare adjust rows:", len(rows))
    print("TripActivity presence counts:", Counter([r["in_trip_activity"] for r in rows]))

    prior_sum = sum(r["prior_bucket"] for r in rows)
    tips_sum = sum(r["tips_bucket"] for r in rows)

    print("Computed prior bucket sum:", prior_sum)
    print("Computed tips bucket sum:", tips_sum)

    # Print rows sorted by UUID for readability
    for r in sorted(rows, key=lambda x: x["trip_uuid"] or ""):
        print(
            "UUID",
            r["trip_uuid"],
            "tip_col",
            r["tip_col"],
            "earn",
            r["earnings_val"],
            "in_activity",
            r["in_trip_activity"],
            "prior_amt",
            r["prior_amt"],
            "prior_bucket",
            r["prior_bucket"],
            "tips_bucket",
            r["tips_bucket"],
        )


if __name__ == "__main__":
    main()

