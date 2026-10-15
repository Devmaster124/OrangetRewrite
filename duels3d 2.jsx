// =====================================================================
// Oranget Duels 3D  (drop-in upgrade, powered by three.js)
// Load AFTER app.jsx. It replaces: BlookBattle, DiceDuel, QuickDraw
// with real 3D scenes and adds 3D tilt to the duel menu cards.
// Uses globals from app.jsx: useState/useEffect/useRef, rint, byId, bstat,
// imgSrc, DuelEnd, Blook, BLOOKS, tierOf
// =====================================================================

// ---------- three.js loader ----------
function d3Load() {
  if (window.THREE) return Promise.resolve()
  if (window.__d3p) return window.__d3p
  return (window.__d3p = new Promise((ok, no) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    s.onload = ok; s.onerror = () => { window.__d3p = null; no(new Error('three.js failed to load')) }
    document.head.appendChild(s)
  }))
}

// ---------- styles ----------
;(function () {
  if (document.getElementById('d3-css')) return
  const s = document.createElement('style'); s.id = 'd3-css'
  s.textContent = `
  .d3-wrap{position:relative;border-radius:20px;overflow:hidden;border:2px solid var(--line,#3a4090);background:#0a0d2a;box-shadow:0 18px 40px rgba(0,0,0,.45)}
  .d3-stage{position:relative;width:100%;touch-action:manipulation;user-select:none}
  .d3-stage canvas{display:block;width:100%;height:100%}
  .d3-stage .d3-err{position:absolute;inset:0;display:grid;place-items:center;color:#fff;text-align:center;padding:1rem}
  .d3-hud{position:absolute;top:10px;width:42%;max-width:260px;pointer-events:none;color:#fff;text-shadow:0 2px 4px #000}
  .d3-hud.l{left:10px}.d3-hud.r{right:10px;text-align:right}
  .d3-hud .du-pips{justify-content:inherit}
  .d3-dmg{position:absolute;top:34%;font-family:inherit;font-weight:900;font-size:2.6rem;color:#fff;text-shadow:0 0 12px #ff3d81,0 3px 0 #000;pointer-events:none;animation:d3up 1s ease-out forwards}
  .d3-dmg.l{left:22%}.d3-dmg.r{right:22%}
  @keyframes d3up{0%{transform:translateY(20px) scale(.5);opacity:0}20%{transform:translateY(0) scale(1.3);opacity:1}100%{transform:translateY(-70px) scale(1);opacity:0}}
  .d3-top{position:absolute;top:8px;left:50%;transform:translateX(-50%);color:#fff;text-shadow:0 2px 4px #000;pointer-events:none;display:flex;gap:1rem;font-weight:900}
  .d3-top span{background:rgba(0,0,0,.45);padding:.15rem .8rem;border-radius:999px}
  .d3-big{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font-size:4rem;color:#fff;text-shadow:0 0 20px #ff3d81,0 4px 0 #000}
  .du-gc{transition:transform .15s ease-out,box-shadow .2s;transform-style:preserve-3d;will-change:transform}
  .du-gc.tilt{box-shadow:0 22px 40px rgba(0,0,0,.45)}
  `
  document.head.appendChild(s)
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.du-gc')
    document.querySelectorAll('.du-gc.tilt').forEach((x) => { if (x !== c) { x.classList.remove('tilt'); x.style.transform = '' } })
    if (c) { const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5; c.classList.add('tilt'); c.style.transform = `perspective(700px) rotateY(${px * 14}deg) rotateX(${-py * 14}deg) translateZ(8px)` }
  })
})()

// ---------- generic stage ----------
function Stage3D({ build, height = '22rem', onReady, onPointer, onMove, onLeave, children }) {
  const el = useRef(null), [err, setErr] = useState(false)
  useEffect(() => {
    let dead = false, raf = 0, R = null, off = null
    d3Load().then(() => {
      if (dead || !el.current) return
      const THREE = window.THREE, w = el.current.clientWidth || 600, h = el.current.clientHeight || 350
      R = new THREE.WebGLRenderer({ antialias: true }); R.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1)); R.setSize(w, h)
      R.outputEncoding = THREE.sRGBEncoding; R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap
      el.current.appendChild(R.domElement)
      const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 120)
      const ctx = { THREE, scene, cam, R, el: el.current, tick: [], clock: new THREE.Clock(), shake: 0, t: 0 }
      const api = build(ctx)
      const loop = () => {
        raf = requestAnimationFrame(loop)
        const dt = Math.min(0.05, ctx.clock.getDelta()); ctx.t += dt
        ctx.tick.slice().forEach((f) => f(dt, ctx.t))
        R.render(scene, cam)
      }
      loop()
      const rs = () => { if (!el.current) return; const w2 = el.current.clientWidth, h2 = el.current.clientHeight; if (!w2 || !h2) return; R.setSize(w2, h2); cam.aspect = w2 / h2; cam.updateProjectionMatrix() }
      window.addEventListener('resize', rs); off = () => window.removeEventListener('resize', rs)
      rs()
      onReady && onReady(api)
    }).catch(() => setErr(true))
    return () => { dead = true; cancelAnimationFrame(raf); off && off(); if (R) { R.dispose(); R.domElement.remove() } }
  }, [])
  return <div ref={el} className="d3-stage" style={{ height }} onPointerDown={onPointer} onPointerMove={onMove} onPointerLeave={onLeave}>{err && <div className="d3-err">3D could not load. Check your connection and reload.</div>}{children}</div>
}

// ---------- tiny helpers ----------
const d3tw = (ctx, dur, fn, done) => {
  let t = 0
  const f = (dt) => { t += dt; const k = Math.min(1, t / dur); fn(k, dt); if (k >= 1) { const i = ctx.tick.indexOf(f); if (i >= 0) ctx.tick.splice(i, 1); done && done() } }
  ctx.tick.push(f)
}
const d3tex = (THREE, id) => {
  try {
    const b = byId(id) || {}, src = (b.spr && IMG[b.spr]) || imgSrc(id, 256) || IMG[b.inv || b.img]
    if (!src) return null
    const t = new THREE.TextureLoader().load(src); t.encoding = THREE.sRGBEncoding; return t
  } catch (e) { return null }
}
function d3burst(ctx, pos, color, n = 40, spd = 4) {
  const { THREE } = ctx, g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = []
  for (let i = 0; i < n; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z; v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(spd * (0.4 + Math.random()))) }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  const m = new THREE.PointsMaterial({ color, size: 0.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), pts = new THREE.Points(g, m)
  pts.frustumCulled = false; ctx.scene.add(pts)
  d3tw(ctx, 0.9, (k, dt) => { for (let i = 0; i < n; i++) { v[i].y -= 6 * dt; p[i * 3] += v[i].x * dt; p[i * 3 + 1] += v[i].y * dt; p[i * 3 + 2] += v[i].z * dt } g.attributes.position.needsUpdate = true; m.opacity = 1 - k }, () => { ctx.scene.remove(pts); g.dispose(); m.dispose() })
}
function d3wave(ctx, pos, color, size = 5) {
  const { THREE } = ctx, m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = 0.3; ctx.scene.add(m)
  d3tw(ctx, 0.6, (k) => { m.scale.setScalar(1 + k * size); m.material.opacity = 1 - k }, () => { ctx.scene.remove(m); m.geometry.dispose(); m.material.dispose() })
}
function d3stars(ctx, n = 260, spread = 40, ymin = 2) {
  const { THREE } = ctx, p = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * spread * 2; p[i * 3 + 1] = ymin + Math.random() * 18; p[i * 3 + 2] = -6 - Math.random() * spread }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.8 })); ctx.scene.add(s)
  ctx.tick.push((dt) => { s.rotation.y += dt * 0.01 })
}
function d3fighter(ctx, x, flip, baseColor = 0x2a2f6b) {
  const { THREE } = ctx, g = new THREE.Group(); g.position.set(x, 0, 0)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.28, 40), new THREE.MeshStandardMaterial({ color: baseColor, metalness: 0.6, roughness: 0.3, emissive: baseColor, emissiveIntensity: 0.35 }))
  base.position.y = 0.14; base.castShadow = base.receiveShadow = true; g.add(base)
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, side: THREE.DoubleSide })
  const body = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), mat); body.position.y = 1.65; g.add(body)
  if (flip) body.scale.x = -1
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1.2, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }))
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.3; g.add(sh)
  const glow = new THREE.PointLight(0xffffff, 0, 9); glow.position.set(0, 2, 1.5); g.add(glow)
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.9, 28, 18), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  shield.position.y = 1.6; g.add(shield)
  ctx.scene.add(g)
  const F = { g, body, mat, glow, shield, x, y: 1.65, busy: false, set(id) { mat.map = d3tex(THREE, id); body.visible = !!mat.map; mat.needsUpdate = true } }
  ctx.tick.push((dt, t) => { if (!F.busy) { body.position.y = F.y + Math.sin(t * 2 + x) * 0.08; body.rotation.y = Math.sin(t * 0.9 + x) * 0.14 } })
  return F
}

