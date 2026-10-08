(function () {
  var boot = function () { return document.querySelector('.boot') };
  var show = function (html) { var b = boot(); if (b) b.innerHTML = '<div>' + html + '<p><button onclick="location.reload()">Reload</button></p></div>'; };
  addEventListener('error', function (e) {
    if (!e.filename && (!e.message || e.message === 'Script error.')) return;
    console.error(e.message || e);
    show('<p>Oranget hit an error while starting:</p><pre style="white-space:pre-wrap;font-size:14px">' + String(e.message || e).replace(/</g, '&lt;') + '</pre>');
  });
  setTimeout(function () { show('<p>Oranget is taking a while to start. Check your connection, then reload.</p>'); }, 15000);
})();
