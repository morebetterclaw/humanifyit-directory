/* Shows "This guide may be out of date" once today is more than 90 days after
 * the guide's checked-on date (data-checked-on="YYYY-MM-DD" on <main>).
 * Deterministic, no backend, nothing stored. Also runs in Node for tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StaleBanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAYS = 90;

  // Whole days from checked-on to today, using calendar dates only.
  function isStale(checkedOn, today) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkedOn || '');
    if (!m) return false;
    var start = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return (now - start) / 86400000 > DAYS;
  }

  if (typeof document !== 'undefined') {
    var run = function () {
      var el = document.querySelector('[data-checked-on]');
      var slot = document.getElementById('stale-banner');
      if (!el || !slot || !isStale(el.getAttribute('data-checked-on'), new Date())) return;
      slot.innerHTML = '<p><strong>This guide may be out of date.</strong> We last checked it more than 90 days ago, ' +
        'so menus or prices may have changed. Check the vendor\'s own help pages linked below, and ' +
        '<a href="#report">tell us what\'s changed</a>.</p>';
      slot.hidden = false;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }
  return { isStale: isStale, DAYS: DAYS };
});
