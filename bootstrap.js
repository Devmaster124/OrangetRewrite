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

// Speed bump only: blocks right-click and the usual Inspect shortcuts on desktop. Anyone can still open dev tools from the browser menu,
// so this does NOT make the game secure. Real protection has to live on the server (Firestore rules / Cloud Functions / App Check).
;(function () {
  if (/Mobi|Android|iPad|iPhone|iPod/i.test(navigator.userAgent)) return
  addEventListener('contextmenu', function (e) { e.preventDefault() })
  addEventListener('keydown', function (e) {
    var k = String(e.key || '').toLowerCase(), c = e.ctrlKey || e.metaKey
    if (e.key === 'F12' || (c && e.shiftKey && 'ijc'.indexOf(k) > -1) || (c && k === 'u') || (e.metaKey && e.altKey && 'iujc'.indexOf(k) > -1)) e.preventDefault()
  }, true)
})()
