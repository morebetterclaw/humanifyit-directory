#!/usr/bin/env python3
"""Clean a seed CSV (any sensible headers) into data/tools.csv.

Usage: python3 scripts/import_seed.py path/to/seed.csv [--out data/tools.csv]

Maps header names, strips tracking/affiliate parameters from URLs, flags URLs
that look like affiliate links (status=affiliate, kept off the page), drops
rows with no name or URL, and de-duplicates by URL. Existing last_checked and
status values in the output file are kept for URLs already there.
"""
import argparse
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toolslib as T  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--out", default=T.TOOLS_CSV)
    a = ap.parse_args()

    with open(a.seed, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        mapping = T.map_headers(reader.fieldnames or [])
        rows = list(reader)
    print("Header mapping:", mapping)
    missing = [k for k in ("name", "url", "trade", "one_liner", "uk_price", "free_tier") if k not in mapping]
    if missing:
        print("WARNING: no column found for:", ", ".join(missing))

    previous = {}
    if os.path.exists(a.out):
        for r in T.read_tools(a.out):
            previous[r["url"]] = r

    out, seen, report = [], {}, {"skipped": [], "stripped": [], "affiliate": [], "duplicate": []}
    for i, raw in enumerate(rows, start=2):
        rec = {k: (raw.get(mapping[k]) or "").strip() if k in mapping else "" for k in T.FIELDS}
        rec = {k: " ".join(v.split()) for k, v in rec.items()}  # collapse whitespace/newlines
        if not rec["name"] or not rec["url"]:
            report["skipped"].append("line %d: missing name or URL (%r)" % (i, rec["name"] or rec["url"]))
            continue
        clean, stripped, reasons = T.clean_url(rec["url"])
        if not clean:
            report["skipped"].append("line %d: %s has an invalid URL %r" % (i, rec["name"], rec["url"]))
            continue
        if stripped:
            report["stripped"].append("%s: removed %s" % (rec["name"], ", ".join(stripped)))
        key = clean.rstrip("/").lower()
        if key in seen:
            # Same tool listed for another trade: merge the trades into one row.
            first = seen[key]
            if rec["trade"] and rec["trade"].lower() not in first["trade"].lower():
                first["trade"] += "; " + rec["trade"]
            report["duplicate"].append("%s: merged trades into '%s'" % (rec["name"], first["trade"]))
            continue
        seen[key] = rec
        if rec["pricing_url"]:
            pclean, pstripped, preasons = T.clean_url(rec["pricing_url"])
            if preasons or not pclean:
                report["affiliate"].append("%s pricing_url dropped: %s" % (rec["name"], "; ".join(preasons) or "invalid"))
                pclean = ""
            rec["pricing_url"] = pclean
        p = rec["uk_price"].lower()
        if not rec["price_kind"]:
            rec["price_kind"] = ("vendor" if re.search(r"contact sales|not listed|on request$", p) or not p
                                 else "approx" if "approx" in p else "gbp")
        rec["notes"] = ""
        rec["url"] = clean
        prev = previous.get(clean)
        if prev:
            rec["last_checked"] = rec["last_checked"] or prev["last_checked"]
            rec["status"] = rec["status"] or prev["status"]
        if reasons:
            rec["status"] = "affiliate"
            rec["notes"] = ("; ".join(reasons) + (" | " + rec["notes"] if rec["notes"] else ""))
            report["affiliate"].append("%s (%s): %s" % (rec["name"], clean, "; ".join(reasons)))
        out.append(rec)

    T.write_tools(out, a.out)
    print("Wrote %d tools to %s" % (len(out), a.out))
    for k, v in report.items():
        if v:
            print("%s (%d):" % (k, len(v)))
            for line in v:
                print("  -", line)


if __name__ == "__main__":
    main()
