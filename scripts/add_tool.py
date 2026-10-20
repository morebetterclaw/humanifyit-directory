#!/usr/bin/env python3
"""Append one approved tool to data/tools.csv.

Usage:
  python3 scripts/add_tool.py --name "Tool" --url https://example.com \\
      --trade "Salons; Physios" --one-liner "What it does, in one line." \\
      --uk-price "Free; paid plans from £10 a month" --free-tier yes \\
      [--price-kind gbp|approx|vendor] [--pricing-url https://example.com/pricing] \\
      [--notes "Approved by Daksh, 21 Oct 2026"]

Only use this for submissions Daksh has approved (see MODERATION.md).
The URL is cleaned of tracking parameters; affiliate-looking URLs are refused.
The new row has no status until you run scripts/check_links.py, so it stays
off the page until its link has been checked. Then run scripts/build.py.
"""
import argparse
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toolslib as T  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Append an approved tool to data/tools.csv")
    ap.add_argument("--name", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--trade", required=True, help="one or more trades, separated by ';'")
    ap.add_argument("--one-liner", required=True)
    ap.add_argument("--uk-price", default="", help="as the tool states it, e.g. 'From £12 a month'")
    ap.add_argument("--price-kind", default="gbp", choices=list(T.PRICE_KINDS),
                    help="gbp: show --uk-price as given; approx: converted price written "
                         "'approx. £12/month (checked 20 Oct)'; vendor: show 'See price on vendor site'")
    ap.add_argument("--pricing-url", default="", help="the tool's own pricing page (plain link)")
    ap.add_argument("--free-tier", required=True, choices=["yes", "no", "trial"],
                    help="trial = no free tier, but a free trial")
    ap.add_argument("--notes", default="")
    a = ap.parse_args()

    clean, stripped, reasons = T.clean_url(a.url)
    if not clean:
        sys.exit("That URL isn't a valid web address.")
    if reasons:
        sys.exit("Refused: the URL looks like an affiliate or tracking link (%s). "
                 "Use the tool's plain homepage." % "; ".join(reasons))
    if stripped:
        print("Removed tracking parameters:", ", ".join(stripped))

    if a.price_kind != "vendor" and not a.uk_price:
        sys.exit("--uk-price is needed unless --price-kind vendor")
    if a.price_kind == "approx" and not re.search(r"\bapprox\. £[\d.,]+.*\(checked [^)]+\)", a.uk_price):
        sys.exit("Approximate prices must read like 'approx. £12/month (checked 20 Oct)'")
    pricing = ""
    if a.pricing_url:
        pricing, _, preasons = T.clean_url(a.pricing_url)
        if preasons or not pricing:
            sys.exit("Refused pricing URL (%s)." % ("; ".join(preasons) or "invalid"))

    rows = T.read_tools()
    for r in rows:
        if r["url"].rstrip("/").lower() == clean.rstrip("/").lower() or r["name"].lower() == a.name.strip().lower():
            sys.exit("Already in the list: %s <%s>" % (r["name"], r["url"]))

    trades = T.load_trades()
    slugs = T.match_trades(a.trade, trades)
    unknown = [s for s in slugs if s.startswith("x-")]
    if unknown:
        print("Note: %s isn't one of the existing trades, so it'll get its own group." % ", ".join(unknown))

    rows.append({
        "name": " ".join(a.name.split()), "url": clean, "trade": " ".join(a.trade.split()),
        "one_liner": " ".join(a.one_liner.split()), "uk_price": " ".join(a.uk_price.split()),
        "price_kind": a.price_kind, "pricing_url": pricing,
        "price_checked": datetime.date.today().isoformat() if a.price_kind != "vendor" else "",
        "free_tier": {"yes": "Yes", "no": "No", "trial": "Trial"}[a.free_tier],
        "last_checked": "", "status": "", "notes": a.notes,
    })
    T.write_tools(rows)
    print("Added %s <%s>. Next: python3 scripts/check_links.py --only %r && python3 scripts/build.py"
          % (a.name, clean, a.name))


if __name__ == "__main__":
    main()
