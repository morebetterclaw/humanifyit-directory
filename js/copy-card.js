// Copy button for the measurements card. Uses the clipboard only when you press it.
// Without JavaScript (or clipboard access) the button stays hidden; select the text instead.
(function () {
  var btn = document.getElementById('copy-card');
  var card = document.getElementById('card');
  var status = document.getElementById('copy-status');
  if (!btn || !card || !navigator.clipboard) return;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    navigator.clipboard.writeText(card.textContent).then(function () {
      status.textContent = 'Copied. Paste it into your notes and fill it in.';
    }, function () {
      status.textContent = 'Couldn\u2019t copy. Select the text in the box and copy it instead.';
    });
  });
})();