// ---------- Blook Battle arena ----------
function d3Arena(ctx) {
  const { THREE, scene, cam } = ctx
  scene.background = new THREE.Color(0x0a0d2a); scene.fog = new THREE.Fog(0x0a0d2a, 12, 34)
  scene.add(new THREE.AmbientLight(0x8899ff, 0.75))
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(3, 9, 6); dl.castShadow = true; scene.add(dl)
  const p1 = new THREE.PointLight(0x38e8ff, 1.5, 18); p1.position.set(-6, 3, 2); scene.add(p1)
  const p2 = new THREE.PointLight(0xff3d81, 1.5, 18); p2.position.set(6, 3, 2); scene.add(p2)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 72), new THREE.MeshStandardMaterial({ color: 0x141a4a, metalness: 0.55, roughness: 0.35 }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
  const ring = (r, c, w = 0.06) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 96), new THREE.MeshBasicMaterial({ color: c })); m.rotation.x = Math.PI / 2; m.position.y = 0.03; scene.add(m); return m }
  const r1 = ring(6.2, 0x38e8ff, 0.09); ring(4.2, 0xff3d81, 0.04); ring(1.2, 0xffd34d, 0.04)
  const pil = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, h = 2.5 + (i % 3) * 1.1
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), new THREE.MeshStandardMaterial({ color: 0x1b2266, emissive: i % 2 ? 0xff3d81 : 0x38e8ff, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.4 }))
    m.position.set(Math.cos(a) * 8.6, h / 2, Math.sin(a) * 8.6 - 2); m.castShadow = true; scene.add(m)
    const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3d81 : 0x38e8ff })); top.position.set(m.position.x, h + 0.7, m.position.z); scene.add(top); pil.push(top)
  }
  d3stars(ctx)
  cam.position.set(0, 3.6, 9.6)
  const F = { P: d3fighter(ctx, -2.9, false, 0x1d6f8a), B: d3fighter(ctx, 2.9, true, 0x8a1d55) }
  ctx.tick.push((dt, t) => {
    r1.rotation.z += dt * 0.2; pil.forEach((p, i) => { p.rotation.y += dt * 1.5; p.position.y += Math.sin(t * 2 + i) * 0.003 })
    ctx.shake *= 0.88
    cam.position.x = Math.sin(t * 0.3) * 0.9 + (Math.random() - 0.5) * ctx.shake
    cam.position.y = 3.6 + Math.sin(t * 0.4) * 0.15 + (Math.random() - 0.5) * ctx.shake
    cam.lookAt(0, 1.5, 0)
  })
  const hit = (d, color, ko) => {
    d.busy = true; d.mat.color.set(0xff5555); d.glow.color.set(0xff3030); d.glow.intensity = 3
    const x0 = d.g.position.x, dir = d.x < 0 ? -1 : 1
    d3burst(ctx, new THREE.Vector3(d.x, 1.8, 0.5), color, 50, 5); d3wave(ctx, new THREE.Vector3(d.x, 0, 0), color, 3.5); ctx.shake = 1.2
    d3tw(ctx, 0.45, (k) => { d.g.position.x = x0 + dir * Math.sin(k * Math.PI) * 0.8; d.glow.intensity = 3 * (1 - k); d.mat.color.lerpColors(new THREE.Color(0xff5555), new THREE.Color(0xffffff), k) }, () => { d.busy = false; d.glow.intensity = 0 })
  }
  return {
    set(p, b) { F.P.set(p); F.B.set(b); ['P', 'B'].forEach((s) => { const d = F[s]; d.g.rotation.z = 0; d.g.position.set(d.x, 0, 0); d.body.position.y = d.y; d.mat.opacity = 1; d.mat.transparent = true; d.busy = false; d.shield.material.opacity = 0 }) },
    act(side, kind) {
      const a = F[side], d = F[side === 'P' ? 'B' : 'P'], dir = side === 'P' ? 1 : -1, reach = Math.abs(d.x - a.x) - 2.7, col = side === 'P' ? 0x38e8ff : 0xff3d81
      if (kind === 'guard') { a.shield.material.opacity = 0.35; d3wave(ctx, new THREE.Vector3(a.x, 0, 0), 0x4fd8ff, 2.5); d3tw(ctx, 1.1, (k) => { a.shield.scale.setScalar(1 + Math.sin(k * Math.PI * 4) * 0.04); a.shield.material.opacity = 0.35 * (1 - k * k) }, () => { a.shield.material.opacity = 0 }); return }
      const ult = kind === 'ult', lunge = () => {
        let hitDone = false; a.busy = true
        d3tw(ctx, ult ? 0.7 : 0.6, (k) => {
          const p = k < 0.5 ? k * 2 : 2 - k * 2, e = p * p * (3 - 2 * p)
          a.g.position.x = a.x + dir * reach * e; a.body.position.y = a.y + Math.sin(k * Math.PI) * 0.6; a.body.rotation.z = -dir * Math.sin(k * Math.PI) * 0.35
          if (!hitDone && k >= 0.5) { hitDone = true; hit(d, ult ? 0xffd34d : col); if (ult) { d3wave(ctx, new THREE.Vector3(d.x, 0, 0), 0xffd34d, 7); ctx.shake = 2.8 } }
        }, () => { a.g.position.x = a.x; a.body.rotation.z = 0; a.busy = false; a.glow.intensity = 0; a.body.scale.set(a.body.scale.x < 0 ? -1 : 1, 1, 1) })
      }
      if (ult) { a.busy = true; a.glow.color.set(0xffd34d); d3tw(ctx, 0.55, (k) => { a.glow.intensity = 4 * k; a.body.position.y = a.y + k * 0.7; const s = 1 + k * 0.25, sg = a.body.scale.x < 0 ? -1 : 1; a.body.scale.set(sg * s, s, 1); a.mat.color.setRGB(1 + k, 1 + k * 0.6, 1) }, () => { a.mat.color.set(0xffffff); lunge() }) } else lunge()
    },
    ko(side) { const d = F[side]; d.busy = true; d3burst(ctx, new THREE.Vector3(d.x, 1.6, 0), 0xffffff, 70, 6); d3tw(ctx, 0.9, (k) => { d.g.rotation.z = (d.x < 0 ? 1 : -1) * k * 1.4; d.g.position.y = -k * 0.4; d.mat.opacity = 1 - k * 0.7 }) },
  }
}

