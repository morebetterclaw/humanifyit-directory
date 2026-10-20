#!/usr/bin/env node
// Builds the phase 1 pages from data/fit.json and data/guides.json (Node, no npm packages):
//   /fit/  /kit/<trade>-<job>/ (9)  /guides/<slug>/ (3)  /measurements/  /preorder/<trade>-<price>/ (6)
// and adds every page to sitemap.xml. The kit pages are prerendered with js/fit.js,
// the same code that tailors them in the browser, using the default answers in
// fit.json's kit_defaults, so they work with JavaScript off.
// Usage: node scripts/build_pages.mjs [--check]   (--check exits 1 if anything would change)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Fit = require(path.join(ROOT, 'js/fit.js'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fit.json'), 'utf8'));
const guides = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/guides.json'), 'utf8'));
const CHECK = process.argv.includes('--check');
const SITE = 'https://humanifyit.ai';
const MAIL = 'morebetterstudios@agentmail.to';
const BEEHIIV = 'https://sutrasignal.beehiiv.com/subscribe';
const BEACON = '<!-- Cloudflare Web Analytics (free, cookie-free) --><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "01038fbbb0d44f539aca41ae523b5cc0"}\'></script>';
const esc = Fit.esc;
const nice = Fit.niceDate;
const TRADES = ['salon', 'cafe', 'physio'];
const PRICES = [['499', '£4.99'], ['999', '£9.99']];
const changed = [];
const pages = [];

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ext(url, text) {
  return `<a href="${esc(url)}" rel="noopener" target="_blank">${text}<span class="vh"> (opens in a new tab)</span></a>`;
}

