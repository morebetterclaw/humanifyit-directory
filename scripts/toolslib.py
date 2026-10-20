"""Shared helpers for the Humanify It directory scripts (standard library only)."""
import csv
import json
import os
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TOOLS_CSV = os.path.join(DATA, "tools.csv")
TRADES_JSON = os.path.join(DATA, "trades.json")
TOTW_JSON = os.path.join(DATA, "tool-of-the-week.json")

FIELDS = ["name", "url", "trade", "one_liner", "uk_price", "price_kind", "pricing_url",
          "price_checked", "free_tier", "last_checked", "status", "notes"]

# price_kind: how the price is shown on the page
#   gbp     uk_price shown exactly as given (a GBP price from the tool's UK pricing)
#   approx  uk_price is an approximate conversion, written like
#           "approx. £12/month (checked 20 Oct)"
#   vendor  no number shown: "See price on vendor site", linked to pricing_url
#           (or the tool's URL). Use for contact-sales, unlisted or unconfirmed prices.
PRICE_KINDS = ("gbp", "approx", "vendor")

# Statuses that keep a tool off the page.
UNPUBLISHED = {"dead", "affiliate", "rejected", "hidden"}

# --- header mapping for seed files -------------------------------------------
HEADER_ALIASES = {
    "name": ["name", "tool", "toolname", "product", "title"],
    "url": ["url", "website", "link", "site", "homepage", "toolurl", "web"],
    "trade": ["trade", "trades", "category", "sector", "role", "roles",
              "industry", "tradeorrole", "traderole", "for"],
    "one_liner": ["oneliner", "description", "summary", "whatitdoes",
                  "blurb", "tagline", "use", "usecase"],
    "uk_price": ["ukprice", "price", "pricing", "priceuk", "ukpricing",
                 "cost", "pricegbp", "gbpprice", "ukpricegbp"],
    "pricing_url": ["pricingurl", "pricelink", "pricingpage", "pricingurls"],
    "price_checked": ["pricechecked", "pricedate", "pricecheckedon"],
    "free_tier": ["freetier", "free", "freeplan", "hasfreetier", "freeversion",
                  "freetrial", "freeoption"],
    "last_checked": ["lastchecked", "checked", "datechecked", "checkedon"],
    "status": ["status"],
    # Seed notes and research columns are deliberately NOT imported: they're
    # working notes, not for publishing. data/tools.csv "notes" is ours.
}


def _key(h):
    return re.sub(r"[^a-z0-9]", "", (h or "").lower())


def map_headers(headers):
    """Return {our_field: their_header} for a seed file's header row."""
    out = {}
    for h in headers:
        k = _key(h)
        for field, aliases in HEADER_ALIASES.items():
            if field in out:
                continue
            if k in aliases:
                out[field] = h
                break
    # looser second pass: prefix/contains matches
    for h in headers:
        k = _key(h)
        if h in out.values() or k in ("notes", "note") or "gdpr" in k:
            continue
        for field, aliases in HEADER_ALIASES.items():
            if field not in out and any(k.startswith(a) for a in aliases if len(a) > 3):
                out[field] = h
                break
    return out


# --- URL cleaning --------------------------------------------------------------
STRIP_PARAMS = {
    "ref", "ref_id", "refid", "ref_src", "referrer", "referral", "referral_code",
    "via", "aff", "aff_id", "affid", "affiliate", "affiliate_id", "affiliateid",
    "fpr", "fp_ref", "gclid", "gclsrc", "dclid", "fbclid", "msclkid", "yclid",
    "twclid", "ttclid", "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi",
    "hsa_acc", "hsa_cam", "hsa_grp", "hsa_ad", "hsa_src", "hsa_tgt", "hsa_kw",
    "hsa_mt", "hsa_net", "hsa_ver", "irclickid", "irgwc", "clickid", "click_id",
    "sscid", "tap_a", "tap_s", "a_aid", "a_bid", "partner", "partner_id",
    "partnerid", "coupon", "promo", "promocode", "igshid", "si", "_ga", "_gl", "oly_anon_id", "oly_enc_id", "vero_id",
    "wickedid", "rb_clickid", "s_cid", "awc", "cjevent", "cjdata", "ranmid",
    "raneaid", "ransiteid", "subid", "sub_id", "lmref", "rfsn", "trk",
}
STRIP_PREFIXES = ("utm_", "hsa_", "pk_", "mtm_", "matomo_", "ga_")