function BlookBattle({ user, rep, lv, onBack }) {
  const mine = useMemo(() => [...new Set(user.inv)].filter((id) => byId(id)).sort((a, b) => RKD.indexOf(byId(b).rarity) - RKD.indexOf(byId(a).rarity)).slice(0, 80), [])
  const [sel, setSel] = useState(null), [f, setF] = useState(null), [res, setRes] = useState(null), [api, setApi] = useState(null)
  const start = (id) => {
    const p = bstat(id), pool = BLOOKS.filter((b) => b.rarity !== 'owner' && RKD.indexOf(b.rarity) >= Math.max(0, p.ri - 1) && RKD.indexOf(b.rarity) <= p.ri && !b.id.startsWith('cd_')), bb = pool.length ? pool[rint(0, pool.length - 1)] : BLOOKS[0], b = bstat(bb.id); b.atk *= [0.8, 1, 1.2][lv]
    setRes(null); setF({ P: { ...p, hp: p.max, ch: 0, g: false }, B: { ...b, hp: b.max, ch: 0, g: false }, turn: 'p', log: 'Your move!', hit: null, dmg: null, k: 0, last: null })
  }
  const strike = (A, D, kind) => {
    A = { ...A, g: false }; D = { ...D }
    if (kind === 'guard') { A.g = true; A.hp = Math.min(A.max, A.hp + Math.round(A.max * 0.08)); return [A, D, `${A.name} raises a guard!`, 0] }
    const ult = kind === 'ult'; let dmg = A.atk * (0.85 + Math.random() * 0.3) * (ult ? 2.4 : 1); const crit = !ult && Math.random() < 0.12; if (crit) dmg *= 1.6
    if (D.g) dmg *= 0.4; dmg = Math.round(dmg); D.hp = Math.max(0, D.hp - dmg); A.ch = ult ? 0 : Math.min(3, A.ch + 1)
    return [A, D, `${A.name} ${ult ? 'unleashes an ULTIMATE' : crit ? 'lands a CRITICAL hit' : 'hits'} for ${dmg}!`, dmg]
  }
  const act = (kind) => {
    if (!f || f.turn !== 'p' || f.P.hp <= 0) return
    if (kind === 'ult' && f.P.ch < 3) return
    const [P, B, t, d] = strike(f.P, f.B, kind)
    setF({ ...f, P, B, log: t, hit: kind === 'guard' ? null : 'B', dmg: d, k: f.k + 1, last: { by: 'P', kind }, turn: B.hp <= 0 ? 'end' : 'b' })
  }
  useEffect(() => {
    if (!f || f.turn !== 'b') return
    const t = setTimeout(() => {
      const kind = f.B.ch >= 3 && Math.random() < 0.75 ? 'ult' : f.B.hp < f.B.max * 0.35 && Math.random() < 0.35 ? 'guard' : 'atk'
      const [B, P, tx, d] = strike(f.B, f.P, kind)
      setF({ ...f, P, B, log: tx, hit: kind === 'guard' ? null : 'P', dmg: d, k: f.k + 1, last: { by: 'B', kind }, turn: P.hp <= 0 ? 'end' : 'p' })
    }, 1500)
    return () => clearTimeout(t)
  }, [f && f.turn, f && f.k])
  useEffect(() => { if (api && f) api.set(f.P.id, f.B.id) }, [api, f && f.P.id, f && f.B.id])
  useEffect(() => { if (api && f && f.k > 0 && f.last) api.act(f.last.by, f.last.kind) }, [f && f.k])
  useEffect(() => {
    if (!f || f.turn !== 'end' || res) return
    const win = f.B.hp <= 0, tok = win ? 20 + f.B.ri * 5 : 0
    const t1 = setTimeout(() => api && api.ko(win ? 'B' : 'P'), 650), t = setTimeout(() => setRes({ win, ...rep(win, tok) }), 1900)
    return () => { clearTimeout(t); clearTimeout(t1) }
  }, [f && f.turn])
  if (!f) return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Blook Battle</h3>
      <p className="text-sm opacity-80">Pick one of your blooks to fight. Rarer blooks have more health and hit harder. Attack to charge, then use the Ultimate at 3 charges.</p>
      <div className="du-pick">{mine.map((id) => <button key={id} className={sel === id ? 'on' : ''} onClick={() => setSel(id)} title={byId(id).name}><Blook id={id} size={56} /></button>)}</div>
      <button className="btn mt-3 bg-[#ff3d81] text-white disabled:opacity-40" disabled={!sel} onClick={() => start(sel)}>{sel ? `Fight with ${byId(sel).name}` : 'Choose a fighter'}</button></div>
  )
  const bar = (x) => <div className="du-hp"><i style={{ width: (100 * x.hp) / x.max + '%' }} /><span>{x.hp}/{x.max}</span></div>
  const can = f.turn === 'p'
  return (
    <div className="du-pane">
      <button className="du-back" onClick={onBack}>← Games</button>
      <div className="d3-wrap">
        <Stage3D build={d3Arena} height="23rem" onReady={setApi} />
        {[['P', f.P, 'l'], ['B', f.B, 'r']].map(([k, x, side]) => (
          <div key={k} className={`d3-hud ${side}`}><div className="du-name">{x.name}{x.g ? ' 🛡️' : ''}</div>{bar(x)}<div className="du-pips">{[0, 1, 2].map((i) => <b key={i} className={x.ch > i ? 'on' : ''} />)}</div></div>
        ))}
        {f.hit && f.dmg ? <div key={f.k} className={`d3-dmg ${f.hit === 'P' ? 'l' : 'r'}`} style={{ animationDelay: '.35s', opacity: 0 }}>-{f.dmg}</div> : null}
      </div>
      <div className="du-log" aria-live="polite">{f.log}</div>
      <div className="du-acts"><button disabled={!can} onClick={() => act('atk')}>⚔️ Attack</button><button disabled={!can} onClick={() => act('guard')}>🛡️ Guard</button><button disabled={!can || f.P.ch < 3} className="ult" onClick={() => act('ult')}>💥 Ultimate</button></div>
      {res && <DuelEnd {...res} onAgain={() => { setF(null); setSel(sel) }} onBack={onBack} />}
    </div>
  )
}

// ---------- Dice Duel: real 3D dice on a felt table ----------
const D3_UP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0] }
const D3_PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }
function d3DiceTable(ctx) {
  const { THREE, scene, cam } = ctx
  scene.background = new THREE.Color(0x0e1236); scene.fog = new THREE.Fog(0x0e1236, 14, 30)
  scene.add(new THREE.AmbientLight(0xaab4ff, 0.65))
  const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(3, 10, 4); dl.castShadow = true; dl.shadow.mapSize.set(1024, 1024)
  Object.assign(dl.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(dl)
  const pl = new THREE.PointLight(0xffd34d, 0.8, 20); pl.position.set(0, 5, 0); scene.add(pl)
  const table = new THREE.Mesh(new THREE.BoxGeometry(13, 0.5, 8.5), new THREE.MeshStandardMaterial({ color: 0x0f7a52, roughness: 0.95 })); table.position.y = -0.25; table.receiveShadow = true; scene.add(table)
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3418, roughness: 0.6 })
  ;[[0, -4.5, 13.8, 0.7], [0, 4.5, 13.8, 0.7], [-6.9, 0, 0.7, 9.2], [6.9, 0, 0.7, 9.2]].forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), wood); m.position.set(x, 0, z); m.castShadow = m.receiveShadow = true; scene.add(m) })
  const line = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.5 })); line.rotation.x = -Math.PI / 2; line.position.y = 0.01; scene.add(line)
  d3stars(ctx, 120, 20, 4)
  cam.position.set(0, 8.6, 7.2); cam.lookAt(0, 0, 0.3)
  const mk = (v) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')
    g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#d9cfb8'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122)
    g.fillStyle = v === 1 ? '#e0245e' : '#16193a'
    D3_PIPS[v].forEach(([x, y]) => { g.beginPath(); g.arc(64 + x * 32, 64 + y * 32, v === 1 ? 17 : 11, 0, 7); g.fill() })
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 })
  }
  const mats = [3, 4, 1, 6, 2, 5].map(mk), SZ = 1.5
  const pos = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.7], [1.5, 1.7]]
  const dice = pos.map(([x, z]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(SZ, SZ, SZ), mats); m.position.set(x, SZ / 2, z); m.castShadow = true; scene.add(m)
    const r = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.2, 40), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.03, z); scene.add(r)
    return { m, r, x, z, hl: false }
  })
  const finalQ = (v, yaw) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...D3_UP[v])))
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  ctx.tick.push((dt, t) => {
    dice.forEach((d, i) => { d.r.material.opacity = d.hl ? 0.6 + Math.sin(t * 6) * 0.35 : 0; if (d.hl && !d.busy) d.m.position.y = SZ / 2 + Math.abs(Math.sin(t * 3)) * 0.18 })
    cam.position.x = Math.sin(t * 0.25) * 0.6; cam.lookAt(0, 0, 0.3)
  })
  return {
    show(bv, pv) { [...bv, ...pv].forEach((v, i) => { dice[i].m.quaternion.copy(finalQ(v, i * 0.7 + 0.3)); dice[i].m.position.y = SZ / 2 }) },
    toss(i, v) {
      const d = dice[i], side = i < 2 ? -1 : 1, from = new THREE.Vector3(d.x + (Math.random() - 0.5) * 3 + (i % 2 ? 4 : -4), 6.5, side * 8.5), axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), fq = finalQ(v, Math.random() * 6.28), spins = Math.PI * 2 * (3 + Math.random() * 2), spq = new THREE.Quaternion()
      d.busy = true
      d3tw(ctx, 1.15 + (i % 2) * 0.1, (k) => {
        const e = 1 - Math.pow(1 - k, 3)
        d.m.position.x = from.x + (d.x - from.x) * e; d.m.position.z = from.z + (d.z - from.z) * e
        d.m.position.y = SZ / 2 + (1 - e) * (from.y - SZ / 2) * 0.55 + Math.abs(Math.sin(k * Math.PI * 3.2)) * (1 - k) * 1.5
        d.m.quaternion.copy(fq).multiply(spq.setFromAxisAngle(axis, (1 - e) * spins))
      }, () => { d.m.position.set(d.x, SZ / 2, d.z); d.m.quaternion.copy(fq); d.busy = false; d3burst(ctx, new THREE.Vector3(d.x, 0.3, d.z), 0xffd34d, 14, 2.2) })
    },
    hl(on) { dice[2].hl = dice[3].hl = on; if (!on) { dice[2].m.position.y = dice[3].m.position.y = SZ / 2 } },
    pick(e) {
      const r = ctx.el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, cam); const h = ray.intersectObjects([dice[2].m, dice[3].m])[0]
      return h ? (h.object === dice[2].m ? 0 : 1) : -1
    },
  }
}

