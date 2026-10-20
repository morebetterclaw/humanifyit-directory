// Per-trade filter for the Humanify It directory.
// Without JavaScript the chips stay hidden and every listing shows, with
// "Jump to a trade" anchor links instead.
(function () {
  var bar = document.querySelector('.filter');
  if (!bar) return;
  var chips = Array.prototype.slice.call(bar.querySelectorAll('.chip'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.group[data-trade]'));
  var status = document.getElementById('filter-status');
  var jump = document.querySelector('.jump');

  function apply(filter, announce) {
    var shown = 0;
    groups.forEach(function (g) {
      var on = filter === 'all' || g.getAttribute('data-trade') === filter;
      g.hidden = !on;
      if (on) shown += g.querySelectorAll('.listing').length;
    });
    var label = 'all trades';
    chips.forEach(function (c) {
      var on = c.getAttribute('data-filter') === filter;
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && filter !== 'all') label = c.firstChild.textContent.trim();
    });
    if (announce && status) {
      status.textContent = filter === 'all' ? 'Showing all trades.' :
        'Showing ' + shown + (shown === 1 ? ' tool' : ' tools') + ' for ' + label + '.';
    }
  }

  chips.forEach(function (c) {
    c.addEventListener('click', function () { apply(c.getAttribute('data-filter'), true); });
  });

  // Links to a trade's anchor (from the tiles or elsewhere) switch the filter to it.
  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (groups.some(function (g) { return g.id === id; })) apply(id, false);
  }
  window.addEventListener('hashchange', fromHash);

  bar.hidden = false;
  if (jump) jump.hidden = true;
  apply('all', false);
  fromHash();
})();