AFFILIATE_HOST_HINTS = (
    "pxf.io", "sjv.io", "ojrq.net", "impact.com", "partnerstack.com",
    "shareasale.com", "awin1.com", "awin.com", "clickbank.net", "anrdoezrs.net",
    "dpbolvw.net", "jdoqocy.com", "kqzyfj.com", "tkqlhce.com", "linksynergy.com",
    "go2cloud.org", "rewardful.com", "firstpromoter.com", "tapfiliate.com",
    "amzn.to", "bit.ly", "tinyurl.com", "rebrand.ly", "geni.us", "t.co",
    "lnkd.in", "ow.ly", "shorturl.at", "cutt.ly", "linktr.ee", "skimresources.com",
    "prf.hn", "avantlink.com", "refersion.com", "fbuy.me", "get.app", "try.",
)
AFFILIATE_PATH_RE = re.compile(
    r"/(ref|aff|affiliate|affiliates|partner|partners|go|refer|referral|invite|r)/[^/]+",
    re.I)
AFFILIATE_PARAM_RE = re.compile(r"(ref|aff|partner|coupon|promo|referr|invite|track|click)", re.I)


def clean_url(raw):
    """Return (clean_url, stripped_params, affiliate_reasons)."""
    raw = (raw or "").strip()
    reasons = []
    if raw and not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw.lstrip("/")
    parts = urlsplit(raw)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        return "", [], ["not a valid web address"]
    host = parts.hostname or ""
    kept, stripped = [], []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        kl = k.lower()
        if kl in STRIP_PARAMS or kl.startswith(STRIP_PREFIXES):
            stripped.append(k)
        else:
            kept.append((k, v))
            if AFFILIATE_PARAM_RE.search(kl):
                reasons.append("query parameter '%s' looks like tracking" % k)
    for hint in AFFILIATE_HOST_HINTS:
        if (hint.endswith(".") and host.startswith(hint)) or host == hint or host.endswith("." + hint):
            reasons.append("host '%s' is a known affiliate or link-shortener domain" % host)
            break
    if AFFILIATE_PATH_RE.search(parts.path or ""):
        reasons.append("path '%s' looks like a referral link" % parts.path)
    path = parts.path or "/"
    clean = urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path,
                        urlencode(kept, doseq=True), ""))
    return clean, stripped, reasons


# --- free tier -----------------------------------------------------------------
def free_tier_label(value):
    v = (value or "").strip().lower()
    if not v:
        return "Not stated"
    if re.match(r"^(y|yes|true|1|free)\b", v) or v.startswith("yes"):
        return "Yes"
    if "trial" in v:
        return "No (free trial)"
    if re.match(r"^(n|no|false|0|none)\b", v) or v.startswith("no"):
        return "No"
    return "Not stated"


# --- trades ----------------------------------------------------------------------
def load_trades():
    with open(TRADES_JSON, encoding="utf-8") as f:
        return json.load(f)


def slugify(text):
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-") or "other"


def split_trades(value):
    return [p.strip() for p in re.split(r"[;|/,&+]+|\band\b", value or "") if p.strip()]


GENERAL_RE = re.compile(
    r"^(all|any|general|every|cross|multi|various|most|everyone|small business(es)?|smes?|smbs?|admin|office)\b")


def match_trades(value, trades):
    """Map a free-text trade cell to a list of trade slugs (order kept, no dups)."""
    found = []
    for part in split_trades(value):
        p = unicodedata.normalize("NFKD", part).encode("ascii", "ignore").decode().lower()
        slug = None
        if GENERAL_RE.match(p.strip()):
            slug = "any-business"
        for t in ([] if slug else [t for t in trades if t["slug"] != "any-business"]):
            for alias in t["aliases"]:
                if re.search(r"\b" + re.escape(alias) + r"", p):
                    slug = t["slug"]
                    break
            if slug:
                break
        if not slug:
            slug = "x-" + slugify(part)
        if slug not in found:
            found.append(slug)
    return found or ["x-other"]


# --- CSV io ------------------------------------------------------------------------
def read_tools(path=TOOLS_CSV):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k in FIELDS:
            r[k] = (r.get(k) or "").strip()
    return rows


def write_tools(rows, path=TOOLS_CSV):
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})
    os.replace(tmp, path)