function DiceDuel({ rep, lv, onBack }) {
  const [pd, setPd] = useState([1, 2]), [bd, setBd] = useState([3, 4]), [sc, setSc] = useState([0, 0]), [ph, setPh] = useState('idle'), [msg, setMsg] = useState('Roll to begin. First to 3 round wins.'), [res, setRes] = useState(null), [used, setUsed] = useState(false)
  const A = useRef(null), tm = useRef([]), r6 = () => rint(1, 6)
  useEffect(() => () => tm.current.forEach(clearTimeout), [])
  const later = (f, ms) => tm.current.push(setTimeout(f, ms))
  const roll = () => {
    if (ph !== 'idle') return
    const b = [r6(), r6()], p = [r6(), r6()]
    setPd(p); setBd(b); setUsed(false); setPh('rolling'); setMsg('Rolling…')
    if (A.current) { A.current.toss(0, b[0]); A.current.toss(1, b[1]); A.current.toss(2, p[0]); A.current.toss(3, p[1]) }
    later(() => { setPh('pick'); setMsg('Click one of your dice to reroll it (once), or keep.'); A.current && A.current.hl(true) }, 1500)
  }
  const finish = (a, b) => {
    setPh('resolving'); A.current && A.current.hl(false); let bb = [...b]
    if (bb[0] + bb[1] < [6, 8, 9][lv]) { const i = bb[0] <= bb[1] ? 0 : 1; bb[i] = r6(); setBd(bb); A.current && A.current.toss(i, bb[i]) }
    later(() => {
      const p = a[0] + a[1], q = bb[0] + bb[1]; let n = sc
      if (p > q) { n = [sc[0] + 1, sc[1]]; setMsg(`You win the round, ${p} to ${q}!`) } else if (q > p) { n = [sc[0], sc[1] + 1]; setMsg(`Bot wins the round, ${q} to ${p}.`) } else setMsg(`Tie at ${p}, roll again.`)
      setSc(n)
      if (n[0] >= 3 || n[1] >= 3) { const win = n[0] >= 3; later(() => setRes({ win, ...rep(win, 25) }), 900); setPh('end') } else later(() => setPh('idle'), 1100)
    }, 1500)
  }
  const reroll = (i) => { if (ph !== 'pick' || used) return; const a = [...pd]; a[i] = r6(); setPd(a); setUsed(true); setPh('wait'); A.current && (A.current.hl(false), A.current.toss(2 + i, a[i])); later(() => finish(a, bd), 1500) }
  const keep = () => { if (ph !== 'pick') return; finish(pd, bd) }
  const click = (e) => { if (ph !== 'pick' || used || !A.current) return; const i = A.current.pick(e); if (i >= 0) reroll(i) }
  return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Dice Duel</h3>
      <div className="du-score"><span>You <b>{sc[0]}</b></span><span>Bot <b>{sc[1]}</b></span></div>
      <div className="d3-wrap">
        <Stage3D build={d3DiceTable} height="22rem" onPointer={click} onReady={(a) => { A.current = a; a.show(bd, pd) }} />
        <div className="d3-top"><span>Bot · {ph === 'rolling' ? '?' : bd[0] + bd[1]}</span><span>You · {ph === 'rolling' ? '?' : pd[0] + pd[1]}</span></div>
      </div>
      <div className="du-log">{msg}</div>
      <div className="du-acts"><button disabled={ph !== 'idle'} onClick={roll}>🎲 Roll</button><button disabled={ph !== 'pick'} onClick={keep}>✋ Keep</button></div>
      {res && <DuelEnd {...res} onAgain={() => { setRes(null); setSc([0, 0]); setPh('idle'); setMsg('Roll to begin. First to 3 round wins.') }} onBack={onBack} />}
    </div>
  )
}

// ---------- Quick Draw: 3D desert showdown ----------
function d3Desert(ctx) {
  const { THREE, scene, cam } = ctx
  scene.background = new THREE.Color(0xff9a52); scene.fog = new THREE.Fog(0xff9a52, 14, 48)
  scene.add(new THREE.AmbientLight(0xffd9b0, 0.8))
  const dl = new THREE.DirectionalLight(0xffe2b8, 1); dl.position.set(-4, 6, 6); dl.castShadow = true; scene.add(dl)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 20), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false })); sun.position.set(0, 5, -34); scene.add(sun)
  for (let i = 0; i < 9; i++) { const h = 4 + Math.random() * 6, m = new THREE.Mesh(new THREE.ConeGeometry(4 + Math.random() * 3, h, 5), new THREE.MeshStandardMaterial({ color: 0x6a3a5e, flatShading: true })); m.position.set(-32 + i * 8 + Math.random() * 3, h / 2 - 0.3, -28 - Math.random() * 6); scene.add(m) }
  const cactus = (x, z) => { const g = new THREE.Group(), mt = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, flatShading: true }); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 2.4, 8), mt); b.position.y = 1.2; g.add(b); [[-0.6, 1.5], [0.6, 1.1]].forEach(([ax, ay]) => { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.9, 8), mt); a.position.set(ax, ay + 0.3, 0); g.add(a) }); g.position.set(x, 0, z); g.traverse((o) => { o.castShadow = true }); scene.add(g) }
  cactus(-7, -3); cactus(7.5, -5); cactus(-10, -9); cactus(11, -2)
  const weed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), new THREE.MeshBasicMaterial({ color: 0x8b5a2b, wireframe: true })); weed.position.set(-14, 0.4, 2.5); scene.add(weed)
  cam.position.set(0, 2.4, 9); cam.lookAt(0, 1.7, 0)
  const F = { P: d3fighter(ctx, -3.4, false, 0x7a3b12), B: d3fighter(ctx, 3.4, true, 0x5a2a5e) }
  let flash = 0
  ctx.tick.push((dt, t) => {
    weed.position.x += dt * 2.2; weed.rotation.z -= dt * 5; weed.position.y = 0.4 + Math.abs(Math.sin(t * 5)) * 0.3; if (weed.position.x > 16) weed.position.x = -16
    if (flash > 0) { flash -= dt; scene.background.setHex(flash > 0.06 ? 0xffffff : 0xff9a52) }
    ctx.shake *= 0.85; cam.position.x = (Math.random() - 0.5) * ctx.shake; cam.position.y = 2.4 + (Math.random() - 0.5) * ctx.shake
  })
  const reset = () => { ['P', 'B'].forEach((s) => { const d = F[s]; d.g.rotation.z = 0; d.g.position.set(d.x, 0, 0); d.mat.opacity = 1; d.busy = false; d.body.position.y = d.y; d.glow.intensity = 0 }) }
  return {
    set(p, b) { F.P.set(p); F.B.set(b); reset() },
    wait() { reset() },
    draw() { flash = 0.14; ['P', 'B'].forEach((s) => { F[s].glow.color.set(0xff3030); F[s].glow.intensity = 2.5 }) },
    resolve(win) {
      const w = F[win ? 'P' : 'B'], l = F[win ? 'B' : 'P'], dir = win ? 1 : -1
      ;['P', 'B'].forEach((s) => { F[s].glow.intensity = 0 }); w.busy = l.busy = true
      const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff4a0 })); scene.add(bullet)
      const muzzle = new THREE.PointLight(0xffd34d, 6, 8); muzzle.position.set(w.x + dir * 1.4, 1.9, 0.6); scene.add(muzzle)
      d3burst(ctx, new THREE.Vector3(w.x + dir * 1.4, 1.9, 0.6), 0xffd34d, 25, 4)
      d3tw(ctx, 0.22, (k) => { bullet.position.set(w.x + dir * 1.4 + (l.x - w.x - dir * 2.8) * k, 1.9, 0.6); muzzle.intensity = 6 * (1 - k) }, () => {
        scene.remove(bullet); scene.remove(muzzle); ctx.shake = 1.6; d3burst(ctx, new THREE.Vector3(l.x, 1.9, 0.5), 0xff5533, 60, 5); d3wave(ctx, new THREE.Vector3(l.x, 0, 0), 0xffd34d, 4)
        d3tw(ctx, 0.7, (k) => { l.g.rotation.z = (l.x < 0 ? 1 : -1) * k * 1.5; l.g.position.x = l.x + (l.x < 0 ? -1 : 1) * k * 1.2; l.mat.opacity = 1 - k * 0.6 })
        d3tw(ctx, 0.6, (k) => { w.body.position.y = w.y + Math.sin(k * Math.PI) * 1.1; w.body.rotation.y = k * Math.PI * 2 })
      })
    },
    flinch() { const p = F.P; d3burst(ctx, new THREE.Vector3(p.x, 1.8, 0.5), 0xff5555, 20, 3); d3tw(ctx, 0.5, (k) => { p.g.position.x = p.x + Math.sin(k * Math.PI * 6) * 0.3 * (1 - k) }) },
  }
}

