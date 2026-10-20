/* Humanify It "Get fitted" quiz and kit pages.
 * Plain JavaScript, no libraries. Answers live only in page memory and in the
 * URL hash (which browsers never send to a server). Nothing is stored, sent
 * or set as a cookie, and the data is read from the page itself, so there are
 * no network calls. The same file runs in Node (scripts/build_pages.mjs and
 * scripts/test_fit.mjs) to prerender the kit pages and test the rules. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  function money(x) { return x === 0 ? '£0' : '£' + r2(x).toFixed(2); }
  function niceDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '';
  }
  function kitSlug(trade, job) { return trade + '-' + job.replace(/_/g, '-'); }
  function opt(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === id) return list[i][1];
    return id;
  }

  /* ---------- answers and the URL hash ---------- */

  // "#t=solo&b=20&s=fresha&c=ok&u=chatgpt,canva" -> {t, b, s, c, u: []}
  function parseHash(hash) {
    var out = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = i < 0 ? pair : pair.slice(0, i);
      var v;
      try {
        v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1));
      } catch (e) {
        return; // malformed %-encoding (a hand-edited link): skip this pair
      }
      out[k] = k === 'u' ? (v ? v.split(',') : []) : v;
    });
    return out;
  }

  // Fill gaps and drop anything that isn't a valid answer for this trade.
  function normalise(data, trade, raw) {
    var d = data.kit_defaults, q = data.questions, a = {};
    raw = raw || {};
    function valid(list, v) { return list.some(function (o) { return o[0] === v; }); }
    a.t = valid(q.team.options, raw.t) ? raw.t : d.t;
    a.b = valid(q.budget.options, raw.b) ? raw.b : d.b;
    a.s = q.system[trade] && valid(q.system[trade], raw.s) ? raw.s : d.s;
    a.c = valid(q.comfort.options, raw.c) ? raw.c : d.c;
    a.u = (raw.u || []).filter(function (v, i, arr) {
      return v !== 'none' && data.already_used[v] && arr.indexOf(v) === i;
    });
    return a;
  }

  function toHash(a) {
    return 't=' + a.t + '&b=' + a.b + '&s=' + a.s + '&c=' + a.c + '&u=' + (a.u.length ? a.u.join(',') : 'none');
  }

  /* ---------- costs ---------- */

  function cost(tool, seats) {
    var p = tool.price;
    switch (p.model) {
      case 'flat': return p.gbp;
      case 'per_seat': return r2(p.gbp * seats);
      case 'solo_team': return seats === 1 ? p.solo : r2(p.per_member * seats);
      case 'base_plus': return r2(p.base + p.per_extra * (seats - 1));
    }
    throw new Error('unknown price model ' + p.model);
  }

  /* ---------- rules 2 to 9 ---------- */

  function resolve(data, trade, jobIn, ans) {
    // Rule 1 is handled by the quiz: "something else" never reaches a kit.
    if (trade === 'other' || !data.kits[trade]) return { other: true, trade: trade };
    var a = normalise(data, trade, ans);
    var job = jobIn === 'unsure' ? data.unsure[trade] : jobIn;
    var kit = data.kits[trade][job];
    if (!kit) throw new Error('no kit for ' + trade + '/' + jobIn);
    var seats = data.seats[a.t];                       // rule 5
    var cap = data.budget_caps[a.b];
    var tools = data.tools;
    var notes = [];
    function fam(id) { return (data.families && data.families[id]) || id; }

    // Rule 4: what they already use, by product family. Paid beats free.
    var usedFam = {};
    a.u.forEach(function (u) {
      var m = data.already_used[u];
      if (!usedFam[m.family] || m.status === 'existing_paid') usedFam[m.family] = m;
    });
    function place(id, status, role) {
      var m = usedFam[fam(id)];
      if (m) return { id: m.tool, status: m.status, role: role };
      return { id: id, status: status, role: role };
    }

    // Rules 2 and 3: base kit and the system slot.
    var slots = kit.slots.map(function (s) {
      if (s !== 'SYSTEM') return place(s, 'new', 'slot');
      if (a.c === 'simple' && a.s === 'none' && !kit.system_job) {
        notes.push('You asked to keep it simple, so we\'ve left out a booking or till system for now.');
        return { id: null, status: 'empty', role: 'system' };
      }
      if (a.s === 'none') return place(data.defaults[trade], 'new', 'system');
      if (a.s === 'other_app') return { id: 'other_app', status: 'current_app', role: 'system' };
      return { id: data.systems[trade][a.s], status: 'existing', role: 'system' };
    });

    function slotCost(s) { return s.id && tools[s.id] ? cost(tools[s.id], seats) : 0; }
    function newSpend() {
      return r2(slots.reduce(function (t, s) { return t + (s.status === 'new' ? slotCost(s) : 0); }, 0));
    }
    function inKit(f, except) {
      return slots.some(function (s, j) { return j !== except && s.id && fam(s.id) === f; });
    }

    // Rule 6: budget cap.
    for (var guard = 0; newSpend() > cap && guard < 20; guard++) {
      var idx = -1, max = 0;
      slots.forEach(function (s, i) {
        if (s.status === 'new' && slotCost(s) > max) { max = slotCost(s); idx = i; }
      });
      if (idx < 0) break;
      var cur = slots[idx], alt = tools[cur.id].cheaper_alt, next;
      if (alt) next = place(alt, 'new', cur.role);
      else {
        var f = data.fillers.filter(function (x) { return !inKit(fam(x), idx); })[0];
        next = f ? place(f, 'new', 'filler') : { id: null, status: 'empty', role: 'filler' };
      }
      next.orig = cur.orig || cur.id;
      slots[idx] = next;
    }

    // Rule 7: dedupe by product family, and fill any empty slot.
    var seen = {};
    slots.forEach(function (s, i) {
      if (s.id && !seen[fam(s.id)]) { seen[fam(s.id)] = true; return; }
      var f = data.fillers.filter(function (x) {
        return !seen[fam(x)] && !slots.some(function (o, j) { return j > i && o.id && fam(o.id) === fam(x); });
      })[0];
      var orig = s.orig;
      slots[i] = f ? place(f, 'new', 'filler') : { id: null, status: 'empty', role: 'filler' };
      if (orig) slots[i].orig = orig;
      if (f) seen[fam(f)] = true;
    });
    // Say what the budget changed, comparing each slot's first tool with its last.
    slots.forEach(function (s) {
      if (!s.orig || s.orig === s.id) return;
      notes.push(s.id ? 'To keep within your budget, we\'ve swapped ' + tools[s.orig].name + ' for ' + tools[s.id].name + '.'
        : 'To keep within your budget, we\'ve left out ' + tools[s.orig].name + '.');
    });
    slots = slots.filter(function (s) { return s.id; });

    // Costs and totals (rule 9).
    var spend = 0, total = 0, newApprox = false, totalApprox = false, unknown = false;
    slots.forEach(function (s) {
      if (s.id === 'other_app') { s.cost = null; unknown = true; return; }
      var t = tools[s.id];
      s.cost = cost(t, seats);
      s.approx = t.status === 'recheck';
      total += s.cost;
      if (s.approx) totalApprox = true;
      if (s.status === 'new') { spend += s.cost; if (s.approx) newApprox = true; }
      if (seats > 1 && t.team_note) notes.push(t.name + ': ' + t.team_note);
    });
    if (a.t === 'large') notes.unshift(data.large_team_note);

    // Rule 8: guides.
    var g = kit.guide, gt = data.guide_tool[g];
    var at = kit.system_job ? kit.slots.indexOf('SYSTEM') : kit.slots.indexOf(gt);
    var resolved = null;
    // Find what now sits where the guide's tool was (slots keep their order unless one was dropped).
    var fullSlots = slots.length === kit.slots.length;
    if (fullSlots) resolved = slots[at];
    else resolved = slots.filter(function (s) { return s.id && fam(s.id) === fam(gt); })[0] || null;
    var primary = { id: g, role: 'primary' };
    if (!resolved || !resolved.id) primary.without = gt;
    else if (fam(resolved.id) !== fam(gt)) {
      if (data.guides[g].appendix.indexOf(resolved.id) >= 0) primary.appendix = resolved.id;
      else primary.without = gt;
    }
    var guides = [primary];
    var free = data.free_guide[trade];
    if (free !== g) guides.push({ id: free, role: 'free' });
    // Interpretation: when the kit keeps a booking or till system and the primary
    // guide isn't the trade's system guide, point to the system guide (or its
    // appendix for the system they already use). Matches worked example 3.
    var sg = data.system_guide[trade];
    var sys = slots.filter(function (s) { return s.role === 'system'; })[0];
    if (sg !== g && sg !== free && sys) {
      if (sys.id === data.guide_tool[sg]) guides.push({ id: sg, role: 'system' });
      else if (data.guides[sg].appendix.indexOf(sys.id) >= 0) guides.push({ id: sg, role: 'system', appendix: sys.id });
    }

    // Rule 9: optional upgrade for tinkerers, never added to the totals.
    var upgrade = null;
    if (a.c === 'tinker') {
      var up = data.tinker_upgrade[trade];
      if (!slots.some(function (s) { return s.id === up; })) {
        upgrade = { id: up, cost: cost(tools[up], seats), approx: tools[up].status === 'recheck' };
      }
    }

    return {
      trade: trade, job: job, answers: a, seats: seats, cap: cap, slots: slots,
      newSpend: r2(spend), kitTotal: r2(total), newApprox: newApprox, totalApprox: totalApprox,
      unknownExisting: unknown, notes: notes, guides: guides, upgrade: upgrade
    };
  }

  /* ---------- rendering ---------- */

  var TAGS = {
    'new': 'New for you',
    existing: 'You already have this',
    existing_paid: 'You already pay for this',
    current_app: 'Your current app'
  };

  function priceLine(data, s, seats) {
    if (s.id === 'other_app') return '£0 extra. We don\'t know what you pay for it, so it isn\'t in the totals.';
    var t = data.tools[s.id], p = t.price;
    var checked = ' (checked ' + niceDate(t.checked) + ')';
    var ax = s.approx ? 'approx. ' : '';
    var vat = t.vat === 'excl' ? ' + VAT' : '';
    var amount;
    if (s.cost === 0) amount = 'Free';
    else {
      amount = ax + money(s.cost) + ' a month' + vat;
      if (seats > 1 && p.model === 'per_seat') amount += ' (' + seats + ' × ' + money(p.gbp) + ')';
      if (seats > 1 && p.model === 'solo_team') amount += ' (' + seats + ' × ' + money(p.per_member) + ')';
      if (seats > 1 && p.model === 'base_plus') amount += ' (' + money(p.base) + ' + ' + (seats - 1) + ' × ' + money(p.per_extra) + ')';
    }
    if (s.status === 'new') return amount + checked;
    if (s.cost === 0) return '£0 extra. Free plan' + checked;
    return '£0 extra. You pay ' + amount.charAt(0).toLowerCase() + amount.slice(1) + ' for it now' + checked;
  }

  function answerList(data, trade, a) {
    var q = data.questions;
    var used = a.u.length ? a.u.map(function (u) { return opt(q.used.options, u); }).join(', ') : 'none of the ones we asked about';
    return '<ul class="fitted">' +
      '<li><span class="k">Team:</span> ' + esc(opt(q.team.options, a.t)) + '</li>' +
      '<li><span class="k">Bookings or payments now:</span> ' + esc(opt(q.system[trade], a.s)) + '</li>' +
      '<li><span class="k">Already using:</span> ' + esc(used) + '</li>' +
      '<li><span class="k">Budget for new tools:</span> ' + esc(opt(q.budget.options, a.b)) + '</li>' +
      '<li><span class="k">New apps:</span> ' + esc(opt(q.comfort.options, a.c)) + '</li></ul>';
  }

  function guideItem(data, trade, gd) {
    var g = data.guides[gd.id], kitName = data.trades[trade].kit;
    var tname = function (id) { return id === 'other_app' ? 'your current app' : data.tools[id].name; };
    var head = g.url ? '<a href="' + esc(g.url) + '">' + esc(g.title) + '</a> <span class="tag tag-free">Free guide</span>'
      : esc(g.title) + ' <span class="tag tag-soon">Part of the ' + esc(kitName) + ', not ready yet</span>';
    var extra = '';
    if (gd.appendix) extra = 'Includes a \u2018same settings in other apps\u2019 section for ' + esc(tname(gd.appendix)) + '.';
    else if (gd.without) extra = 'This guide covers ' + esc(data.tools[gd.without].name) + ', which isn\'t in your kit at these answers.';
    return '<li>' + head + (extra ? '<br><span class="small">' + extra + '</span>' : '') + '</li>';
  }

  // The tailored part of a kit page: everything inside #kit-result.
  function renderKit(data, trade, job, ans, opts) {
    opts = opts || {};
    var res = resolve(data, trade, job, ans), a = res.answers, h = [];
    var checkedOn = niceDate(data.version);
    h.push('<h2 id="fitted-h">' + (opts.starting ? 'A starting kit' : 'Fitted to your answers') + '</h2>');
    if (opts.starting) {
      h.push('<p>This is the kit for the answers below. <a href="/fit/">Get fitted</a> to tailor it to your business.</p>');
    } else {
      h.push('<p>Based on your answers. <a href="/fit/">Change your answers</a>.</p>');
    }
    h.push(answerList(data, trade, a));

    h.push('<h2 id="tools-h">Your three tools</h2>');
    h.push('<ol class="kit-tools">');
    res.slots.forEach(function (s) {
      var t = s.id === 'other_app' ? null : data.tools[s.id];
      var why = (data.why[s.id] && (data.why[s.id][res.job] || data.why[s.id]['default'])) || '';
      h.push('<li class="kit-tool">');
      h.push('<p class="tag tag-' + s.status.replace('_', '-') + '">' + TAGS[s.status] + '</p>');
      h.push(t ? '<h3><a href="' + esc(t.url) + '" rel="noopener" target="_blank">' + esc(t.name) +
        '<span class="vh"> (opens in a new tab)</span></a></h3>' : '<h3>Your current app</h3>');
      h.push('<p>' + esc(why) + '</p>');
      h.push('<p class="price">' + esc(priceLine(data, s, res.seats)) + '</p>');
      // note_team (optional) replaces note when the price line is already worked out per team member
      var note = t && (res.seats > 1 && t.note_team ? t.note_team : t.note);
      if (note) h.push('<p class="small">' + esc(note) + '</p>');
      h.push('</li>');
    });
    h.push('</ol>');

    var ax = function (on) { return on ? 'approx. ' : ''; };
    h.push('<div class="kit-cost">');
    h.push('<p><span class="k">New spend per month:</span> <strong>' + ax(res.newApprox) + money(res.newSpend) + '</strong>' +
      (res.newSpend === 0 ? ' (nothing new to pay for)' : '') + '</p>');
    h.push('<p><span class="k">Kit total, including what you already pay:</span> <strong>' + ax(res.totalApprox) +
      money(res.kitTotal) + ' a month</strong>' + (res.unknownExisting ? ', plus whatever you pay for your current app' : '') + '</p>');
    h.push('<p class="small">Prices are per month, as each vendor quotes them. Most are before VAT, and we\'ve marked \u2018+ VAT\u2019 where the vendor says so. Card fees are extra wherever you take payments. \u2018approx.\u2019 means the figure was converted from dollars or euros, or taken from a guide rather than the vendor\'s own UK page, so check it before you buy. Prices checked on ' + esc(checkedOn) + '.</p>');
    h.push('</div>');

    if (res.notes.length) {
      h.push('<ul class="kit-notes">');
      res.notes.forEach(function (n) { h.push('<li>' + esc(n) + '</li>'); });
      h.push('</ul>');
    }

    if (res.upgrade) {
      var u = data.tools[res.upgrade.id];
      h.push('<div class="kit-upgrade"><h3>Optional upgrade, not included in the totals</h3>');
      h.push('<p><a href="' + esc(u.url) + '" rel="noopener" target="_blank">' + esc(u.name) + '<span class="vh"> (opens in a new tab)</span></a>: ' +
        esc(ax(res.upgrade.approx) + money(res.upgrade.cost) + ' a month' + (res.seats > 1 && u.price.model === 'per_seat' ? ' for ' + res.seats + ' people' : '') +
        ' (checked ' + niceDate(u.checked) + ').') + ' ' + esc((data.why[u.id] && data.why[u.id]['default']) || '') + (u.note ? ' ' + esc(u.note) : '') + '</p></div>');
    }

    h.push('<h2 id="guides-h">Your guides</h2>');
    h.push('<ul class="kit-guides">');
    res.guides.forEach(function (gd) { h.push(guideItem(data, trade, gd)); });
    h.push('</ul>');
    return h.join('\n');
  }

  /* ---------- browser ---------- */

  function readData() {
    var el = document.getElementById('fit-data');
    return el ? JSON.parse(el.textContent) : null;
  }

  function initKit(data) {
    var body = document.body, out = document.getElementById('kit-result');
    var trade = body.getAttribute('data-trade'), job = body.getAttribute('data-job');
    function show() {
      if (!location.hash || location.hash.length < 2) return;
      var raw = parseHash(location.hash);
      out.innerHTML = renderKit(data, trade, job, raw, { starting: false });
    }
    window.addEventListener('hashchange', show);
    show();
  }

  function initQuiz(data) {
    var form = document.getElementById('quiz');
    if (!form) return;
    var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
    var progress = document.getElementById('quiz-progress');
    var error = document.getElementById('quiz-error');
    var back = document.getElementById('quiz-back'), next = document.getElementById('quiz-next');
    var other = document.getElementById('quiz-other');
    var at = 0;

    function val(name) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    }
    function trade() { return val('trade'); }
    function current() { return steps[at]; }
    function variant(step) {
      // Steps 3 and 5 have one fieldset per trade; show the right one.
      var t = trade(), sets = step.querySelectorAll('fieldset[data-for]');
      var chosen = null;
      Array.prototype.forEach.call(sets, function (f) {
        var on = f.getAttribute('data-for') === t;
        f.hidden = !on;
        if (on) chosen = f;
      });
      return chosen;
    }
    function render(focus) {
      steps.forEach(function (s, i) { s.hidden = i !== at; });
      variant(current());
      var sub = document.getElementById('q-other-trades');
      if (sub) sub.hidden = trade() !== 'other';
      progress.textContent = 'Question ' + (at + 1) + ' of ' + steps.length;
      back.hidden = at === 0;
      next.textContent = at === steps.length - 1 ? 'See my kit' : 'Next';
      error.textContent = '';
      error.hidden = true;
      if (focus) {
        var hd = current().querySelector('fieldset:not([hidden]) .q');
        if (hd) hd.focus();
      }
    }
    function answered() {
      var step = current(), name = step.getAttribute('data-name');
      if (name === 'used') return true;
      if (name === 'trade') {
        if (!trade()) return false;
        if (trade() === 'other' && !val('other_trade')) return 'Choose the trade closest to yours.';
        return true;
      }
      var fs = variant(step);
      var input = (fs || step).querySelector('input:checked');
      return !!input;
    }
    function fail(msg) {
      error.textContent = typeof msg === 'string' ? msg : 'Choose an answer to carry on.';
      error.hidden = false;
      var first = current().querySelector('fieldset:not([hidden]) input');
      if (first) first.focus();
    }
    function showOther() {
      var id = val('other_trade');
      var t = data.other_trades.filter(function (o) { return o.id === id; })[0];
      if (!t) return;
      form.hidden = true;
      other.hidden = false;
      other.querySelector('[data-other-link]').setAttribute('href', '/tools/#' + t.anchor);
      other.querySelector('[data-other-name]').textContent = t.name;
      other.querySelector('input[name="utm_campaign"]').value = 'quiz-other-' + t.id;
      other.querySelector('h2').focus();
    }
    function finish() {
      var t = trade();
      var job = val('job_' + t);
      var used = Array.prototype.map.call(form.querySelectorAll('input[name="used"]:checked'), function (c) { return c.value; });
      var a = normalise(data, t, { t: val('team'), b: val('budget'), s: val('system_' + t), c: val('comfort'), u: used });
      if (job === 'unsure') job = data.unsure[t];
      location.assign('/kit/' + kitSlug(t, job) + '/#' + toHash(a));
    }

    // "None of these" clears the other ticks, and the other ticks clear "None".
    form.addEventListener('change', function (e) {
      var el = e.target;
      if (el.name === 'used') {
        Array.prototype.forEach.call(form.querySelectorAll('input[name="used"]'), function (c) {
          if (el.checked && c !== el && (el.value === 'none' || c.value === 'none')) c.checked = false;
        });
      }
      if (el.name === 'trade') render(false);
      if (!error.hidden) { error.hidden = true; error.textContent = ''; }
    });
    // Next is the form's submit button, so Enter works too; only the submit event moves on.
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = answered();
      if (ok !== true) return fail(ok);
      if (at === 0 && trade() === 'other') return showOther();
      if (at === steps.length - 1) return finish();
      at++;
      render(true);
    });
    back.addEventListener('click', function () {
      if (at > 0) { at--; render(true); }
    });
    var restart = document.getElementById('quiz-restart');
    if (restart) restart.addEventListener('click', function () {
      other.hidden = true; form.hidden = false; at = 0; render(true);
    });

    form.hidden = false;
    var list = document.getElementById('kit-list');
    if (list) list.hidden = true;
    render(false);
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    var start = function () {
      var data = readData();
      if (!data) return;
      var page = document.body.getAttribute('data-page');
      if (page === 'kit') initKit(data);
      if (page === 'fit') initQuiz(data);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return {
    parseHash: parseHash, normalise: normalise, toHash: toHash, cost: cost, resolve: resolve,
    renderKit: renderKit, kitSlug: kitSlug, niceDate: niceDate, money: money, esc: esc
  };
});