function page({ path: p, title, description, main, bodyAttrs = '', scripts = '', nav = '' }) {
  if (title.length >= 70) throw new Error(`title too long (${title.length}): ${title}`);
  if (description.length >= 160) throw new Error(`description too long (${description.length}): ${description}`);
  const cur = (href) => (nav === href ? ' aria-current="page"' : '');
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${p}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Humanify It">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${p}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b5d4b">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
</head>
<body${bodyAttrs}>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap">
    <a class="brand" href="/">Humanify <span>It</span></a>
    <nav aria-label="Main"><a href="/fit/"${cur('/fit/')}>Get fitted</a><a href="/#guides">Free guides</a><a href="/tools/">Full directory</a></nav>
  </div>
</header>

<main id="main">
${main}
</main>

<footer>
  <div class="wrap">
    <nav aria-label="Footer"><a href="/privacy.html">Privacy</a><a href="/measurements/">Measurements card</a><a href="mailto:${MAIL}">Contact</a></nav>
    <p>Humanify It is a work in progress. We add trades, tools and guides as we check them.</p>
  </div>
</footer>
${scripts}${BEACON}
</body>
</html>
`;
}

function write(rel, content) {
  const file = path.join(ROOT, rel);
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (old !== content) {
    changed.push(rel);
    if (!CHECK) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
}
function emit(urlPath, html) {
  pages.push(urlPath);
  write(path.join(urlPath.slice(1), 'index.html'), html);
}

// Inline copy of fit.json, so the browser never has to fetch anything.
const dataScript = `<script type="application/json" id="fit-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n`;

function preorderBlock(trade) {
  const t = data.trades[trade];
  return `<section class="preorder" aria-labelledby="po-h">
  <h2 id="po-h">The full ${esc(t.kit)}</h2>
  <p>We're putting together the full ${esc(t.kit)}: all three ${esc(t.name.toLowerCase())} guides, the \u2018same settings in other apps\u2019 sections, more ready-to-paste prompts and a one-page chart of which app fits you. It isn't ready yet.</p>
  <ul class="po-buttons">
    <li><a class="button" href="/preorder/${trade}-499/">Pre-order the ${esc(t.kit)}, £4.99<span class="po-note">Pre-order, no payment now</span></a></li>
    <li><a class="button button-alt" href="/preorder/${trade}-999/">Kit + 12 months of updates, £9.99<span class="po-note">Pre-order, no payment now</span></a></li>
  </ul>
</section>`;
}

/* ---------- /kit/<trade>-<job>/ ---------- */
const kitLinks = [];
for (const trade of TRADES) {
  for (const job of Object.keys(data.kits[trade])) {
    const slug = Fit.kitSlug(trade, job);
    const t = data.trades[trade];
    const jobName = data.jobs[trade][job];
    kitLinks.push({ trade, job, slug, label: `${t.kit}: ${jobName.toLowerCase()}` });
    const others = Object.keys(data.kits[trade]).filter((j) => j !== job)
      .map((j) => `<a href="/kit/${Fit.kitSlug(trade, j)}/">${esc(data.jobs[trade][j].toLowerCase())}</a>`).join(' or ');
    const main = `<div class="wrap kit">
  <p class="eyebrow">${esc(t.kit)}</p>
  <h1>Your ${esc(t.kit)}: ${esc(jobName.toLowerCase())}</h1>
  <p class="lede">Three tools for the job, what they'd cost you each month, and the guides that go with them.</p>
  <div id="kit-result">
${Fit.renderKit(data, trade, job, data.kit_defaults, { starting: true })}
  </div>
  ${preorderBlock(trade)}
  <p class="small">Other ${esc(t.name.toLowerCase())} kits: ${others}. <a href="/tools/#${t.directory}">See every ${esc(t.name.toLowerCase())} tool in the directory</a>.</p>
</div>`;
    emit(`/kit/${slug}/`, page({
      path: `/kit/${slug}/`,
      title: `${t.kit}: ${jobName.toLowerCase()} | Humanify It`,
      description: `Three AI tools for UK ${t.name.toLowerCase()} owners for ${jobName.toLowerCase()}, with monthly costs, checked dates and free setup guides.`,
      bodyAttrs: ` data-page="kit" data-trade="${trade}" data-job="${job}"`,
      main,
      scripts: dataScript + '<script src="/js/fit.js" defer></script>\n',
    }));
  }
}

/* ---------- /fit/ ---------- */
function radios(name, options, idp) {
  return options.map(([v, label]) =>
    `<label class="choice"><input type="radio" name="${name}" value="${esc(v)}"> ${esc(label)}</label>`).join('\n        ');
}
function step(name, n, inner, hidden) {
  return `    <div class="step" data-name="${name}"${hidden ? ' hidden' : ''}>\n${inner}\n    </div>`;
}
function fs1(legend, body, attrs = '', hint = '') {
  return `      <fieldset${attrs}>
        <legend><span class="q" tabindex="-1">${esc(legend)}</span></legend>${hint ? `\n        <p class="small hint">${esc(hint)}</p>` : ''}
        ${body}
      </fieldset>`;
}
{
  const q = data.questions;
  const tradeOpts = TRADES.map((k) => [k, data.trades[k].label]).concat([['other', 'Something else']]);
  const otherSub = `<div id="q-other-trades" class="sub" hidden>
        <fieldset>
          <legend>Which of these is closest?</legend>
          ${radios('other_trade', data.other_trades.map((o) => [o.id, o.label]), 'q1o')}
        </fieldset>
        </div>`;
  const perTrade = (key, qtext, prefix) => TRADES.map((t) =>
    fs1(qtext, radios(`${prefix}_${t}`, q[key][t], `${prefix}-${t}`), ` data-for="${t}"`)).join('\n');
  const used = q.used.options.map(([v, label]) =>
    `<label class="choice"><input type="checkbox" name="used" value="${v}"> ${esc(label)}</label>`).join('\n        ');
  const stepsHtml = [
    step('trade', 1, fs1("What's your trade?", radios('trade', tradeOpts, 'q1') + '\n        ' + otherSub)),
    step('team', 2, fs1(q.team.q, radios('team', q.team.options, 'q2')), true),
    step('system', 3, perTrade('system', q.system.q, 'system'), true),
    step('used', 4, fs1(q.used.q, used, '', q.used.hint), true),
    step('job', 5, perTrade('job', q.job.q, 'job'), true),
    step('budget', 6, fs1(q.budget.q, radios('budget', q.budget.options, 'q6'), '', 'New tools only. What you already pay for doesn\'t count.'), true),
    step('comfort', 7, fs1(q.comfort.q, radios('comfort', q.comfort.options, 'q7')), true),
  ].join('\n');
  const list = TRADES.map((t) => `<li><span class="k">${esc(data.trades[t].kit)}:</span> ` +
    kitLinks.filter((k) => k.trade === t).map((k) => `<a href="/kit/${k.slug}/">${esc(data.jobs[t][k.job].toLowerCase())}</a>`).join(', ') + '</li>').join('\n    ');
  const main = `<div class="wrap narrow">
  <h1>Get fitted</h1>
  <p class="lede">Seven quick questions about your business. We'll match you with three tools, what they'd cost you each month, and the guides that go with them.</p>
  <p class="small">Your answers stay on this page. Nothing is stored or sent, and there are no cookies.</p>
  <form id="quiz" class="quiz" hidden novalidate>
    <p id="quiz-progress" class="progress" aria-live="polite"></p>
${stepsHtml}
    <p id="quiz-error" class="error" role="alert" hidden></p>
    <div class="quiz-nav"><button type="button" id="quiz-back" class="button-alt" hidden>Back</button><button type="submit" id="quiz-next">Next</button></div>
  </form>
  <section id="quiz-other" class="other-result" hidden aria-labelledby="other-h">
    <h2 id="other-h" tabindex="-1">We're starting with salons, cafés and physios</h2>
    <p>We don't have a kit for <span data-other-name>your trade</span> yet. You can <a data-other-link href="/tools/">see the tools we've listed for your trade</a> in the directory, or leave your email and we'll tell you when your trade is ready.</p>
    <form class="signup" method="get" action="${BEEHIIV}">
      <label for="other-email">Tell me when my trade is ready</label>
      <div class="row">
        <input id="other-email" name="email" type="email" autocomplete="email" required placeholder="you@yourbusiness.co.uk" aria-describedby="other-note">
        <input type="hidden" name="utm_source" value="humanifyit">
        <input type="hidden" name="utm_medium" value="quiz">
        <input type="hidden" name="utm_campaign" value="quiz-other">
        <button type="submit">Tell me</button>
      </div>
      <p id="other-note" class="small">Only if you want to. You'll finish signing up on the page for our newsletter, Sutra and Signal, which is hosted by beehiiv. Unsubscribe at any time. See our <a href="/privacy.html">privacy note</a>.</p>
    </form>
    <p><button type="button" id="quiz-restart" class="button-alt">Start again</button></p>
  </section>
  <section id="kit-list" aria-labelledby="kits-h">
    <h2 id="kits-h">Or go straight to a kit</h2>
    <p>Each kit page shows a starting set of three tools, which you can then tailor.</p>
    <ul class="kit-list">
    ${list}
    </ul>
    <p>Not a salon, café or physio? <a href="/tools/">Browse the full directory</a>.</p>
  </section>
</div>`;
  emit('/fit/', page({
    path: '/fit/', nav: '/fit/',
    title: 'Get fitted: AI tools for your business in 2 minutes | Humanify It',
    description: 'Seven quick questions match UK salons, cafés and physios with three AI tools, monthly costs and free setup guides. Answers stay in your browser.',
    bodyAttrs: ' data-page="fit"',
    main,
    scripts: dataScript + '<script src="/js/fit.js" defer></script>\n',
  }));
}

/* ---------- /guides/<slug>/ ---------- */
function srcLinks(nums) {
  if (!nums || !nums.length) return '';
  return nums.map((n) => `<a href="#src-${n}">source ${n}</a>`).join(', ');
}
for (const [id, g] of Object.entries(guides)) {
  const t = data.trades[g.trade];
  const checked = nice(g.checked_on);
  const due = nice(addDays(g.checked_on, 90));
  const url = `/guides/${g.slug}/`;
  const steps = g.steps.map((s) => `    <li>
      <p class="do">${esc(s.do)}</p>${s.where ? `\n      <p class="where"><span class="k">Where:</span> ${esc(s.where)}</p>` : ''}${s.shot ? `
      <figure class="shot">
        <p class="shot-box" aria-hidden="true">Example screenshot to come</p>
        <figcaption><span class="vh">Example screenshot to come. </span>It will show: ${esc(s.shot)}</figcaption>
      </figure>` : ''}${s.check ? `\n      <p class="check"><span class="k">You'll know it worked when</span> ${esc(s.check)}</p>` : ''}${s.src.length ? `\n      <p class="src">From ${srcLinks(s.src)}</p>` : ''}
    </li>`).join('\n');
  const clinical = g.clinical ? `
  <section class="clinical" aria-labelledby="clinical-h">
    <h2 id="clinical-h">Clinical and data protection</h2>
    <ul>
      ${g.clinical.map((c) => `<li>${esc(c)}</li>`).join('\n      ')}
    </ul>
    <p class="src">See ${srcLinks(g.clinical_src)}</p>
  </section>` : '';
  const prompts = g.prompts.map((p, i) => `    <li>
      <h3 id="prompt-${i + 1}">${i + 1}. ${esc(p.title)}</h3>
      <pre class="prompt" tabindex="0" aria-labelledby="prompt-${i + 1}">${esc(p.text)}</pre>
    </li>`).join('\n');
  const subject = encodeURIComponent(`Report a change: ${g.title}`);
  const main = `<div class="wrap guide" data-checked-on="${g.checked_on}">
  <p class="eyebrow">Free guide for ${esc(t.name.toLowerCase())}s</p>
  <h1>${esc(g.title)}</h1>
  <ul class="guide-meta">
    <li><span class="k">For:</span> ${esc(g.for)}</li>
    <li><span class="k">Checked on:</span> <time datetime="${g.checked_on}">${checked}</time></li>
    <li><span class="k">Next check due:</span> <time datetime="${addDays(g.checked_on, 90)}">${due}</time></li>
  </ul>
  <div id="stale-banner" class="stale" role="note" hidden></div>
  <p class="notice">Steps written from ${esc(g.written_from)} on ${checked}; we'll walk them through in a live account and add screenshots.</p>

  <h2>What you'll have at the end</h2>
  <p>${esc(g.end)}</p>

  <h2>Time needed</h2>
  <p>${esc(g.time)}</p>

  <h2>Cost</h2>
  <p>${esc(g.cost.text)} Checked on ${checked} (${srcLinks(g.cost.src)}).</p>
  <p><span class="k">Free tier:</span> ${esc(g.cost.free_tier)}</p>

  <h2>Before you start</h2>
  <ul>
    ${g.before.map((b) => `<li>${esc(b)}</li>`).join('\n    ')}
  </ul>
${clinical}
  <h2>Your measurements card</h2>
  <p>Fill in the <a href="/measurements/">measurements card</a> once: ten short lines about your business, such as your opening hours, your tone and how you sign off. Every prompt below starts with it, so the drafts sound like you.</p>

  <h2>Steps</h2>
  <ol class="guide-steps">
${steps}
  </ol>${g.after_steps ? `\n  <p>${esc(g.after_steps)} <span class="src">(${srcLinks(g.after_steps_src)})</span></p>` : ''}

  <h2>Ready-to-paste prompts</h2>
  <p>${esc(g.prompts_intro)}${g.prompts_src.length ? ` <span class="src">(${srcLinks(g.prompts_src)})</span>` : ''}</p>
  <ol class="prompts">
${prompts}
  </ol>

  <h2>Common snags</h2>
  <ul class="snags">
    ${g.snags.map((s) => `<li>${esc(s.text)}${s.src.length ? ` <span class="src">(${srcLinks(s.src)})</span>` : ''}</li>`).join('\n    ')}
  </ul>

  <h2>Before you rely on it</h2>
  <div class="disclaimer">
    <p>General guidance, not professional, legal or clinical advice. Check the vendor's current terms. Not affiliated with ${esc(g.vendors_affiliation)}.</p>
  </div>

  <h2>Sources</h2>
  <ol class="sources">
    ${g.sources.map((s, i) => `<li id="src-${i + 1}">${ext(s.url, esc(s.title))}</li>`).join('\n    ')}
  </ol>

  <h2 id="report">Spotted something out of date?</h2>
  <p>Last checked: <time datetime="${g.checked_on}">${checked}</time>. Menus and prices change. If something here doesn't match what you see, <a href="mailto:${MAIL}?subject=${subject}">report a change</a> and we'll recheck it.</p>

  <h2>Changelog</h2>
  <ul class="changelog">
    ${g.changelog.map((c) => `<li><time datetime="${c.date}">${nice(c.date)}</time>: ${esc(c.text)}</li>`).join('\n    ')}
  </ul>

  ${preorderBlock(g.trade)}
</div>`;
  emit(url, page({ path: url, title: g.meta_title, description: g.description, main, scripts: '<script src="/js/stale-banner.js" defer></script>\n' }));
}

/* ---------- /measurements/ ---------- */
{
  const card = ['Business name:', 'Trade and town:', 'Who you serve:', 'Opening hours:', 'Price list (or a link to it):',
    'Cancellation or deposit policy:', 'My tone in 3 words:', 'How I sign off:', 'Words I never use:', "One thing I'm proud of:"];
  const example = ['Business name: Maple Hair (a made-up salon)', 'Trade and town: Hair salon in Leeds', 'Who you serve: Busy parents and students who want low-fuss cuts and colour',
    'Opening hours: Tue to Sat, 9am to 6pm; late night Thursday to 8pm', 'Price list (or a link to it): maplehair.example/prices',
    'Cancellation or deposit policy: 24 hours\u2019 notice to cancel or move, please', 'My tone in 3 words: warm, plain, unfussy',
    'How I sign off: See you soon, Jo', 'Words I never use: amazing, stunning, babe', "One thing I'm proud of: I show every client how to style their hair at home"];
  const main = `<div class="wrap narrow">
  <h1>Your measurements card</h1>
  <p class="lede">Ten short lines about your business. Every prompt in our guides starts with \u2018Use my measurements card below.\u2019 Fill it in once, keep it in your phone's notes, and paste it in after the prompt.</p>
  <p class="notice">This page is a template to copy, not a form. Fill it in wherever you keep notes. Leave out anything private: no client or patient details.</p>
  <h2 id="card-h">The card</h2>
  <pre id="card" class="card-template" tabindex="0" aria-labelledby="card-h">${esc(card.join('\n'))}</pre>
  <p><button type="button" id="copy-card" hidden>Copy the card</button> <span id="copy-status" role="status"></span></p>
  <p class="small">To copy it yourself, select the text in the box and copy it.</p>
  <h2 id="example-h">An example, filled in</h2>
  <p>This one is for a made-up salon, to show the kind of detail that helps.</p>
  <pre class="card-template" tabindex="0" aria-labelledby="example-h">${esc(example.join('\n'))}</pre>
  <h2>Tips</h2>
  <ul>
    <li>Keep each line short. A few words is enough.</li>
    <li>Write your tone and sign-off the way you'd say them, not how you think they should sound.</li>
    <li>Update the card when your prices, hours or policy change.</li>
  </ul>
  <p>Ready to use it? Start with a <a href="/#guides">free guide</a>, or <a href="/fit/">get fitted</a> first.</p>
</div>`;
  emit('/measurements/', page({
    path: '/measurements/',
    title: 'Your measurements card: a copy-paste template | Humanify It',
    description: 'A ten-line card about your business that every Humanify It prompt starts with. Copy it, fill it in once and reuse it. Nothing is stored or sent.',
    main,
    scripts: '<script src="/js/copy-card.js" defer></script>\n',
  }));
}

/* ---------- /preorder/<trade>-<price>/ ---------- */
for (const trade of TRADES) {
  const t = data.trades[trade];
  const free = guides[data.free_guide[trade]];
  for (const [code, price] of PRICES) {
    const other = PRICES.find(([c]) => c !== code);
    const h1 = code === '499' ? `Pre-order the ${t.kit}, ${price}` : `${t.kit} + 12 months of updates, ${price}`;
    const otherLabel = other[0] === '499' ? `the ${t.kit} on its own, ${other[1]}` : `the kit with 12 months of updates, ${other[1]}`;
    const main = `<div class="wrap narrow">
  <p class="eyebrow">Pre-order, no payment now</p>
  <h1>${esc(h1)}</h1>
  <p class="notice">The ${esc(t.kit)} isn't ready yet. Leave your email and we'll email you when it is. There's nothing to pay now.</p>
  <h2>What we plan to put in it</h2>
  <ul>
    <li>All three ${esc(t.name.toLowerCase())} guides, step by step, with checked-on dates.</li>
    <li>The \u2018same settings in other apps\u2019 sections, for the other apps ${esc(t.name.toLowerCase())}s use.</li>
    <li>More ready-to-paste prompts that start from your measurements card.</li>
    <li>A one-page chart of which app fits you.</li>${code === '999' ? `
    <li>12 months of updates: we plan to recheck each guide every 90 days and add new ${esc(t.name.toLowerCase())} guides during the year.</li>` : ''}
  </ul>
  <form class="signup" method="get" action="${BEEHIIV}">
    <label for="po-email">Email me when the ${esc(t.kit)} is ready</label>
    <div class="row">
      <input id="po-email" name="email" type="email" autocomplete="email" required placeholder="you@yourbusiness.co.uk" aria-describedby="po-note">
      <input type="hidden" name="utm_source" value="humanifyit">
      <input type="hidden" name="utm_medium" value="preorder">
      <input type="hidden" name="utm_campaign" value="preorder-${trade}-${code}">
      <button type="submit">Email me</button>
    </div>
    <p id="po-note" class="small">You'll finish signing up on the page for our newsletter, Sutra and Signal, which is hosted by beehiiv. That's where we'll tell you when the kit is ready, along with our other updates. Unsubscribe at any time. See our <a href="/privacy.html">privacy note</a>.</p>
  </form>
  <p>Prefer ${esc(otherLabel)}? <a href="/preorder/${trade}-${other[0]}/">See that option</a>.</p>
  <p>In the meantime, the free ${esc(t.name.toLowerCase())} guide is ready: <a href="${free.url || '/guides/' + free.slug + '/'}">${esc(free.title)}</a>.</p>
</div>`;
    emit(`/preorder/${trade}-${code}/`, page({
      path: `/preorder/${trade}-${code}/`,
      title: `${h1} | Humanify It`,
      description: `The ${t.kit} isn't ready yet. Leave your email and we'll tell you when it is. Pre-order, no payment now.`,
      main,
    }));
  }
}

/* ---------- sitemap.xml ---------- */
{
  const file = path.join(ROOT, 'sitemap.xml');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lastmod = {};
  for (const m of old.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) lastmod[m[1]] = m[2];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const all = ['/', '/tools/', ...pages, '/privacy.html'];
  const body = all.map((p) => {
    const loc = SITE + p;
    const mod = changed.includes(path.join(p.slice(1), 'index.html')) || !lastmod[loc] ? today : lastmod[loc];
    return `  <url><loc>${loc}</loc><lastmod>${mod}</lastmod></url>`;
  }).join('\n');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}

console.log(`Pages: ${pages.length}`);
console.log((CHECK ? 'Would change: ' : 'Changed: ') + (changed.join(', ') || 'nothing'));
if (CHECK && changed.length) process.exit(1);