function QuickDraw({ user, rep, lv, onBack }) {
  const [ph, setPh] = useState('idle'), [sc, setSc] = useState([0, 0]), [msg, setMsg] = useState('Best of 5. Click when you see DRAW. Too early and you lose the round.'), [res, setRes] = useState(null), [api, setApi] = useState(null), t0 = useRef(0), tms = useRef([]), botMs = useRef(500)
  const tr = (user.duel && user.duel.tr) || 0, av = user.avatar && byId(user.avatar) ? user.avatar : user.inv[0], bot = byId('robot') ? 'robot' : BLOOKS[1].id
  const clr = () => { tms.current.forEach(clearTimeout); tms.current = [] }
  useEffect(() => clr, [])
  useEffect(() => { if (api) api.set(av, bot) }, [api])
  const end = (win, text, cur, early) => {
    clr(); const n = win ? [cur[0] + 1, cur[1]] : [cur[0], cur[1] + 1]; setSc(n); setMsg(text); setPh('result')
    if (api) { api.resolve(win); if (early) api.flinch() }
    if (n[0] >= 3 || n[1] >= 3) { const w = n[0] >= 3; tms.current.push(setTimeout(() => { setPh('end'); setRes({ win: w, ...rep(w, 25) }) }, 1800)) }
  }
  const go = () => {
    if (ph !== 'idle' && ph !== 'result') return
    api && api.wait(); setPh('wait'); setMsg('Steady…')
    tms.current.push(setTimeout(() => {
      t0.current = performance.now(); botMs.current = Math.max(240, Math.min(640, 520 - tr / 8 + [110, 0, -90][lv] + rint(-70, 130))); setPh('draw'); setMsg('DRAW!'); api && api.draw()
      tms.current.push(setTimeout(() => end(false, 'The bot was faster!', sc), botMs.current))
    }, rint(1200, 3600)))
  }
  const click = () => {
    if (ph === 'wait') return end(false, 'Too early! You flinched.', sc, true)
    if (ph === 'draw') { const rt = Math.round(performance.now() - t0.current); end(true, `You shot first in ${rt} ms (bot: ${botMs.current} ms)!`, sc) }
  }
  return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Quick Draw</h3>
      <div className="du-score"><span>You <b>{sc[0]}</b></span><span>Bot <b>{sc[1]}</b></span></div>
      <div className="d3-wrap" style={{ cursor: 'crosshair' }}>
        <Stage3D build={d3Desert} height="23rem" onReady={setApi} onPointer={click}>
          {ph === 'draw' && <div className="d3-big chunk">DRAW!</div>}
          {ph === 'wait' && <div className="d3-big chunk">…</div>}
        </Stage3D>
      </div>
      <div className="du-log">{msg}</div>
      <div className="du-acts"><button disabled={(ph !== 'idle' && ph !== 'result') || sc[0] >= 3 || sc[1] >= 3} onClick={go}>{ph === 'idle' && sc[0] + sc[1] === 0 ? '🤠 Start' : '➡️ Next round'}</button></div>
      {res && <DuelEnd {...res} onAgain={() => { setRes(null); setSc([0, 0]); setPh('idle'); api && api.wait(); setMsg('Best of 5. Click when you see DRAW.') }} onBack={onBack} />}
    </div>
  )
}


