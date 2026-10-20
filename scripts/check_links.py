#!/usr/bin/env python3
"""Check every tool URL in data/tools.csv and record the result.

Usage: python3 scripts/check_links.py [--only "Tool name"] [--timeout 15]

HEAD first, then GET if HEAD fails or is refused, with a normal browser
user-agent. Writes status and, on success, last_checked (today, ISO date).

Status values:
  ok        2xx/3xx: last_checked set to today
  dead      404, 410 or the domain doesn't resolve: kept off the page
  blocked   403 or 429 (site refuses automated checks): still listed
  timeout   no answer in time: still listed
  error     anything else (5xx, TLS error, refused): still listed
  affiliate set by import/add_tool, never changed here: kept off the page
"""
import argparse
import datetime
import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, urlencode

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import toolslib as T  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
}


def _request(url, method, timeout):
    req = urllib.request.Request(url, method=method, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if method == "GET":
                r.read(2048)
            return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, None
    except urllib.error.URLError as e:
        return None, e.reason
    except (socket.timeout, TimeoutError) as e:
        return None, e
    except (ssl.SSLError, ConnectionError, OSError) as e:
        return None, e


def classify(code, err):
    if code is not None:
        if 200 <= code < 400:
            return "ok", "HTTP %d" % code
        if code in (404, 410):
            return "dead", "HTTP %d" % code
        if code in (403, 429):
            return "blocked", "HTTP %d" % code
        return "error", "HTTP %d" % code
    if isinstance(err, socket.gaierror) or "Name or service not known" in str(err) \
            or "nodename nor servname" in str(err) or "No address associated" in str(err):
        return "dead", "DNS failure"
    if isinstance(err, (socket.timeout, TimeoutError)) or "timed out" in str(err):
        return "timeout", "timed out"
    return "error", str(err)[:120]


def dns_missing(url, timeout):
    """True if public DNS (Cloudflare DNS-over-HTTPS) says the host doesn't exist.

    Used because some networks answer every lookup with a placeholder address,
    which hides dead domains. Returns False if the DoH lookup itself fails.
    """
    host = urlsplit(url).hostname or ""
    try:
        for rtype in ("A", "AAAA"):
            q = "https://cloudflare-dns.com/dns-query?" + urlencode({"name": host, "type": rtype})
            req = urllib.request.Request(q, headers={"Accept": "application/dns-json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.load(r)
            if d.get("Status") == 3:
                return True
            if d.get("Status") == 0 and d.get("Answer"):
                return False
        return True  # resolves, but to nothing
    except Exception:
        return False


def check(url, timeout):
    if dns_missing(url, timeout):
        return "dead", "DNS failure (no such domain)"
    code, err = _request(url, "HEAD", timeout)
    if code is None or code >= 400:
        code2, err2 = _request(url, "GET", timeout)
        # Prefer the GET answer unless GET failed outright and HEAD had a code.
        if code2 is not None or code is None:
            code, err = code2, err2
    return classify(code, err)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="check just this tool (by name)")
    ap.add_argument("--timeout", type=float, default=15)
    a = ap.parse_args()

    rows = T.read_tools()
    today = datetime.date.today().isoformat()
    todo = [r for r in rows if r["status"] != "affiliate"
            and (not a.only or r["name"].lower() == a.only.lower())]
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(lambda r: check(r["url"], a.timeout), todo))
    summary = {}
    for r, (status, detail) in zip(todo, results):
        r["status"] = status
        if status == "ok":
            r["last_checked"] = today
        summary.setdefault(status, []).append("%s <%s> %s" % (r["name"], r["url"], detail))
    T.write_tools(rows)
    for status in sorted(summary):
        print("%s: %d" % (status, len(summary[status])))
        if status != "ok":
            for line in summary[status]:
                print("  -", line)


if __name__ == "__main__":
    main()
