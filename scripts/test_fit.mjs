// Unit tests for the "Get fitted" rules (plan v2, section 1, rules 1 to 9).
// Run: node --test scripts/test_fit.mjs   (Node 18+, no packages)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Fit = require(path.join(ROOT, 'js/fit.js'));
const Stale = require(path.join(ROOT, 'js/stale-banner.js'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fit.json'), 'utf8'));

const run = (trade, job, hash) => Fit.resolve(data, trade, job, Fit.parseHash(hash));
const ids = (r) => r.slots.map((s) => s.id);
const byId = (r, id) => r.slots.find((s) => s.id === id);
const guideIds = (r) => r.guides.map((g) => g.id);

test('worked example 1: solo salon, phone/DMs, no-shows, £20, happy with apps', () => {
  const r = run('salon', 'no_shows', 't=solo&b=20&s=none&c=ok&u=none');
  assert.deepEqual(ids(r), ['fresha', 'chatgpt_free', 'canva_free']);
  assert.equal(r.newSpend, 14.95);
  assert.equal(r.newApprox, true, 'Fresha is a recheck price, so approx.');
  assert.deepEqual(guideIds(r), ['S2', 'S1']);
  const html = Fit.renderKit(data, 'salon', 'no_shows', Fit.parseHash('t=solo&b=20&s=none&c=ok&u=none'));
  assert.match(html, /approx\. £14\.95 a month \+ VAT \(checked 20 Oct 2026\)/);
  assert.match(html, /New spend per month:<\/span> <strong>approx\. £14\.95<\/strong>/);
});

test('worked example 2: same owner, free only, swaps Fresha for Square Appointments Free', () => {
  const r = run('salon', 'no_shows', 't=solo&b=0&s=none&c=ok&u=none');
  assert.deepEqual(ids(r), ['square_appointments_free', 'chatgpt_free', 'canva_free']);
  assert.equal(r.newSpend, 0);
  assert.equal(r.guides[0].id, 'S2');
  assert.equal(r.guides[0].appendix, 'square_appointments_free', "S2's Square appendix");
  assert.ok(r.notes.some((n) => /swapped Fresha for Square Appointments \(Free\)/.test(n)));
  const html = Fit.renderKit(data, 'salon', 'no_shows', Fit.parseHash('t=solo&b=0&s=none&c=ok&u=none'));
  assert.match(html, /No-show fees need Plus/);
});

test('worked example 3: 3-person physio on Cliniko, notes, £50', () => {
  const r = run('physio', 'notes', 't=small&b=50&s=cliniko&c=ok&u=none');
  assert.deepEqual(ids(r), ['heidi_free', 'cliniko', 'rehab_my_patient']);
  assert.equal(byId(r, 'cliniko').status, 'existing');
  assert.equal(r.newSpend, 11.42);
  assert.equal(r.kitTotal, 45.18);
  assert.equal(r.totalApprox, true, 'Cliniko is a recheck price');
  assert.deepEqual(r.guides.map((g) => [g.id, g.appendix || null]), [['P1', null], ['P2', 'cliniko']]);
  assert.ok(r.notes.some((n) => /Cliniko: .*1 practitioner/.test(n)));
});

test('rule 1: trade=other never builds a kit', () => {
  assert.equal(run('other', 'reviews', '').other, true);
  // and the quiz page carries the sign-up with the per-trade campaign set by JS
  const fit = fs.readFileSync(path.join(ROOT, 'fit/index.html'), 'utf8');
  assert.match(fit, /action="https:\/\/sutrasignal\.beehiiv\.com\/subscribe"/);
  assert.match(fit, /name="utm_campaign" value="quiz-other"/);
  assert.equal(data.other_trades.length, 5);
});

test('rule 2: base kit and primary guide for each of the 9 kits', () => {
  for (const [trade, jobs] of Object.entries(data.kits)) {
    for (const [job, kit] of Object.entries(jobs)) {
      const r = run(trade, job, 't=solo&b=50&s=none&c=ok&u=none');
      assert.equal(r.slots.length, 3, `${trade}/${job}`);
      assert.equal(r.guides[0].id, kit.guide);
    }
  }
});

test('rule 3: known system is "you already have this" at £0 extra', () => {
  const r = run('salon', 'no_shows', 't=solo&b=0&s=booksy&c=ok&u=none');
  const b = byId(r, 'booksy');
  assert.equal(b.status, 'existing');
  assert.equal(r.newSpend, 0);
  assert.equal(r.kitTotal, 40, 'Booksy counted in the kit total, not in new spend');
  assert.equal(r.guides[0].appendix, 'booksy', 'rule 8: Booksy has no guide, so S2 appendix');
});

test('rule 3: other_app is "your current app", unknown cost, appendix', () => {
  const r = run('physio', 'no_shows', 't=solo&b=20&s=other_app&c=ok&u=none');
  assert.equal(r.slots[0].id, 'other_app');
  assert.equal(r.slots[0].status, 'current_app');
  assert.equal(r.unknownExisting, true);
  assert.equal(r.guides[0].appendix, 'other_app');
  const html = Fit.renderKit(data, 'physio', 'no_shows', Fit.parseHash('t=solo&b=20&s=other_app&c=ok&u=none'));
  assert.match(html, /Your current app/);
  assert.match(html, /plus whatever you pay for your current app/);
});

test('rule 3: none uses the trade default', () => {
  assert.equal(run('salon', 'no_shows', 't=solo&b=50&s=none&c=ok').slots[0].id, 'fresha');
  assert.equal(run('cafe', 'stock', 't=solo&b=50&s=none&c=ok').slots[0].id, 'square_pos_free');
  assert.equal(run('physio', 'no_shows', 't=solo&b=50&s=none&c=ok').slots[0].id, 'writeupp');
});

test('rule 3 exception: simple + no system + non-system job drops the system slot for a filler', () => {
  const r = run('salon', 'social', 't=solo&b=50&s=none&c=simple&u=none');
  assert.deepEqual(ids(r), ['canva_free', 'chatgpt_free', 'google_business_profile']);
  assert.ok(r.notes.some((n) => /keep it simple/.test(n)));
  const cafe = run('cafe', 'social', 't=solo&b=50&s=none&c=simple&u=none');
  assert.ok(!cafe.slots.some((s) => s.role === 'system'));
  // not for a system job
  assert.equal(run('salon', 'no_shows', 't=solo&b=50&s=none&c=simple').slots[0].id, 'fresha');
  // not when they already have a system
  assert.equal(byId(run('salon', 'social', 't=solo&b=50&s=fresha&c=simple'), 'fresha').status, 'existing');
  // not for comfort ok
  assert.ok(ids(run('salon', 'social', 't=solo&b=50&s=none&c=ok')).includes('fresha'));
});

test('rule 4: already used, and paid versions labelled "you already pay for this"', () => {
  const free = run('salon', 'no_shows', 't=solo&b=20&s=none&c=ok&u=chatgpt,canva');
  assert.equal(byId(free, 'chatgpt_free').status, 'existing');
  assert.equal(byId(free, 'canva_free').status, 'existing');
  const paid = run('salon', 'no_shows', 't=solo&b=20&s=none&c=ok&u=chatgpt_paid,canva_pro');
  assert.deepEqual(ids(paid), ['fresha', 'chatgpt_plus', 'canva_pro']);
  assert.equal(byId(paid, 'chatgpt_plus').status, 'existing_paid');
  assert.equal(paid.newSpend, 14.95, 'paid tools they already have are not new spend');
  assert.equal(paid.kitTotal, 14.95 + 15 + 8.33);
  const both = run('cafe', 'reviews', 't=solo&b=0&s=none&c=ok&u=chatgpt,chatgpt_paid');
  assert.equal(both.slots[0].id, 'chatgpt_plus', 'paid wins when both are ticked');
  const gbp = run('cafe', 'reviews', 't=solo&b=0&s=none&c=ok&u=gbp');
  assert.equal(byId(gbp, 'google_business_profile').status, 'existing');
  const html = Fit.renderKit(data, 'salon', 'no_shows', Fit.parseHash('t=solo&b=20&s=none&c=ok&u=chatgpt_paid'));
  assert.match(html, /You already pay for this/);
});

test('rule 5: seats for costing, and the large-team note', () => {
  assert.equal(run('salon', 'no_shows', 't=small&b=50&s=none&c=ok').newSpend, 29.85); // 3 x 9.95
  assert.equal(run('physio', 'no_shows', 't=small&b=50&s=writeupp&c=ok').slots[0].cost, 59.85); // 3 x 19.95, already paid
  assert.equal(run('salon', 'no_shows', 't=large&b=50&s=booksy&c=ok').kitTotal, 65); // 40 + 5 x 5
  const large = run('salon', 'no_shows', 't=large&b=50&s=none&c=ok');
  assert.equal(large.notes[0], 'Bigger team: confirm team pricing with the vendor.');
  assert.ok(!run('salon', 'no_shows', 't=small&b=50&s=none&c=ok').notes.includes(data.large_team_note));
});

test('rule 6: budget swaps the most expensive new tool, then falls back to a filler', () => {
  // 6 x 9.95 = 59.70 > 50, Fresha swaps to Square Appointments Free
  assert.equal(run('salon', 'no_shows', 't=large&b=50&s=none&c=ok').slots[0].id, 'square_appointments_free');
  // WriteUpp 19.95 + Rehab 11.42 = 31.37 > 20: WriteUpp (no cheaper_alt) is the most expensive, so a filler replaces it
  const r = run('physio', 'notes', 't=solo&b=20&s=none&c=ok');
  assert.deepEqual(ids(r), ['heidi_free', 'chatgpt_free', 'rehab_my_patient']);
  assert.equal(r.newSpend, 11.42);
  // free only: Rehab My Patient swaps to its cheaper_alt
  const z = run('physio', 'exercises', 't=solo&b=0&s=none&c=ok');
  assert.equal(z.newSpend, 0);
  assert.ok(!ids(z).includes('rehab_my_patient'));
  // the cap is never exceeded, across every answer
  for (const [trade, jobs] of Object.entries(data.kits)) {
    for (const job of Object.keys(jobs)) {
      for (const t of ['solo', 'small', 'large']) for (const b of ['0', '20', '50']) {
        const res = run(trade, job, `t=${t}&b=${b}&s=none&c=ok`);
        assert.ok(res.newSpend <= +b, `${trade}/${job} ${t} ${b}: ${res.newSpend}`);
      }
    }
  }
});

test('rule 7: dedupe replaces a duplicate with the first unused filler', () => {
  // WriteUpp -> chatgpt_free (filler), then Rehab -> chatgpt_free (cheaper_alt) duplicates it -> canva_free
  const r = run('physio', 'notes', 't=solo&b=0&s=none&c=ok');
  assert.deepEqual(ids(r), ['heidi_free', 'chatgpt_free', 'canva_free']);
  // a duplicate family (paid version) counts as the same product
  const p = run('physio', 'exercises', 't=solo&b=0&s=none&c=ok&u=chatgpt_paid');
  const fams = p.slots.map((s) => data.families[s.id] || s.id);
  assert.equal(new Set(fams).size, fams.length);
});

test('rule 8: secondary guide is the trade free guide, only if not already primary', () => {
  assert.deepEqual(guideIds(run('cafe', 'stock', 't=solo&b=20&s=none&c=ok')), ['C2', 'C1']);
  assert.deepEqual(guideIds(run('cafe', 'reviews', 't=solo&b=20&s=none&c=simple')), ['C1']);
  assert.deepEqual(guideIds(run('physio', 'exercises', 't=solo&b=50&s=none&c=ok')), ['P3', 'P1', 'P2']);
  // a Booksy user picking no-shows gets S2's appendix
  assert.equal(run('salon', 'no_shows', 't=solo&b=50&s=booksy&c=ok').guides[0].appendix, 'booksy');
  // an existing paid ChatGPT is the same product as the guide's tool, so no appendix
  const c1 = run('cafe', 'reviews', 't=solo&b=0&s=none&c=ok&u=chatgpt_paid');
  assert.equal(c1.guides[0].appendix, undefined);
  assert.equal(c1.guides[0].without, undefined);
});

test('rule 9: tinker shows one optional upgrade that is not in the totals', () => {
  const r = run('physio', 'notes', 't=small&b=50&s=cliniko&c=tinker');
  assert.equal(r.upgrade.id, 'heidi_scribe');
  assert.equal(r.upgrade.cost, 135);
  assert.equal(r.newSpend, 11.42);
  assert.equal(r.kitTotal, 45.18);
  assert.equal(run('salon', 'social', 't=solo&b=50&s=none&c=tinker').upgrade.id, 'canva_pro');
  assert.equal(run('salon', 'social', 't=solo&b=50&s=none&c=ok').upgrade, null);
  assert.equal(run('salon', 'social', 't=solo&b=50&s=none&c=tinker&u=canva_pro').upgrade, null, 'already has it');
});

test('rule 9 output: every price is dated, recheck prices say approx., VAT note present', () => {
  for (const [trade, jobs] of Object.entries(data.kits)) {
    for (const job of Object.keys(jobs)) {
      const html = Fit.renderKit(data, trade, job, Fit.parseHash('t=small&b=50&s=none&c=tinker&u=chatgpt_paid'));
      const prices = [...html.matchAll(/<p class="price">([^<]*)<\/p>/g)].map((m) => m[1]);
      assert.equal(prices.length, 3);
      for (const p of prices) assert.match(p, /\(checked \d{1,2} [A-Z][a-z]{2} 2026\)$/, p);
      assert.match(html, /VAT/);
      assert.match(html, /Prices checked on 20 Oct 2026/);
    }
  }
  const html = Fit.renderKit(data, 'physio', 'notes', Fit.parseHash('t=solo&b=50&s=jane&c=ok'));
  assert.match(html, /You pay approx\. £44\.26 a month for it now/);
});

test('"not sure" maps to each trade default job', () => {
  assert.deepEqual(ids(run('salon', 'unsure', 't=solo&b=20&s=none&c=ok')), ids(run('salon', 'no_shows', 't=solo&b=20&s=none&c=ok')));
  assert.equal(run('cafe', 'unsure', 't=solo&b=20&s=none&c=ok').job, 'reviews');
  assert.equal(run('physio', 'unsure', 't=solo&b=20&s=none&c=ok').job, 'notes');
});

test('hash: round trip and bad values fall back to defaults', () => {
  const a = Fit.normalise(data, 'salon', Fit.parseHash('#t=small&b=50&s=fresha&c=tinker&u=chatgpt,canva'));
  assert.equal(Fit.toHash(a), 't=small&b=50&s=fresha&c=tinker&u=chatgpt,canva');
  const bad = Fit.normalise(data, 'cafe', Fit.parseHash('#t=huge&b=999&s=fresha&c=wild&u=evil,none,canva,canva'));
  assert.deepEqual(bad, { t: 'solo', b: '50', s: 'none', c: 'ok', u: ['canva'] });
  assert.equal(Fit.toHash(Fit.normalise(data, 'salon', {})), 't=solo&b=50&s=none&c=ok&u=none');
});

test('stale banner: shows only once more than 90 days have passed', () => {
  assert.equal(Stale.isStale('2026-10-20', new Date(2027, 0, 18)), false); // day 90
  assert.equal(Stale.isStale('2026-10-20', new Date(2027, 0, 19)), true); // day 91
  assert.equal(Stale.isStale('2026-10-20', new Date(2026, 9, 20)), false);
  assert.equal(Stale.isStale('not a date', new Date(2030, 0, 1)), false);
});

test('every answer combination gives 3 distinct tools within budget', () => {
  const used = [[], ['chatgpt'], ['chatgpt_paid'], ['canva_pro', 'gbp'], ['chatgpt', 'canva', 'gbp']];
  let n = 0;
  for (const [trade, jobs] of Object.entries(data.kits)) {
    const systems = data.questions.system[trade].map((o) => o[0]);
    for (const job of Object.keys(jobs)) for (const t of ['solo', 'small', 'large']) for (const s of systems)
      for (const b of ['0', '20', '50']) for (const c of ['simple', 'ok', 'tinker']) for (const u of used) {
        const r = Fit.resolve(data, trade, job, { t, b, s, c, u });
        const fams = r.slots.map((x) => data.families[x.id] || x.id);
        assert.equal(r.slots.length, 3, `${trade}/${job}/${t}/${s}/${b}/${c}/${u}`);
        assert.equal(new Set(fams).size, 3);
        assert.ok(r.newSpend <= +b);
        assert.ok(r.kitTotal >= r.newSpend);
        n++;
      }
  }
  assert.ok(n > 5000);
});