// =====================================================================
// PART 2: Clash, Memory Match, Sharpshooter, Connect Four in 3D
// =====================================================================
const d3ray = (ctx, e) => { const r = ctx.el.getBoundingClientRect(), THREE = ctx.THREE, rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ctx.cam); return rc }
const d3canvas = (THREE, w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t }
const d3lights = (ctx, a = 0.8) => { const { THREE, scene } = ctx; scene.add(new THREE.AmbientLight(0xaab4ff, a)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(3, 8, 8); dl.castShadow = true; scene.add(dl); const p1 = new THREE.PointLight(0x38e8ff, 1.2, 25); p1.position.set(-8, 3, 6); scene.add(p1); const p2 = new THREE.PointLight(0xff3d81, 1.2, 25); p2.position.set(8, 3, 6); scene.add(p2) }

// ---------- Clash: two big 3D flip cards ----------
function d3Clash(ctx) {
  const { THREE, scene, cam } = ctx
  scene.background = new THREE.Color(0x120a2e); scene.fog = new THREE.Fog(0x120a2e, 14, 34)
  d3lights(ctx, 0.9); d3stars(ctx, 160, 30, 3)
  const table = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0x2a1a5e, metalness: 0.5, roughness: 0.4 })); table.position.y = -0.3; table.receiveShadow = true; scene.add(table)
  const tr = new THREE.Mesh(new THREE.TorusGeometry(8.8, 0.07, 8, 96), new THREE.MeshBasicMaterial({ color: 0xa855f7 })); tr.rotation.x = Math.PI / 2; tr.position.y = -0.03; scene.add(tr)
  const mkFace = (txt, c1, c2, fs) => d3canvas(THREE, 256, 360, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); g.font = fs + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(txt, w / 2, h / 2 + 8) })
  const FACE = { '?': mkFace('?', '#5b2fd1', '#c026d3', 170), r: mkFace('✊', '#ff7a45', '#ff3d81', 150), p: mkFace('✋', '#22c55e', '#38bdf8', 150), s: mkFace('✌️', '#facc15', '#f97316', 150) }
  const mk = (x) => {
    const edge = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), front = new THREE.MeshStandardMaterial({ map: FACE['?'], roughness: 0.35 }), back = new THREE.MeshStandardMaterial({ map: FACE['?'], roughness: 0.35 })
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.8, 0.14), [edge, edge, edge, edge, front, back]); m.castShadow = true
    const g = new THREE.Group(); g.add(m); g.position.set(x, 2.3, 0); scene.add(g)
    const l = new THREE.PointLight(0xffd34d, 0, 9); l.position.set(0, 0, 2); g.add(l)
    return { g, m, back, l, x, tgt: 0, shake: false, dim: 0 }
  }
  const C = { B: mk(-3.2), P: mk(3.2) }
  cam.position.set(0, 5.2, 10.5)
  ctx.tick.push((dt, t) => {
    cam.lookAt(0, 2.2, 0); cam.position.x = Math.sin(t * 0.3) * 0.7
    ;['B', 'P'].forEach((s) => {
      const c = C[s], cur = c.g.rotation.y; c.g.rotation.y += (c.tgt - cur) * Math.min(1, dt * 9)
      const fl = Math.sin(Math.min(1, Math.abs(c.tgt - cur) / Math.PI) * Math.PI)
      c.g.position.y = 2.3 + Math.sin(t * 1.6 + c.x) * 0.15 + fl * 1.2
      c.g.rotation.z = c.shake ? Math.sin(t * 38) * 0.08 : 0; if (c.shake) c.g.position.y += Math.abs(Math.sin(t * 20)) * 0.25
      c.m.material[4].color.setScalar(1 - c.dim * 0.55); c.m.material[5].color.setScalar(1 - c.dim * 0.55)
    })
  })
  return {
    face(side, m) { const c = C[side]; c.back.map = FACE[m] || FACE['?']; c.back.needsUpdate = true },
    shake(on) { C.B.shake = C.P.shake = on },
    reveal(w) {
      C.B.tgt = C.P.tgt = Math.PI
      setTimeout(() => {
        ;['B', 'P'].forEach((s) => { const c = C[s]; c.dim = w && w !== s ? 1 : 0; if (w === s) { c.l.intensity = 4; d3burst(ctx, new THREE.Vector3(c.x, 2.8, 1), 0xffd34d, 60, 5); d3wave(ctx, new THREE.Vector3(c.x, 0, 0), 0xffd34d, 4) } })
        if (!w) { ctx.shake = 0.6; d3burst(ctx, new THREE.Vector3(0, 2.5, 1), 0xffffff, 30, 3) } else ctx.shake = 1
      }, 380)
    },
    hide() { C.B.tgt = C.P.tgt = 0; ;['B', 'P'].forEach((s) => { C[s].dim = 0; C[s].l.intensity = 0 }) },
  }
}
function Clash({ rep, lv, onBack }) {
  const [sc, setSc] = useState([0, 0]), [busy, setBusy] = useState(false), [msg, setMsg] = useState('Pick your move. First to 3 wins.'), [res, setRes] = useState(null), hist = useRef([]), tm = useRef([]), A = useRef(null)
  useEffect(() => () => tm.current.forEach(clearTimeout), [])
  const play = (m) => {
    if (busy) return; setBusy(true)
    let b = RPS[rint(0, 2)][0]; const h = hist.current
    if (h.length >= 2 && Math.random() < [0.15, 0.35, 0.6][lv]) { const cnt = { r: 0, p: 0, s: 0 }; h.forEach((x) => cnt[x]++); const fav = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0]; b = fav === 'r' ? 'p' : fav === 'p' ? 's' : 'r' }
    hist.current = [...h, m]
    const a = A.current; if (a) { a.face('P', m); a.face('B', b); a.shake(true) }
    tm.current.push(setTimeout(() => {
      const n = [...sc]; let w = null
      if (rpsWin(m, b)) { n[0]++; w = 'P'; setMsg('You win the round!') } else if (rpsWin(b, m)) { n[1]++; w = 'B'; setMsg('Bot wins the round.') } else setMsg('Draw. Go again.')
      setSc(n); if (a) { a.shake(false); a.reveal(w) }
      if (n[0] >= 3 || n[1] >= 3) { const wn = n[0] >= 3; tm.current.push(setTimeout(() => setRes({ win: wn, ...rep(wn, 25) }), 1300)) } else tm.current.push(setTimeout(() => { setBusy(false); a && a.hide() }, 1700))
    }, 900))
  }
  return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Clash</h3>
      <div className="du-score"><span>You <b>{sc[0]}</b></span><span>Bot <b>{sc[1]}</b></span></div>
      <div className="d3-wrap"><Stage3D build={d3Clash} height="22rem" onReady={(a) => { A.current = a }} />
        <div className="d3-top"><span>Bot</span><span>You</span></div></div>
      <div className="du-log">{msg}</div>
      <div className="du-acts">{RPS.map(([k, e, n]) => <button key={k} disabled={busy} onClick={() => play(k)}>{e} {n}</button>)}</div>
      {res && <DuelEnd {...res} onAgain={() => { setRes(null); setSc([0, 0]); setBusy(false); hist.current = []; A.current && A.current.hide(); setMsg('Pick your move. First to 3 wins.') }} onBack={onBack} />}
    </div>
  )
}

// ---------- Memory Match: a wall of 3D flip cards ----------
function d3Memory(ctx) {
  const { THREE, scene, cam } = ctx
  scene.background = new THREE.Color(0x0b1230); scene.fog = new THREE.Fog(0x0b1230, 18, 40)
  d3lights(ctx, 0.95); d3stars(ctx, 120, 30, -4)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x131a4d, roughness: 0.9 })); wall.position.z = -1.5; wall.receiveShadow = true; scene.add(wall)
  const backTex = d3canvas(THREE, 128, 180, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#38bdf8'); gr.addColorStop(1, '#a855f7'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#fff'; g.font = '80px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 4) })
  const cards = []
  for (let i = 0; i < 16; i++) {
    const piv = new THREE.Group(), inn = new THREE.Group(); piv.position.set(((i % 4) - 1.5) * 1.95, (1.5 - Math.floor(i / 4)) * 2.5, 0); piv.rotation.x = -0.1; piv.add(inn); scene.add(piv)
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xf4f0ff, roughness: 0.4 })); box.castShadow = true; inn.add(box)
    const bk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshBasicMaterial({ map: backTex })); bk.position.z = 0.06; inn.add(bk)
    const fm = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.04, color: 0xffffff }), fr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), fm); fr.position.z = -0.06; fr.rotation.y = Math.PI; fr.visible = true; inn.add(fr)
    const bgp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), new THREE.MeshBasicMaterial({ color: 0x1b2266 })); bgp.position.z = -0.055; bgp.rotation.y = Math.PI; inn.add(bgp)
    cards.push({ piv, inn, box, fm, fr, tgt: 0, m: false, y0: piv.position.y })
  }
  cam.position.set(0, 0, 15.5)
  ctx.tick.push((dt, t) => {
    cam.lookAt(0, 0, 0); cam.position.x = Math.sin(t * 0.3) * 0.5
    cards.forEach((c, i) => {
      c.inn.rotation.y += (c.tgt - c.inn.rotation.y) * Math.min(1, dt * 10)
      c.inn.position.z = Math.sin(Math.min(1, Math.abs(c.tgt - c.inn.rotation.y) / Math.PI) * Math.PI) * 1.2
      c.piv.position.y = c.y0 + (c.m ? 0.12 + Math.sin(t * 3 + i) * 0.06 : 0)
      c.box.material.color.setHex(c.m ? 0xb8ffd0 : 0xf4f0ff)
    })
  })
  return {
    setIds(ids) { ids.forEach((id, i) => { const t = d3tex(THREE, id); cards[i].fm.map = t; cards[i].fr.visible = !!t; cards[i].fm.needsUpdate = true }) },
    sync(cs) { cs.forEach((c, i) => { const k = cards[i], up = c.f || c.m; if (c.m && !k.m) { const p = k.piv.position; d3burst(ctx, new THREE.Vector3(p.x, p.y, 1), 0x7dffb0, 24, 3) } k.tgt = up ? Math.PI : 0; k.m = c.m }) },
    pick(e) { const h = d3ray(ctx, e).intersectObjects(cards.map((c) => c.box))[0]; return h ? cards.findIndex((c) => c.box === h.object) : -1 },
  }
}
function MemoryMatch({ rep, lv, onBack }) {
  const mk = () => { const pool = BLOOKS.filter((b) => b.rarity !== 'owner' && !b.id.startsWith('cd_')), ids = []; while (ids.length < 8) { const b = pool[rint(0, pool.length - 1)]; if (!ids.includes(b.id)) ids.push(b.id) } return [...ids, ...ids].sort(() => Math.random() - 0.5).map((id) => ({ id, f: false, m: false })) }
  const [st, setSt] = useState(() => ({ cards: mk(), sel: [], turn: 'p', sc: [0, 0], busy: false, done: false })), [res, setRes] = useState(null), [api, setApi] = useState(null), R = useRef(st), seen = useRef(new Set()), tm = useRef([]); R.current = st
  useEffect(() => () => tm.current.forEach(clearTimeout), [])
  const key = st.cards.map((c) => c.id).join(',')
  useEffect(() => { if (api) api.setIds(st.cards.map((c) => c.id)) }, [api, key])
  useEffect(() => { if (api) api.sync(st.cards) }, [api, st.cards])
  const flip = (i, who) => {
    const s = R.current; if (s.busy || s.done || s.cards[i].f || s.cards[i].m || s.sel.length >= 2) return
    seen.current.add(i); const cards = s.cards.map((c, k) => (k === i ? { ...c, f: true } : c)), sel = [...s.sel, i]
    if (sel.length < 2) { setSt({ ...s, cards, sel }); return }
    setSt({ ...s, cards, sel, busy: true })
    tm.current.push(setTimeout(() => {
      const c = R.current, [a, b] = sel, ok = c.cards[a].id === c.cards[b].id, sc = [...c.sc]
      const cs = c.cards.map((x, k) => (k === a || k === b ? { ...x, f: ok, m: ok } : x))
      if (ok) sc[who === 'p' ? 0 : 1]++
      const done = cs.every((x) => x.m)
      setSt({ cards: cs, sel: [], turn: ok ? who : who === 'p' ? 'b' : 'p', sc, busy: false, done })
      if (done) tm.current.push(setTimeout(() => { const w = sc[0] > sc[1]; if (sc[0] === sc[1]) setRes({ win: false, gain: 0, tok: 0, tie: true }); else setRes({ win: w, ...rep(w, 25) }) }, 900))
    }, 1100))
  }
  useEffect(() => {
    if (st.turn !== 'b' || st.busy || st.done || st.sel.length >= 2) return
    const t = setTimeout(() => {
      const s = R.current, mem = [0.35, 0.65, 0.9][lv], un = s.cards.map((c, i) => i).filter((i) => !s.cards[i].m && !s.cards[i].f)
      const known = (id, not) => [...seen.current].filter((i) => !s.cards[i].m && s.cards[i].id === id && i !== not)
      let pick
      if (s.sel.length === 0) {
        const byid = {}; [...seen.current].filter((i) => !s.cards[i].m).forEach((i) => { (byid[s.cards[i].id] = byid[s.cards[i].id] || []).push(i) })
        const pair = Object.values(byid).find((v) => v.length >= 2), use = pair && Math.random() < mem
        const fresh = un.filter((i) => !seen.current.has(i))
        pick = use ? pair[0] : fresh.length ? fresh[rint(0, fresh.length - 1)] : un[0]
      } else {
        const k = known(s.cards[s.sel[0]].id, s.sel[0]), fresh = un.filter((i) => i !== s.sel[0] && !seen.current.has(i)), rest = un.filter((i) => i !== s.sel[0])
        pick = k.length && Math.random() < mem ? k[0] : fresh.length ? fresh[rint(0, fresh.length - 1)] : rest[rint(0, rest.length - 1)]
      }
      if (pick !== undefined) flip(pick, 'b')
    }, 800)
    return () => clearTimeout(t)
  }, [st.turn, st.sel.length, st.busy, st.done])
  const click = (e) => { if (!api || st.turn !== 'p') return; const i = api.pick(e); if (i >= 0) flip(i, 'p') }
  return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Memory Match</h3>
      <div className="du-score"><span className={st.turn === 'p' ? 'tn' : ''}>You <b>{st.sc[0]}</b></span><span className={st.turn === 'b' ? 'tn' : ''}>Bot <b>{st.sc[1]}</b></span></div>
      <div className="d3-wrap" style={{ cursor: st.turn === 'p' ? 'pointer' : 'wait' }}><Stage3D build={d3Memory} height="30rem" onReady={setApi} onPointer={click} /></div>
      <div className="du-log">{st.turn === 'p' ? 'Your turn: flip two cards.' : 'Bot is thinking…'}</div>
      {res && <DuelEnd {...res} onAgain={() => { setRes(null); seen.current = new Set(); setSt({ cards: mk(), sel: [], turn: 'p', sc: [0, 0], busy: false, done: false }) }} onBack={onBack} />}
    </div>
  )
}

