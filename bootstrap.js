(function () {
  var boot = function () { return document.querySelector('.boot') }
  var show = function (html) { var b = boot(); if (b) b.innerHTML = '<div>' + html + '<p><button onclick="location.reload()">Reload</button></p></div>' }
  addEventListener('error', function (e) {
    if (!e.filename && (!e.message || e.message === 'Script error.')) return
    console.error(e.message || e)
    show('<p>Oranget hit an error while starting:</p><pre style="white-space:pre-wrap;font-size:14px">' + String(e.message || e).replace(/</g, '&lt;') + '</pre>')
  })
  setTimeout(function () { show('<p>Oranget is taking a while to start. Check your connection, then reload.</p>') }, 15000)
})()

// Oranget Duels 3D loader: loads duels3d.jsx after app.jsx is ready (no index.html edit needed)
;(function () {
  var tries = 0
  var iv = setInterval(function () {
    tries++
    if (tries > 600) return clearInterval(iv)
    if (typeof window.Babel === 'undefined' || typeof window.BlookBattle !== 'function' || typeof window.DuelEnd !== 'function') return
    clearInterval(iv)
    fetch('duels3d.jsx?v=' + Date.now()).then(function (r) { return r.text() }).then(function (src) {
      var out = window.Babel.transform(src, { presets: ['react'] }).code
      var s = document.createElement('script'); s.text = out; document.head.appendChild(s)
    }).catch(function (e) { console.error('Duels 3D failed to load', e) })
  }, 100)
})()