// ---------- Sharpshooter: a 3D neon shooting gallery ----------
function d3Range(ctx) {
  const { THREE, scene, cam } = ctx
  scene.background = new THREE.Color(0x090c22); scene.fog = new THREE.Fog(0x090c22, 8, 30)
  scene.add(new THREE.AmbientLight(0x8899ff, 0.9)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(0, 6, 10); scene.add(dl)
  const p1 = new THREE.PointLight(0x38e8ff, 1.5, 24); p1.position.set(-8, 2, 3); scene.add(p1); const p2 = new THREE.PointLight(0xff3d81, 1.5, 24); p2.position.set(8, 2, 3); scene.add(p2)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(50, 20), new THREE.MeshStandardMaterial({ color: 0x10163d, roughness: 0.9 })); wall.position.z = -7; scene.add(wall)
  const grid = new THREE.GridHelper(60, 40, 0x38e8ff, 0x23306e); grid.position.y = -4.4; scene.add(grid)
  const neon = []; for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(40, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff3d81 : 0x38e8ff })); m.position.set(0, -3 + i * 2, -6.9); scene.add(m); neon.push(m) }
  d3stars(ctx, 120, 30, 3)
  const bull = d3canvas(THREE, 256, 256, (g) => { const cols = ['#ffffff', '#ff3d81', '#ffffff', '#ff3d81', '#ffd34d']; cols.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(128, 128, 126 - i * 25, 0, 7); g.fill() }) })
  cam.position.set(0, 0, 10)
  const T = new Map(), side = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 }), geo = {}
  ctx.tick.push((dt, t) => {
    cam.lookAt(0, 0, 0); neon.forEach((n, i) => { n.material.color.offsetHSL(0, 0, 0) ; n.position.x = Math.sin(t * 0.5 + i) * 0.6 })
    const now = performance.now()
    T.forEach((o) => {
      const age = (now - o.at) / 1000, life = o.life / 1000, pop = Math.min(1, age / 0.18), back = 1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2), fade = age > life * 0.78 ? Math.max(0, 1 - (age - life * 0.78) / (life * 0.22)) : 1
      o.g.scale.setScalar(Math.max(0.01, back * fade)); o.g.rotation.y = Math.sin(t * 2.4 + o.id) * 0.3; o.g.position.y = o.y + Math.sin(t * 2 + o.id) * 0.12
    })
  })
  return {
    sync(list, life) {
      const ids = new Set(list.map((x) => x.id)), hw = 4.14 * Math.min(cam.aspect, 2.2) * 0.88, hh = 4.14 * 0.82
      list.forEach((x) => { if (T.has(x.id)) return
        const r = (x.s / 60) * 0.62, g = new THREE.Group(), cy = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 36), [side, new THREE.MeshBasicMaterial({ map: bull }), side]); cy.rotation.x = Math.PI / 2; g.add(cy)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), side); pole.position.y = -3.4; g.add(pole)
        const px = ((x.x - 46) / 46) * hw, py = ((40 - x.y) / 40) * hh * 0.9; g.position.set(px, py, -(x.id % 3) * 1.1); scene.add(g)
        T.set(x.id, { g, id: x.id, at: x.at, life, y: py, r, col: 0xffd34d }) })
      T.forEach((o, id) => { if (!ids.has(id)) { scene.remove(o.g); T.delete(id) } })
    },
    pop(id) { const o = T.get(id); if (!o) return; d3burst(ctx, o.g.position.clone(), 0xffd34d, 36, 4.5); d3wave(ctx, new THREE.Vector3(o.g.position.x, -4.3, o.g.position.z), 0xff3d81, 2) },
    pick(e) { const rc = d3ray(ctx, e); let best = null, bd = 1e9; T.forEach((o) => { const h = rc.intersectObject(o.g, true)[0]; if (h && h.distance < bd) { bd = h.distance; best = o.id } }); return best },
    clear() { T.forEach((o) => scene.remove(o.g)); T.clear() },
  }
}
function Sharpshooter({ rep, lv, onBack }) {
  const T = 20, life = [1500, 1150, 850][lv], [phase, setPhase] = useState('idle'), [t, setT] = useState(T), [score, setScore] = useState(0), [tg, setTg] = useState([]), [res, setRes] = useState(null), [api, setApi] = useState(null), botF = useRef(0), id = useRef(0), sc = useRef(0), tgr = useRef([]); tgr.current = tg
  const start = () => { botF.current = [11, 16, 22][lv] + rint(-2, 2); sc.current = 0; setScore(0); setTg([]); setT(T); setPhase('go') }
  useEffect(() => { if (api) api.sync(tg, life) }, [api, tg])
  useEffect(() => {
    if (phase !== 'go') return
    const t0 = performance.now()
    const iv = setInterval(() => {
      const el = (performance.now() - t0) / 1000, left = Math.max(0, T - el); setT(left); setTg((a) => a.filter((x) => performance.now() - x.at < life))
      if (left <= 0) { clearInterval(iv); clearInterval(sp); setPhase('end'); setTg([]); const bs = botF.current, w = sc.current > bs; setRes({ win: w, bs, ...rep(w, 25) }) }
    }, 100)
    const sp = setInterval(() => setTg((a) => [...a.slice(-4), { id: ++id.current, x: rint(6, 86), y: rint(8, 78), at: performance.now(), s: rint(46, 70) }]), [700, 600, 480][lv])
    return () => { clearInterval(iv); clearInterval(sp) }
  }, [phase])
  const shoot = (e) => { if (phase !== 'go' || !api) return; const i = api.pick(e); if (i == null) return; api.pop(i); sc.current++; setScore(sc.current); setTg((a) => a.filter((y) => y.id !== i)) }
  const bot = Math.round(botF.current * Math.min(1, (T - t) / T))
  return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Sharpshooter</h3>
      <div className="du-score"><span>You <b>{score}</b></span><span className="chunk">⏱ {t.toFixed(1)}s</span><span>Bot <b>{phase === 'idle' ? 0 : bot}</b></span></div>
      <div className="d3-wrap" style={{ cursor: 'crosshair' }}>
        <Stage3D build={d3Range} height="26rem" onReady={setApi} onPointer={shoot} />
        {phase === 'idle' && <div className="ss-start" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', textAlign: 'center', gap: '.8rem', background: 'rgba(5,8,30,.55)', color: '#fff' }}><p className="chunk text-xl">Pop more targets than the bot in {T} seconds.</p><button className="btn bg-[#ff3d81] text-white" onClick={start}>🎯 Start</button></div>}
      </div>
      {res && <DuelEnd {...res} onAgain={() => { setRes(null); api && api.clear(); setPhase('idle') }} onBack={onBack} />}
    </div>
  )
}

// ---------- Connect Four: a real standing 3D board ----------
function d3C4(ctx) {
  const { THREE, scene, cam } = ctx, S = 1.2, W = 7 * S, H = 6 * S
  scene.background = new THREE.Color(0x0b0f33); scene.fog = new THREE.Fog(0x0b0f33, 16, 38)
  d3lights(ctx, 0.85); d3stars(ctx, 120, 30, 2)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x151c55, metalness: 0.4, roughness: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -H / 2 - 0.5; floor.receiveShadow = true; scene.add(floor)
  const shape = new THREE.Shape(); shape.moveTo(-W / 2 - 0.35, -H / 2 - 0.35); shape.lineTo(W / 2 + 0.35, -H / 2 - 0.35); shape.lineTo(W / 2 + 0.35, H / 2 + 0.35); shape.lineTo(-W / 2 - 0.35, H / 2 + 0.35); shape.lineTo(-W / 2 - 0.35, -H / 2 - 0.35)
  for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++) { const h = new THREE.Path(); h.absarc((c - 3) * S, (2.5 - r) * S, 0.47, 0, Math.PI * 2, true); shape.holes.push(h) }
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }); bg.translate(0, 0, -0.3)
  const board = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x2a46e0, metalness: 0.3, roughness: 0.35 })); board.castShadow = true; scene.add(board)
  ;[-1, 1].forEach((sx) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1.6), new THREE.MeshStandardMaterial({ color: 0x1a2cae })); leg.position.set(sx * (W / 2 + 0.1), -H / 2 - 0.35, 0); scene.add(leg) })
  const disc = (p, op = 1) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 36), new THREE.MeshStandardMaterial({ color: p === 1 ? 0xff3d81 : 0x38e8ff, emissive: p === 1 ? 0xff3d81 : 0x38e8ff, emissiveIntensity: 0.35, roughness: 0.3, transparent: op < 1, opacity: op })); m.rotation.x = Math.PI / 2; m.castShadow = true; return m }
  let ghost = null, discs = []
  cam.position.set(0, 1, 14.5)
  ctx.tick.push((dt, t) => { cam.lookAt(0, 0.3, 0); cam.position.x = Math.sin(t * 0.3) * 1.2; if (ghost) ghost.position.y = H / 2 + 1.1 + Math.sin(t * 4) * 0.08 })
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  return {
    col(e) { const pt = new THREE.Vector3(); if (!d3ray(ctx, e).ray.intersectPlane(plane, pt)) return -1; const c = Math.floor(pt.x / S + 3.5); return c < 0 || c > 6 ? -1 : c },
    hover(c, p) { if (ghost) { scene.remove(ghost); ghost = null } if (c >= 0 && p) { ghost = disc(p, 0.5); ghost.position.set((c - 3) * S, H / 2 + 1.1, 0); scene.add(ghost) } },
    drop(c, r, p) {
      const d = disc(p); d.position.set((c - 3) * S, H / 2 + 1.2, 0); scene.add(d); discs.push(d)
      const ty = (2.5 - r) * S, y0 = d.position.y
      d3tw(ctx, 0.25 + Math.sqrt((y0 - ty) / 9) * 0.45, (k) => { d.position.y = y0 + (ty - y0) * k * k }, () => { d3tw(ctx, 0.22, (k) => { d.position.y = ty + Math.sin(k * Math.PI) * 0.22 }, () => { d.position.y = ty; d3burst(ctx, new THREE.Vector3(d.position.x, ty - 0.3, 0.4), p === 1 ? 0xff3d81 : 0x38e8ff, 12, 2) }) })
    },
    win(p) { ctx.shake = 1.4; d3burst(ctx, new THREE.Vector3(0, 0, 1), p === 1 ? 0xff3d81 : 0x38e8ff, 120, 8); d3burst(ctx, new THREE.Vector3(0, 2, 1), 0xffd34d, 80, 7) },
    clear() { discs.forEach((d) => scene.remove(d)); discs = [] },
  }
}
function ConnectFour({ rep, lv, onBack }) {
  const [b, setB] = useState(() => Array(42).fill(0)), [turn, setTurn] = useState(1), [res, setRes] = useState(null), [msg, setMsg] = useState('Your move: pick a column.'), [hov, setHov] = useState(-1), [api, setApi] = useState(null), done = useRef(false)
  const place = (c, p) => {
    const r = c4drop(b, c, p); if (!r) return; const [nb, row] = r; setB(nb); api && api.drop(c, row, p)
    if (c4win(nb, p)) { done.current = true; const w = p === 1; setMsg(w ? 'Four in a row!' : 'The bot connected four.'); setTimeout(() => { api && api.win(p) }, 800); setTimeout(() => setRes({ win: w, ...rep(w, 30) }), 1900); return }
    if (nb.every(Boolean)) { done.current = true; setMsg('Draw! Resetting…'); setTimeout(() => { setB(Array(42).fill(0)); setTurn(1); api && api.clear(); done.current = false; setMsg('Your move: pick a column.') }, 1800); return }
    setTurn(p === 1 ? 2 : 1); setMsg(p === 1 ? 'Bot is thinking…' : 'Your move: pick a column.')
  }
  useEffect(() => {
    if (turn !== 2 || done.current) return
    const t = setTimeout(() => { const c = [1, 3, 5][lv]; const [, bc] = c4search(b, c, -Infinity, Infinity, true); const open = [0, 1, 2, 3, 4, 5, 6].filter((x) => !b[x]); place(lv === 0 && Math.random() < 0.3 ? open[rint(0, open.length - 1)] : bc, 2) }, 1000)
    return () => clearTimeout(t)
  }, [turn])
  useEffect(() => { if (api) api.hover(hov, turn === 1 && !done.current ? 1 : 0) }, [api, hov, turn])
  const click = (e) => { if (!api || turn !== 1 || done.current) return; const c = api.col(e); if (c >= 0 && !b[c]) { setHov(-1); place(c, 1) } }
  return (
    <div className="du-pane"><button className="du-back" onClick={onBack}>← Games</button><h3 className="chunk text-3xl">Connect Four</h3>
      <div className="d3-wrap" style={{ cursor: turn === 1 ? 'pointer' : 'wait' }}><Stage3D build={d3C4} height="30rem" onReady={setApi} onPointer={click} onMove={(e) => api && setHov(api.col(e))} onLeave={() => setHov(-1)} /></div>
      <div className="du-log">{msg}</div>
      {res && <DuelEnd {...res} onAgain={() => { setRes(null); done.current = false; setB(Array(42).fill(0)); setTurn(1); api && api.clear(); setMsg('Your move: pick a column.') }} onBack={onBack} />}
    </div>
  )
}
