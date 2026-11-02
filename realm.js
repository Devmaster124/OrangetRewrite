/* Oranget Realm: a from-scratch WebGL2 engine (JavaScript + GLSL). Everything you see is procedural: no textures, no models, no downloads.
   Scenes: "hub" (small meadow with two portals) and "world" (open-world story mode). */
(function () {
'use strict'
// ---------------------------------------------------------------- math
const M = {
  ident: () => { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o },
  persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o },
  ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o },
  look(e, c, u) { let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx, o = new Float32Array(16)
    o[0] = xx; o[1] = yx; o[2] = zx; o[4] = xy; o[5] = yy; o[6] = zy; o[8] = xz; o[9] = yz; o[10] = zz
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1; return o },
  trs(px, py, pz, ry, sx, sy, sz, rx = 0, rz = 0) { // rotate Z, X, Y then scale then translate
    const cy = Math.cos(ry), sY = Math.sin(ry), cx = Math.cos(rx), sX = Math.sin(rx), cz = Math.cos(rz), sZ = Math.sin(rz), o = new Float32Array(16)
    // R = Ry * Rx * Rz
    const r00 = cy * cz + sY * sX * sZ, r01 = -cy * sZ + sY * sX * cz, r02 = sY * cx
    const r10 = cx * sZ, r11 = cx * cz, r12 = -sX
    const r20 = -sY * cz + cy * sX * sZ, r21 = sY * sZ + cy * sX * cz, r22 = cy * cx
    o[0] = r00 * sx; o[1] = r10 * sx; o[2] = r20 * sx; o[4] = r01 * sy; o[5] = r11 * sy; o[6] = r21 * sy; o[8] = r02 * sz; o[9] = r12 * sz; o[10] = r22 * sz
    o[12] = px; o[13] = py; o[14] = pz; o[15] = 1; return o },
  proj(vp, x, y, z) { const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]; return [(vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w, (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w, w] },
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), mix = (a, b, t) => a + (b - a) * t, sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const len2 = (x, y) => Math.hypot(x, y), TAU = Math.PI * 2

// ---------------------------------------------------------------- noise + terrain (JS copy; the GLSL copy below must match)
function ihash(x, y) { let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) | 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967295 }
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const a = ihash(ix, iy), b = ihash(ix + 1, iy), c = ihash(ix, iy + 1), d = ihash(ix + 1, iy + 1); return mix(mix(a, b, ux), mix(c, d, ux), uy) }
function fbm(x, y, oct) { let s = 0, a = 0.5; for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); const nx = (0.8 * x - 0.6 * y) * 2.03 + 17.3, ny = (0.6 * x + 0.8 * y) * 2.03 + 9.1; x = nx; y = ny; a *= 0.5 } return s }
let MODE = 0 // 0 = hub meadow, 1 = open world, 2 = closed stone arena (raid lobby and boss rush)
const WORLD = { water: -5, start: [0, 0], altar: [520, -420], lake: [-250, 190], arenas: [] }
function baseWorld(x, z) {
  const c = fbm(x * 0.0011 + 1.3, z * 0.0011 + 1.3, 5), m = fbm(x * 0.003 + 7.7, z * 0.003 + 7.7, 5)
  let rg = 1 - Math.abs(2 * fbm(x * 0.0042 + 2, z * 0.0042 + 2, 5) - 1); rg *= rg
  let h = (c - 0.5) * 46 + (m - 0.5) * 26 + sstep(0.5, 0.72, c) * rg * 190
  const qx = x + 250, qz = z - 190; h -= 26 * Math.exp(-(qx * qx + qz * qz) / (110 * 110))
  const ax = x - 520, az = z + 420; h += 38 * Math.exp(-(ax * ax + az * az) / (140 * 140))
  h = mix((m - 0.5) * 2.5, h, sstep(45, 170, len2(x, z)))
  return mix(30, h, sstep(34, 70, len2(ax, az)))
}
function terrainH(x, z) {
  if (MODE === 0) {
    const r = len2(x, z), n = fbm(x * 0.025, z * 0.025, 4)
    let h = (n - 0.5) * 1.6 * sstep(4, 30, r)
    h += sstep(34, 78, r) * (7 + 26 * fbm(x * 0.012 + 3.1, z * 0.012 + 3.1, 4))
    h += sstep(150, 420, r) * 70 * fbm(x * 0.004 + 9, z * 0.004 + 9, 5)
    return h
  }
  if (MODE === 2) { const r = len2(x, z); return sstep(52, 72, r) * (16 + 10 * fbm(x * 0.02 + 5, z * 0.02 + 5, 3)) + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 0.35 * sstep(0, 40, r) }
  let h = baseWorld(x, z)
  for (const a of WORLD.arenas) { const d = len2(x - a.x, z - a.z); h = mix(a.h, h, sstep(a.r * 0.6, a.r * 1.15, d)) }
  return h
}
function terrainN(x, z, e = 0.6) { const dx = terrainH(x - e, z) - terrainH(x + e, z), dz = terrainH(x, z - e) - terrainH(x, z + e), l = Math.hypot(dx, 2 * e, dz); return [dx / l, 2 * e / l, dz / l] }
const waterY = () => (MODE === 1 ? WORLD.water : -1000)

// ---------------------------------------------------------------- GLSL prelude shared by every program
const GLSL_HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DShadow;
layout(std140) uniform G {
  mat4 uVP; mat4 uShadowVP; vec4 uCam; vec4 uSunDir; vec4 uSunCol; vec4 uSkyAmb; vec4 uGndAmb; vec4 uFog; vec4 uTime;
  vec4 uZenith; vec4 uHorizon; vec4 uPL0p; vec4 uPL0c; vec4 uPL1p; vec4 uPL1c; vec4 uPlayer; vec4 uCR; vec4 uCU; vec4 uCF; vec4 uMoon; vec4 uExtra; vec4 uArena[4];
};
#define PI 3.14159265359
#define TIME uTime.x
#define MODE uTime.y
#define WATERY uTime.z
#define WIND uTime.w
`
const GLSL_NOISE = `
uint ih(ivec2 p){ uint h = uint(p.x)*0x27d4eb2du ^ uint(p.y)*0x165667b1u; h = (h ^ (h >> 15)) * 0x85ebca6bu; h ^= h >> 13; h *= 0xc2b2ae35u; h ^= h >> 16; return h; }
float hash2(ivec2 p){ return float(ih(p)) * (1.0/4294967295.0); }
float hash1(float n){ return fract(sin(n*127.1)*43758.5453123); }
vec2 hash22(vec2 p){ return vec2(hash2(ivec2(floor(p))), hash2(ivec2(floor(p))+ivec2(71,13))); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0); ivec2 ii=ivec2(i);
  float a=hash2(ii), b=hash2(ii+ivec2(1,0)), c=hash2(ii+ivec2(0,1)), d=hash2(ii+ivec2(1,1)); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p, int oct){ float s=0.0, a=0.5; for(int i=0;i<oct;i++){ s+=a*vnoise(p); p=vec2(0.8*p.x-0.6*p.y, 0.6*p.x+0.8*p.y)*2.03+vec2(17.3,9.1); a*=0.5; } return s; }
float fbmQ(vec2 p){ return fbm(p,3); }
float terrainH(vec2 p){
  if (MODE < 0.5) {
    float r = length(p), n = fbm(p*0.025,4);
    float h = (n-0.5)*1.6*smoothstep(4.0,30.0,r);
    h += smoothstep(34.0,78.0,r)*(7.0+26.0*fbm(p*0.012+3.1,4));
    h += smoothstep(150.0,420.0,r)*70.0*fbm(p*0.004+9.0,5);
    return h;
  }
  if (MODE > 1.5) { float r = length(p); return smoothstep(52.0,72.0,r)*(16.0+10.0*fbm(p*0.02+5.0,3)) + (fbm(p*0.05,3)-0.5)*0.35*smoothstep(0.0,40.0,r); }
  float c = fbm(p*0.0011+1.3,5), m = fbm(p*0.003+7.7,5);
  float rg = 1.0-abs(2.0*fbm(p*0.0042+2.0,5)-1.0); rg*=rg;
  float h = (c-0.5)*46.0 + (m-0.5)*26.0 + smoothstep(0.5,0.72,c)*rg*190.0;
  vec2 q = p-vec2(-250.0,190.0); h -= 26.0*exp(-dot(q,q)/(110.0*110.0));
  vec2 a = p-vec2(520.0,-420.0); h += 38.0*exp(-dot(a,a)/(140.0*140.0));
  h = mix((m-0.5)*2.5, h, smoothstep(45.0,170.0,length(p)));
  h = mix(30.0, h, smoothstep(34.0,70.0,length(a)));
  for (int i=0;i<4;i++) { if (uArena[i].w > 0.0) { float d = length(p-uArena[i].xz); h = mix(uArena[i].y, h, smoothstep(uArena[i].w*0.6, uArena[i].w*1.15, d)); } }
  return h;
}
vec3 terrainN(vec2 p, float e){ float hx0=terrainH(p-vec2(e,0.)), hx1=terrainH(p+vec2(e,0.)), hz0=terrainH(p-vec2(0.,e)), hz1=terrainH(p+vec2(0.,e)); return normalize(vec3(hx0-hx1, 2.0*e, hz0-hz1)); }
`
const GLSL_LIGHT = `
uniform highp sampler2DShadow uShadow;
float shadowAt(vec3 wp, vec3 N){
  vec4 sp = uShadowVP * vec4(wp + N*0.06, 1.0); vec3 c = sp.xyz/sp.w*0.5+0.5;
  if (c.x<0.0||c.x>1.0||c.y<0.0||c.y>1.0||c.z>1.0) return 1.0;
  float fade = smoothstep(0.80,0.98,max(abs(c.x*2.0-1.0),abs(c.y*2.0-1.0)));
  float s = 0.0, tx = 1.0/2048.0; 
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s += texture(uShadow, vec3(c.xy+vec2(float(i),float(j))*tx*1.2, c.z-0.0012));
  return mix(s/9.0, 1.0, fade);
}
float shadow1(vec3 wp){ vec4 sp = uShadowVP * vec4(wp + vec3(0.0,0.08,0.0), 1.0); vec3 c = sp.xyz/sp.w*0.5+0.5; if (c.x<0.0||c.x>1.0||c.y<0.0||c.y>1.0||c.z>1.0) return 1.0; return texture(uShadow, vec3(c.xy, c.z-0.0015)); }
vec3 ambient(vec3 N){ return mix(uGndAmb.rgb, uSkyAmb.rgb, N.y*0.5+0.5); }
vec3 pointLights(vec3 wp, vec3 N){
  vec3 r = vec3(0.0);
  vec3 d0 = uPL0p.xyz - wp; float l0 = length(d0); float a0 = clamp(1.0 - l0/uPL0p.w, 0.0, 1.0); r += uPL0c.rgb * a0*a0 * max(dot(N, d0/l0)*0.7+0.3, 0.0);
  vec3 d1 = uPL1p.xyz - wp; float l1 = length(d1); float a1 = clamp(1.0 - l1/uPL1p.w, 0.0, 1.0); r += uPL1c.rgb * a1*a1 * max(dot(N, d1/l1)*0.7+0.3, 0.0);
  return r;
}
vec3 skyCol(vec3 d){
  float y = clamp(d.y, -0.2, 1.0);
  vec3 c = mix(uHorizon.rgb, uZenith.rgb, pow(max(y,0.0), 0.42));
  float mu = max(dot(d, uSunDir.xyz), 0.0);
  c += uSunCol.rgb * (pow(mu, 8.0)*0.05 + pow(mu, 64.0)*0.10);
  return c;
}
vec3 applyFog(vec3 col, vec3 wp){
  vec3 v = wp - uCam.xyz; float dist = length(v); vec3 d = v/max(dist,0.001);
  float hf = exp(-max(wp.y - uCam.w,0.0)*0.012); float f = 1.0 - exp(-dist*uFog.w*(0.35+0.65*hf));
  vec3 fc = skyCol(vec3(d.x, max(d.y,0.02)*0.5, d.z));
  float mu = max(dot(d, uSunDir.xyz), 0.0); fc += uSunCol.rgb*pow(mu,6.0)*0.22*uSunDir.w;
  return mix(col, fc, clamp(f,0.0,0.97));
}
`
window.__RealmCore = { M, clamp, mix, sstep, len2, TAU, ihash, vnoise, fbm, terrainH, terrainN, waterY, WORLD, GLSL_HEAD, GLSL_NOISE, GLSL_LIGHT, setMode: (m) => { MODE = m }, getMode: () => MODE, baseWorld }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, { M, clamp, mix, sstep } = C
const { GLSL_HEAD, GLSL_NOISE, GLSL_LIGHT } = C

// forest density (same formula as forestD in GLSL)
const forestAt = (x, z, h) => C.getMode() !== 1 ? 0 : sstep(0.5, 0.6, C.fbm(x * 0.0065 + 30, z * 0.0065 + 30, 4)) * sstep(55, 130, Math.hypot(x, z)) * (1 - sstep(130, 175, h)) * (1 - sstep(110, 60, Math.hypot(x - 520, z + 420)))

const GLSL_GROUND = `
uniform vec2 uPath[8]; uniform vec3 uPlaza;
float pathD(vec2 p){ if (MODE != 1.0) return 1e9; p += vec2(vnoise(p*0.05)-0.5, vnoise(p*0.05+9.0)-0.5)*7.0; float d=1e9; for(int i=0;i<7;i++){ vec2 a=uPath[i], b=uPath[i+1], pa=p-a, ba=b-a; float t=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); d=min(d,length(pa-ba*t)); } return d; }
float forestD(vec2 p, float h){ if (MODE != 1.0) return 0.0; return smoothstep(0.5,0.6,fbm(p*0.0065+30.0,4)) * smoothstep(55.0,130.0,length(p)) * (1.0-smoothstep(130.0,175.0,h)) * (1.0-smoothstep(110.0,60.0,length(p-vec2(520.0,-420.0)))); }
vec3 groundAlbedo(vec2 p, float h, vec3 N, out float grassAmt){
  float slope = 1.0 - N.y;
  if (MODE > 1.5) { // stone arena: paving, dirt, grass only on the rim
    float r = length(p), n1 = vnoise(p*0.8), n2 = vnoise(p*6.0), big = fbm(p*0.02+4.0,3);
    vec3 st = mix(vec3(0.075,0.07,0.068), vec3(0.14,0.13,0.12), n1) * (0.6 + 0.7*n2);
    vec2 gg = abs(fract(p*0.25)-0.5); float seam = smoothstep(0.455,0.5,max(gg.x,gg.y)); st *= 1.0 - 0.6*seam;
    st = mix(st, vec3(0.03,0.028,0.026), smoothstep(0.62,0.9,vnoise(p*0.35+3.0))*0.6);
    vec3 dirt = vec3(0.06,0.045,0.03)*(0.7+0.6*n1); vec3 gr = mix(vec3(0.022,0.044,0.010), vec3(0.046,0.074,0.016), smoothstep(0.3,0.7,big));
    float rimk = smoothstep(50.0,66.0,r); vec3 c = mix(mix(st, dirt, smoothstep(30.0,46.0,r)), gr, rimk);
    float rk2 = smoothstep(0.30,0.5,slope); c = mix(c, vec3(0.12,0.11,0.105)*(0.7+0.6*n2), rk2);
    grassAmt = rimk*(1.0-rk2); return c;
  }
  float big = fbm(p*0.02+4.0,3), mid = vnoise(p*0.35), fine = vnoise(p*3.1);
  vec3 g1 = vec3(0.022,0.044,0.010), g2 = vec3(0.046,0.074,0.016), dry = vec3(0.120,0.100,0.036);
  vec3 grass = mix(g1,g2,smoothstep(0.3,0.7,big));
  grass = mix(grass, dry, smoothstep(0.62,0.86,fbm(p*0.011+9.0,3))*0.5);
  grass *= 0.74 + 0.5*mid*fine + 0.22*(fine-0.5);
  vec3 dirt = vec3(0.085,0.055,0.032)*(0.7+0.6*mid);
  vec3 rock = mix(vec3(0.12,0.11,0.105), vec3(0.21,0.19,0.17), vnoise(p*vec2(0.7,2.4)+h*0.4)) * (0.72+0.55*fine);
  vec3 sand = vec3(0.30,0.24,0.15)*(0.8+0.4*mid);
  vec3 snow = vec3(0.70,0.73,0.78);
  float fd = forestD(p,h);
  vec3 litter = vec3(0.060,0.045,0.020)*(0.7+0.7*mid);
  vec3 c = mix(grass, litter, fd*0.8);
  float pd = pathD(p); float pm = (1.0-smoothstep(1.2,2.6,pd))*0.95;
  c = mix(c, dirt, pm);
  float rk = smoothstep(0.26,0.46,slope+(fine-0.5)*0.05);
  c = mix(c, rock, rk);
  float shore = smoothstep(WATERY+2.2, WATERY+0.3, h) * (1.0-rk);
  c = mix(c, sand, shore);
  c = mix(c, dirt*0.5, smoothstep(WATERY+0.2, WATERY-1.2, h));
  float sn = smoothstep(120.0,150.0,h + (fbm(p*0.03,3)-0.5)*30.0) * (1.0-smoothstep(0.35,0.6,slope));
  c = mix(c, snow, sn);
  grassAmt = (1.0-rk) * (1.0-pm) * (1.0-shore) * (1.0-sn) * (1.0 - fd*0.75) * smoothstep(WATERY-0.5, WATERY+0.9, h);
  if (uPlaza.z > 0.0) { float pz = 1.0 - smoothstep(uPlaza.z-1.2, uPlaza.z, length(p-uPlaza.xy)); c = mix(c, vec3(0.12), pz); grassAmt *= 1.0 - pz; }
  return c;
}
`

// ---------------------------------------------------------------- program helpers
function compile(gl, type, src, label) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'); throw new Error('Shader ' + label + ': ' + gl.getShaderInfoLog(s) + '\n' + lines.slice(0, 6000)) }
  return s
}
function makeProg(gl, label, vs, fs, opts = {}) {
  const p = gl.createProgram(), head = GLSL_HEAD + GLSL_NOISE + (opts.ground ? GLSL_GROUND : '')
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, head + (opts.lightVS ? GLSL_LIGHT : '') + vs, label + '.vs'))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, head + GLSL_LIGHT + fs, label + '.fs'))
  if (opts.attribs) opts.attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link ' + label + ': ' + gl.getProgramInfoLog(p))
  const bi = gl.getUniformBlockIndex(p, 'G'); if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0)
  const locs = {}, loc = (n) => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(p, n)))
  return {
    p, use() { gl.useProgram(p); return this },
    f1(n, v) { gl.uniform1f(loc(n), v) }, i1(n, v) { gl.uniform1i(loc(n), v) }, f2(n, a, b) { gl.uniform2f(loc(n), a, b) }, f3(n, a, b, c) { gl.uniform3f(loc(n), a, b, c) }, f4(n, a, b, c, d) { gl.uniform4f(loc(n), a, b, c, d) },
    m4(n, m) { gl.uniformMatrix4fv(loc(n), false, m) }, v2(n, a) { gl.uniform2fv(loc(n), a) }, v3(n, a) { gl.uniform3fv(loc(n), a) },
  }
}

// ---------------------------------------------------------------- shaders: sky, terrain, post
const FS_TRI = `out vec2 vUV; void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV = p; gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`
const SKY_FS = `
in vec2 vUV; out vec4 o;
float h21(vec2 p){ return hash2(ivec2(floor(p))); }
vec3 skyFull(vec3 d){
  vec3 c = skyCol(d);
  float night = uExtra.x;
  // stars + moon
  if (d.y > 0.0 && night > 0.02) {
    vec2 sp = vec2(atan(d.z,d.x)*60.0, d.y*60.0); vec2 id = floor(sp), f = fract(sp)-0.5;
    float r = hash2(ivec2(id)), s = step(0.987, r) * smoothstep(0.22,0.0,length(f+ (vec2(hash2(ivec2(id)+ivec2(5,7)),hash2(ivec2(id)+ivec2(9,3)))-0.5)*0.4));
    c += vec3(0.8,0.9,1.0) * s * (0.4+1.6*hash2(ivec2(id)+ivec2(3,3))) * (0.7+0.3*sin(TIME*3.0+r*40.0)) * night * smoothstep(0.0,0.12,d.y);
  }
  float mm = dot(d, uMoon.xyz);
  if (mm > 0.9992 && uMoon.y > -0.05) { float cr = fbm(d.xz*90.0+d.y*50.0,3); c = mix(c, vec3(0.9,0.93,1.0)*(1.1+0.5*cr)*(0.5+night), smoothstep(0.9992,0.99935,mm)); }
  c += vec3(0.5,0.6,1.0)*pow(max(mm,0.0), 220.0)*0.35*night;
  // sun disc
  float mu = dot(d, uSunDir.xyz);
  if (mu > 0.99987) c = mix(c, uSunCol.rgb*7.0, smoothstep(0.99987,0.99992,mu)) ;
  // clouds
  if (d.y > 0.015) {
    float t = (2400.0 - uCam.y)/d.y; vec2 q = (uCam.xz + d.xz*t)*0.00032 + vec2(TIME*0.0035, TIME*0.0012);
    float w = fbm(q*1.3+3.0,3)*0.6;
    float dn = fbm(q + w, 5), cover = mix(0.50, 0.40, uExtra.y);
    float a = smoothstep(cover, cover+0.22, dn);
    float dl = fbm(q + w + uSunDir.xz*0.045, 4);
    float lit = clamp(0.62 + (dn - dl)*5.0, 0.0, 1.0);
    vec3 cl = mix(uSkyAmb.rgb*0.7, uSunCol.rgb*0.75 + uSkyAmb.rgb*0.9, lit);
    cl += uSunCol.rgb * pow(max(mu,0.0), 6.0) * (1.0-a)*0.9 * a;
    cl = mix(cl, uSkyAmb.rgb*0.35, 0.25*smoothstep(0.55,0.95,dn));
    a *= smoothstep(0.015, 0.22, d.y);
    c = mix(c, cl, a*0.96);
  }
  if (d.y < 0.0) c = mix(c, uHorizon.rgb*0.8, smoothstep(0.0,-0.15,d.y));
  return c;
}
void main(){
  vec2 s = vUV*2.0-1.0; vec3 d = normalize(uCF.xyz + uCR.xyz*s.x*uCR.w*uCU.w + uCU.xyz*s.y*uCR.w);
  o = vec4(skyFull(d), 1.0);
}`
const TERRAIN_VS = `
in vec2 aXZ; in float aSk;
uniform vec4 uRing;
out vec3 vW; out vec3 vN;
void main(){
  vec2 p = uRing.xy + aXZ*uRing.z; float h = terrainH(p);
  vec3 N = terrainN(p, max(uRing.z, 0.5));
  vec3 wp = vec3(p.x, h - aSk*(1.5+uRing.z*2.5), p.y);
  vW = wp; vN = N; gl_Position = uVP * vec4(wp, 1.0);
}`
const TERRAIN_FS = `
in vec3 vW; in vec3 vN; out vec4 o;
void main(){
  if (uExtra.w > 0.5) { o = vec4(0.0); return; }
  vec3 N = normalize(vN); vec2 p = vW.xz;
  // fine bump from noise, strongest up close
  float dist = length(vW - uCam.xyz); float k = 1.0 - smoothstep(10.0, 60.0, dist);
  float e = 0.15; float b0 = vnoise(p*2.7), bx = vnoise((p+vec2(e,0.0))*2.7), bz = vnoise((p+vec2(0.0,e))*2.7);
  vec3 Ng = N; N = normalize(N + vec3((b0-bx), 0.0, (b0-bz))*0.9*k);
  float grassAmt; vec3 alb = groundAlbedo(p, vW.y, Ng, grassAmt);
  float sh = shadowAt(vW, N);
  float ndl = max(dot(N, uSunDir.xyz), 0.0);
  float ao = 0.72 + 0.28*smoothstep(0.0,0.7,N.y);
  vec3 lit = alb * (uSunCol.rgb*ndl*sh + ambient(N)*ao + pointLights(vW,N));
  o = vec4(applyFog(lit, vW), 1.0);
}`
const BLOOM_DOWN = `
in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFirst; uniform float uThresh;
vec3 prefilter(vec3 c){ float br = max(max(c.r,c.g),c.b); float k = max(br-uThresh, 0.0); k = k*k/(k+1.0); return c * (k/max(br,0.0001)); }
void main(){
  vec2 t = uTexel; vec3 a = texture(uTex, vUV + t*vec2(-2,-2)).rgb, b = texture(uTex, vUV + t*vec2(0,-2)).rgb, c = texture(uTex, vUV + t*vec2(2,-2)).rgb;
  vec3 d = texture(uTex, vUV + t*vec2(-2,0)).rgb, e = texture(uTex, vUV).rgb, f = texture(uTex, vUV + t*vec2(2,0)).rgb;
  vec3 g = texture(uTex, vUV + t*vec2(-2,2)).rgb, h = texture(uTex, vUV + t*vec2(0,2)).rgb, i = texture(uTex, vUV + t*vec2(2,2)).rgb;
  vec3 j = texture(uTex, vUV + t*vec2(-1,-1)).rgb, k = texture(uTex, vUV + t*vec2(1,-1)).rgb, l = texture(uTex, vUV + t*vec2(-1,1)).rgb, m = texture(uTex, vUV + t*vec2(1,1)).rgb;
  if (uFirst > 0.5) { a=prefilter(a);b=prefilter(b);c=prefilter(c);d=prefilter(d);e=prefilter(e);f=prefilter(f);g=prefilter(g);h=prefilter(h);i=prefilter(i);j=prefilter(j);k=prefilter(k);l=prefilter(l);m=prefilter(m); }
  vec3 r = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  o = vec4(r, 1.0);
}`
const BLOOM_UP = `
in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 t = uTexel; vec3 r = texture(uTex, vUV).rgb*4.0;
  r += texture(uTex, vUV+t*vec2(-1,0)).rgb*2.0 + texture(uTex, vUV+t*vec2(1,0)).rgb*2.0 + texture(uTex, vUV+t*vec2(0,-1)).rgb*2.0 + texture(uTex, vUV+t*vec2(0,1)).rgb*2.0;
  r += texture(uTex, vUV+t*vec2(-1,-1)).rgb + texture(uTex, vUV+t*vec2(1,-1)).rgb + texture(uTex, vUV+t*vec2(-1,1)).rgb + texture(uTex, vUV+t*vec2(1,1)).rgb;
  o = vec4(r/16.0, 1.0);
}`
const COMPOSITE = `
in vec2 vUV; out vec4 o; uniform sampler2D uScene; uniform sampler2D uBloom; uniform vec2 uRes; uniform float uExposure, uBloomAmt, uFlash, uFade, uBars; uniform vec3 uFlashCol;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUV; vec2 cc = uv-0.5; float ca = dot(cc,cc)*0.0035;
  vec3 col = vec3(texture(uScene, uv+cc*ca).r, texture(uScene, uv).g, texture(uScene, uv-cc*ca).b);
  col += texture(uBloom, uv).rgb * uBloomAmt;
  col *= uExposure;
  float vig = smoothstep(1.05, 0.30, length(cc*vec2(uRes.x/uRes.y,1.0)));
  col *= mix(0.72, 1.0, vig);
  float lum = dot(col, vec3(0.2126,0.7152,0.0722)); col = mix(vec3(lum), col, 1.08);
  col = aces(col);
  col = pow(col, vec3(1.0/2.2));
  col += (hash2(ivec2(gl_FragCoord.xy) + ivec2(int(TIME*60.0)%97, 3)) - 0.5) * 0.012;
  col = mix(col, uFlashCol, uFlash);
  col *= 1.0 - uFade;
  if (uBars > 0.0 && abs(uv.y-0.5) > 0.5 - uBars) col = vec3(0.0);
  o = vec4(col, 1.0);
}`

// ---------------------------------------------------------------- the engine
function createEngine(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.debug })
  if (!gl) throw new Error('WebGL 2 is not available on this device.')
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear'); gl.getExtension('EXT_color_buffer_half_float')
  const E = { gl, canvas, hasFloat, w: 2, h: 2, q: opts.quality || 2, draw: null, plaza: [0, 0, -1] }
  // ---- global uniform block
  const GF = new Float32Array(124), ubo = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, ubo); gl.bufferData(gl.UNIFORM_BUFFER, GF.byteLength, gl.DYNAMIC_DRAW); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)
  E.G = GF; E.pushG = () => { gl.bindBuffer(gl.UNIFORM_BUFFER, ubo); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, GF) }
  const set4 = (o, a, b, c, d) => { GF[o] = a; GF[o + 1] = b; GF[o + 2] = c; GF[o + 3] = d }
  E.setVec = set4
  // offsets (floats): VP0 SVP16 CAM32 SUNDIR36 SUNCOL40 SKYAMB44 GNDAMB48 FOG52 TIME56 ZEN60 HOR64 PL0P68 PL0C72 PL1P76 PL1C80 PLAYER84 CR88 CU92 CF96 MOON100 EXTRA104
  E.OFF = { VP: 0, SVP: 16, CAM: 32, SUNDIR: 36, SUNCOL: 40, SKYAMB: 44, GNDAMB: 48, FOG: 52, TIME: 56, ZEN: 60, HOR: 64, PL0P: 68, PL0C: 72, PL1P: 76, PL1C: 80, PLAYER: 84, CR: 88, CU: 92, CF: 96, MOON: 100, EXTRA: 104, ARENA: 108 }
  E.prog = (label, vs, fs, o) => makeProg(gl, label, vs, fs, o)

  // ---- programs
  const triVS = GLSL_HEAD + FS_TRI
  const mkPost = (label, fs) => { const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, triVS, label + '.vs')); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, GLSL_HEAD + GLSL_NOISE + fs, label + '.fs')); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link ' + label + ': ' + gl.getProgramInfoLog(p)); const bi = gl.getUniformBlockIndex(p, 'G'); if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0); const L = {}; const loc = (n) => (n in L ? L[n] : (L[n] = gl.getUniformLocation(p, n))); return { p, use() { gl.useProgram(p); return this }, f1: (n, v) => gl.uniform1f(loc(n), v), i1: (n, v) => gl.uniform1i(loc(n), v), f2: (n, a, b) => gl.uniform2f(loc(n), a, b), f3: (n, a, b, c) => gl.uniform3f(loc(n), a, b, c) } }
  const skyP = (() => { const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, triVS, 'sky.vs')); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, GLSL_HEAD + GLSL_NOISE + GLSL_LIGHT + SKY_FS, 'sky.fs')); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link sky: ' + gl.getProgramInfoLog(p)); gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'G'), 0); return p })()
  const bloomDown = mkPost('bloomDown', BLOOM_DOWN), bloomUp = mkPost('bloomUp', BLOOM_UP), comp = mkPost('composite', COMPOSITE)
  const terr = E.prog('terrain', TERRAIN_VS, TERRAIN_FS, { attribs: ['aXZ', 'aSk'], ground: true })
  const emptyVAO = gl.createVertexArray()

  // ---- terrain rings (grid with skirts)
  function ringGeo(N) {
    const verts = [], idx = [], w = N + 1, half = N / 2
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) verts.push(i - half, j - half, 0)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d) }
    const sk = (list) => { const base = verts.length / 3; list.forEach((v) => verts.push(verts[v * 3], verts[v * 3 + 1], 1)); for (let k = 0; k < list.length - 1; k++) { const a = list[k], b = list[k + 1], a2 = base + k, b2 = base + k + 1; idx.push(a, a2, b, b, a2, b2) } }
    const top = [], bot = [], left = [], right = []
    for (let i = 0; i <= N; i++) { top.push(i); bot.push(N * w + i); left.push(i * w); right.push(i * w + N) }
    sk(top); sk(bot); sk(left); sk(right)
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao)
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8)
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW)
    gl.bindVertexArray(null); return { vao, n: idx.length }
  }
  const RING_N = E.q >= 2 ? 160 : 112, rg = ringGeo(RING_N)
  const RINGS = [{ s: 0.5, k: 0 }, { s: 2, k: 1 }, { s: 16, k: 2 }]
  E.drawTerrain = (camX, camZ, path) => {
    terr.use(); gl.bindVertexArray(rg.vao); gl.enable(gl.POLYGON_OFFSET_FILL)
    if (path) terr.v2('uPath', path)
    terr.f3('uPlaza', E.plaza[0], E.plaza[1], E.plaza[2])
    for (const r of RINGS) { const sn = r.s * 2; terr.f4('uRing', Math.floor(camX / sn) * sn, Math.floor(camZ / sn) * sn, r.s, r.k); gl.polygonOffset(r.k * 2, r.k * 2); gl.drawElements(gl.TRIANGLES, rg.n, gl.UNSIGNED_INT, 0) }
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindVertexArray(null)
  }
  E.terrProg = terr

  // ---- render targets
  let msaa = null, resolve = null, bloom = [], shadowFB = null, shadowTex = null
  const mkTex = (w, h, fmt = 'f') => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); const f = hasFloat && fmt === 'f'; gl.texImage2D(gl.TEXTURE_2D, 0, f ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, f ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t }
  const mkFB = (tex) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f }
  function buildTargets() {
    const w = E.w, h = E.h
    if (msaa) { gl.deleteFramebuffer(msaa.fb); gl.deleteRenderbuffer(msaa.cb); gl.deleteRenderbuffer(msaa.db) }
    if (resolve) { gl.deleteFramebuffer(resolve.fb); gl.deleteTexture(resolve.tex) }
    bloom.forEach((b) => { gl.deleteFramebuffer(b.fb); gl.deleteTexture(b.tex) }); bloom = []
    const samples = E.q >= 2 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES)) : 0
    const rtex = mkTex(w, h), rfb = mkFB(rtex); resolve = { tex: rtex, fb: rfb }
    const db = gl.createRenderbuffer(), cb = gl.createRenderbuffer(), fb = gl.createFramebuffer()
    const build = (s) => { gl.bindRenderbuffer(gl.RENDERBUFFER, cb); s ? gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, hasFloat ? gl.RGBA16F : gl.RGBA8, w, h) : gl.renderbufferStorage(gl.RENDERBUFFER, hasFloat ? gl.RGBA16F : gl.RGBA8, w, h)
      gl.bindRenderbuffer(gl.RENDERBUFFER, db); s ? gl.renderbufferStorageMultisample(gl.RENDERBUFFER, s, gl.DEPTH_COMPONENT24, w, h) : gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, cb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db); return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE }
    let ok = build(samples), used = samples; if (!ok) { ok = build(0); used = 0 }
    msaa = { fb, cb, db, samples: used }; E.msaa = used
    let bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1)
    for (let i = 0; i < 5; i++) { const t = mkTex(bw, bh), f = mkFB(t); bloom.push({ tex: t, fb: f, w: bw, h: bh }); bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1) }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  const SH = E.q >= 2 ? 2048 : 1024
  { shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SH, SH, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)
    shadowFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null) }
  E.SH = SH
  E.shadowUnit = 7 // every program that samples shadows needs uShadow = 7
  E.bindShadow = (prog) => { prog.i1('uShadow', 7) }
  E.resize = (w, h) => { E.w = Math.max(2, w | 0); E.h = Math.max(2, h | 0); canvas.width = E.w; canvas.height = E.h; buildTargets() }

  // ---- frame
  E.frame = (cb) => { // cb: { shadow(), opaque(), transparent(), additive(), flash, fade, bars, exposure, bloom }
    gl.activeTexture(gl.TEXTURE0 + 7); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.activeTexture(gl.TEXTURE0)
    // shadow pass: UBO's VP is the light matrix
    const savedVP = GF.slice(0, 16), savedEx = GF[E.OFF.EXTRA + 3]
    GF.set(GF.subarray(16, 32), 0); GF[E.OFF.EXTRA + 3] = 1; E.pushG()
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB); gl.viewport(0, 0, SH, SH); gl.colorMask(false, false, false, false); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4); if (cb.shadow) cb.shadow(); gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true)
    GF.set(savedVP, 0); GF[E.OFF.EXTRA + 3] = savedEx; E.pushG()
    // main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, msaa.fb); gl.viewport(0, 0, E.w, E.h); gl.clearColor(0, 0, 0, 1); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK)
    gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.useProgram(skyP); gl.bindVertexArray(emptyVAO); gl.disable(gl.DEPTH_TEST); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST); gl.depthMask(true)
    gl.enable(gl.CULL_FACE)
    gl.useProgram(terr.p); terr.i1('uShadow', 7)
    if (cb.opaque) cb.opaque()
    gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false)
    if (cb.transparent) cb.transparent()
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); if (cb.additive) cb.additive()
    gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null)
    // resolve
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaa.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolve.fb); gl.blitFramebuffer(0, 0, E.w, E.h, 0, 0, E.w, E.h, gl.COLOR_BUFFER_BIT, gl.NEAREST)
    // bloom
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(emptyVAO); gl.activeTexture(gl.TEXTURE0)
    let src = resolve.tex, sw = E.w, sh = E.h
    for (let i = 0; i < bloom.length; i++) { const b = bloom[i]; gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h); bloomDown.use().i1('uTex', 0); bloomDown.f2('uTexel', 1 / sw, 1 / sh); bloomDown.f1('uFirst', i === 0 ? 1 : 0); bloomDown.f1('uThresh', 1.1); gl.bindTexture(gl.TEXTURE_2D, src); gl.drawArrays(gl.TRIANGLES, 0, 3); src = b.tex; sw = b.w; sh = b.h }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = bloom.length - 2; i >= 0; i--) { const b = bloom[i], s = bloom[i + 1]; gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h); bloomUp.use().i1('uTex', 0); bloomUp.f2('uTexel', 1 / s.w, 1 / s.h); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.drawArrays(gl.TRIANGLES, 0, 3) }
    gl.disable(gl.BLEND)
    // composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, E.w, E.h)
    comp.use(); comp.i1('uScene', 0); comp.i1('uBloom', 1); comp.f2('uRes', E.w, E.h); comp.f1('uExposure', cb.exposure || 1); comp.f1('uBloomAmt', cb.bloom == null ? 0.5 : cb.bloom); comp.f1('uFlash', cb.flash || 0); comp.f1('uFade', cb.fade || 0); comp.f1('uBars', cb.bars || 0); comp.f3('uFlashCol', ...(cb.flashCol || [1, 0.9, 0.7]))
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, resolve.tex); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloom[0].tex); gl.activeTexture(gl.TEXTURE0)
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); gl.enable(gl.DEPTH_TEST)
  }
  return E
}
window.__RealmGL = { createEngine, forestAt, GLSL_GROUND, makeProg, compile, GLSL_HEAD_PUB: GLSL_HEAD }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, { M, clamp, mix, sstep } = C
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k]

// Time of day -> every colour the shaders need. t in hours (0..24).
function atmosphere(hours, cloud) {
  const ang = ((hours - 6) / 24) * Math.PI * 2, sunDir = [Math.cos(ang) * 0.55, Math.sin(ang), Math.cos(ang) * 0.83 + 0.15]
  const l = Math.hypot(...sunDir); sunDir[0] /= l; sunDir[1] /= l; sunDir[2] /= l
  const s = sunDir[1], day = sstep(-0.12, 0.28, s), tw = sstep(-0.18, 0.0, s) * (1 - sstep(0.0, 0.32, s)), night = 1 - sstep(-0.22, -0.02, s)
  const moonDir = [-sunDir[0] * 0.9 + 0.2, Math.max(0.25, -sunDir[1] * 0.8 + 0.35), -sunDir[2] * 0.9]; const ml = Math.hypot(...moonDir); moonDir[0] /= ml; moonDir[1] /= ml; moonDir[2] /= ml
  let zen = lerp3([0.004, 0.007, 0.022], [0.075, 0.20, 0.55], day), hor = lerp3([0.012, 0.018, 0.04], [0.42, 0.58, 0.78], day)
  hor = lerp3(hor, [0.95, 0.42, 0.17], tw * 0.85); zen = lerp3(zen, [0.10, 0.12, 0.30], tw * 0.5)
  const warm = 1 - sstep(0.0, 0.5, s)
  let sunCol = lerp3([1.0, 0.93, 0.80], [1.0, 0.50, 0.22], warm), sunI = 3.6 * sstep(-0.03, 0.14, s); sunCol = mul3(sunCol, sunI)
  // light that actually shines on the ground: the sun by day, the moon at night
  let ldir = sunDir, lcol = sunCol
  const moonCol = mul3([0.45, 0.58, 1.0], 0.42 * night)
  if (s < 0.02) { const k = sstep(0.02, -0.06, s); ldir = [mix(sunDir[0], moonDir[0], k), mix(Math.max(sunDir[1], 0.12), moonDir[1], k), mix(sunDir[2], moonDir[2], k)]; const q = Math.hypot(...ldir); ldir = [ldir[0] / q, Math.max(ldir[1] / q, 0.1), ldir[2] / q]; lcol = lerp3(sunCol, moonCol, k) }
  const skyAmb = mul3(lerp3(lerp3(hor, zen, 0.6), [0.6, 0.55, 0.5], 0.12), 0.95 * (0.35 + 0.65 * day) + 0.18 * night)
  const gndAmb = mul3(lerp3([0.02, 0.025, 0.03], [0.11, 0.15, 0.07], day), 1)
  const fog = hor
  return { sunDir, ldir, lcol, moonDir, zen, hor, skyAmb, gndAmb, fog, night, day, exposure: mix(2.1, 1.05, day) * (1 - 0.12 * tw), cloud }
}

// push all per-frame data into the global uniform block
function writeFrame(E, f) {
  const G = E.G, O = E.OFF, a = f.atmo, c = f.cam
  const fwd = [c.target[0] - c.pos[0], c.target[1] - c.pos[1], c.target[2] - c.pos[2]], fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl
  let rx = fwd[2], rz = -fwd[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl
  const right = [rx, 0, rz], up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]]
  const proj = M.persp(c.fov, c.aspect, 0.15, 4000), view = M.look(c.pos, c.target, [0, 1, 0]), vp = M.mul(proj, view)
  G.set(vp, O.VP); G.set(f.shadowVP, O.SVP)
  E.setVec(O.CAM, c.pos[0], c.pos[1], c.pos[2], f.groundY)
  E.setVec(O.SUNDIR, a.ldir[0], a.ldir[1], a.ldir[2], clamp(a.ldir[1] * 2, 0, 1))
  E.setVec(O.SUNCOL, a.lcol[0], a.lcol[1], a.lcol[2], 1)
  E.setVec(O.SKYAMB, a.skyAmb[0], a.skyAmb[1], a.skyAmb[2], 1); E.setVec(O.GNDAMB, a.gndAmb[0], a.gndAmb[1], a.gndAmb[2], 1)
  E.setVec(O.FOG, a.fog[0], a.fog[1], a.fog[2], f.fogDensity)
  E.setVec(O.TIME, f.time, C.getMode(), C.waterY(), f.wind)
  E.setVec(O.ZEN, a.zen[0], a.zen[1], a.zen[2], 1); E.setVec(O.HOR, a.hor[0], a.hor[1], a.hor[2], 1)
  const p0 = f.lights[0] || [0, -999, 0, 1, 0, 0, 0], p1 = f.lights[1] || [0, -999, 0, 1, 0, 0, 0]
  E.setVec(O.PL0P, p0[0], p0[1], p0[2], p0[3]); E.setVec(O.PL0C, p0[4], p0[5], p0[6], 1); E.setVec(O.PL1P, p1[0], p1[1], p1[2], p1[3]); E.setVec(O.PL1C, p1[4], p1[5], p1[6], 1)
  E.setVec(O.PLAYER, f.player[0], f.player[1], f.player[2], f.bendRadius || 1.4)
  E.setVec(O.CR, right[0], right[1], right[2], Math.tan(c.fov / 2)); E.setVec(O.CU, up[0], up[1], up[2], c.aspect); E.setVec(O.CF, fwd[0], fwd[1], fwd[2], 0)
  E.setVec(O.MOON, a.moonDir[0], a.moonDir[1], a.moonDir[2], 0)
  E.setVec(O.EXTRA, a.night, a.cloud, f.flash || 0, 0)
  for (let i = 0; i < 4; i++) { const ar = C.WORLD.arenas[i]; E.setVec(O.ARENA + i * 4, ar ? ar.x : 0, ar ? ar.h : 0, ar ? ar.z : 0, ar ? ar.r : 0) }
  E.pushG()
  return { vp, view, right, up, fwd }
}

// shadow matrix: orthographic box that follows the player, snapped to texels so shadows do not crawl
function shadowMatrix(E, a, center, radius) {
  const L = a.ldir, eye = [center[0] + L[0] * 120, center[1] + L[1] * 120, center[2] + L[2] * 120]
  const view = M.look(eye, center, Math.abs(L[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]), proj = M.ortho(-radius, radius, -radius, radius, 1, 300), m = M.mul(proj, view)
  const texel = (2 * radius) / E.SH, sx = m[12], sy = m[13]; const snapx = Math.round(sx / (2 / E.SH)) * (2 / E.SH), snapy = Math.round(sy / (2 / E.SH)) * (2 / E.SH)
  m[12] += snapx - sx; m[13] += snapy - sy; void texel
  return m
}
window.__RealmAtmo = { atmosphere, writeFrame, shadowMatrix }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, G = window.__RealmGL

// ---- ground cache: terrain height, normal, grass amount and albedo for a 128 m window around the camera (rendered once per 16 m of walking)
const GC_FS = `
in vec2 vUV; layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; uniform vec4 uWin;
void main(){
  vec2 p = uWin.xy + vUV*uWin.z; float h = terrainH(p); vec3 N = terrainN(p, 0.3); float ga; vec3 alb = groundAlbedo(p, h, N, ga);
  o0 = vec4(h, N.x, N.z, ga); o1 = vec4(alb, 1.0);
}`
function createGround(E) {
  const gl = E.gl, SIZE = 128, RES = E.q >= 2 ? 512 : 384
  const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, E.hasFloat ? gl.RGBA16F : gl.RGBA8, RES, RES, 0, gl.RGBA, E.hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t }
  const t0 = mk(), t1 = mk(), fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t0, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, t1, 0); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  const P = (() => { const p = gl.createProgram(), head = G.GLSL_HEAD_PUB + C.GLSL_NOISE + G.GLSL_GROUND
    gl.attachShader(p, G.compile(gl, gl.VERTEX_SHADER, head + 'out vec2 vUV; void main(){ vec2 q = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV = q; gl_Position = vec4(q*2.0-1.0, 0.0, 1.0); }', 'gc.vs'))
    gl.attachShader(p, G.compile(gl, gl.FRAGMENT_SHADER, head + GC_FS, 'gc.fs')); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link gc: ' + gl.getProgramInfoLog(p))
    gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'G'), 0); return { p, win: gl.getUniformLocation(p, 'uWin'), path: gl.getUniformLocation(p, 'uPath'), plaza: gl.getUniformLocation(p, 'uPlaza') } })()
  const vao = gl.createVertexArray(); let ox = 1e9, oz = 1e9, key = ''
  const api = {
    size: SIZE, tex0: t0, tex1: t1, ox: 0, oz: 0,
    update(camX, camZ, path, force) {
      const k = C.getMode() + ':' + (force || ''); const sx = Math.floor(camX / 16) * 16, sz = Math.floor(camZ / 16) * 16
      if (!force && k === key && Math.abs(camX - ox) < 32 && Math.abs(camZ - oz) < 32) return
      key = k; ox = sx; oz = sz; api.ox = sx - SIZE / 2; api.oz = sz - SIZE / 2
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, RES, RES); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE)
      gl.useProgram(P.p); gl.uniform4f(P.win, api.ox, api.oz, SIZE, 0); if (path) gl.uniform2fv(P.path, path); gl.uniform3f(P.plaza, E.plaza[0], E.plaza[1], E.plaza[2])
      gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.enable(gl.DEPTH_TEST)
    },
    bind(prog, unit0 = 5) {
      const gl2 = gl; gl2.activeTexture(gl2.TEXTURE0 + unit0); gl2.bindTexture(gl2.TEXTURE_2D, t0); gl2.activeTexture(gl2.TEXTURE0 + unit0 + 1); gl2.bindTexture(gl2.TEXTURE_2D, t1); gl2.activeTexture(gl2.TEXTURE0)
      prog.i1('uG0', unit0); prog.i1('uG1', unit0 + 1); prog.f4('uGWin', api.ox, api.oz, SIZE, 1 / SIZE)
    },
  }
  return api
}

const GRASS_VS = `
uniform vec4 uGrid; uniform vec4 uBand; uniform sampler2D uG0; uniform sampler2D uG1; uniform vec4 uGWin;
const int ROW[15] = int[15](0,0,1,0,1,1,1,1,2,1,2,2,2,2,3);
const int SDE[15] = int[15](0,1,0,1,1,0,0,1,0,1,1,0,0,1,0);
out vec3 vCol; out float vT; out vec3 vWP; out vec3 vNg; out vec3 vFace; out float vSh;
void main(){
  int Gn = int(uGrid.w); int id = gl_InstanceID; ivec2 cell = ivec2(int(uGrid.x) + id % Gn, int(uGrid.y) + id / Gn);
  int blade = gl_VertexID / 15, vi = gl_VertexID - blade*15; float cs = uGrid.z;
  ivec2 bc = cell + ivec2(blade*37, blade*91);
  vec2 j = vec2(hash2(cell), hash2(cell+ivec2(31,17)));
  vec2 p = (vec2(cell) + j) * cs + (vec2(hash2(bc+ivec2(3,9)), hash2(bc+ivec2(19,5)))-0.5)*cs*0.9;
  float dcam = length(p - uCam.xz);
  if (dcam > uBand.z || dcam < uBand.w) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  vec2 gu = (p - uGWin.xy)*uGWin.w; vec4 g0 = textureLod(uG0, gu, 0.0); vec3 galb = textureLod(uG1, gu, 0.0).rgb;
  float h = g0.x, ga = g0.w; vec3 gN = vec3(g0.y, sqrt(max(1.0 - g0.y*g0.y - g0.z*g0.z, 0.02)), g0.z);
  float clump = vnoise(p*0.8); float rnd = hash2(bc+ivec2(7,91));
  if (rnd > ga*(0.55+0.9*clump)) { gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
  float row = float(ROW[vi]); float t = row/3.0; float side = (SDE[vi]==1 ? 1.0 : -1.0); if (ROW[vi]==3) side = 0.0;
  float r2 = hash2(bc+ivec2(3,5)), r3 = hash2(bc+ivec2(13,77)), r4 = hash2(bc+ivec2(53,19));
  float fade = smoothstep(uBand.z, uBand.z*0.80, dcam) * smoothstep(uBand.w*0.85, uBand.w, dcam + 0.001);
  float hgt = mix(0.14, 0.52, r2*r2*0.5 + r2*0.5) * (0.65 + 0.7*vnoise(p*0.45+3.0)) * uBand.y * fade;
  float wid = 0.0115 * uBand.x * (1.0 - t*0.94) * mix(0.55, 1.0, fade);
  float yaw = r3*6.2831853; vec2 fw = vec2(cos(yaw), sin(yaw)); vec2 sd = vec2(-fw.y, fw.x);
  float curve = t*t, lean = (r4-0.35)*0.7;
  vec3 wp = vec3(p.x, h, p.y);
  wp.xz += fw*(lean*hgt*curve) + sd*side*wid; wp.y += t*hgt*(1.0-0.18*curve);
  vec2 wv = vec2(vnoise(p*0.11+vec2(TIME*0.85,TIME*0.35)*WIND)-0.5, vnoise(p*0.11+17.0+vec2(TIME*0.5,-TIME*0.3)*WIND)-0.5)*1.5*WIND;
  wv += 0.16*vec2(sin(TIME*3.1+p.x*1.7), cos(TIME*2.7+p.y*1.9))*WIND*vnoise(p*0.8);
  wp.xz += wv*hgt*curve*1.3; wp.y -= length(wv)*hgt*curve*0.22;
  vec2 dp = p - uPlayer.xz; float pr = length(dp); float push = smoothstep(uPlayer.w, 0.0, pr) * (1.0-smoothstep(1.5,3.0,abs(h-uPlayer.y)));
  wp.xz += (dp/(pr+0.001))*push*hgt*1.1*curve; wp.y -= push*hgt*0.55*curve;
  float dryk = smoothstep(0.55,0.9,fbm(p*0.011+9.0,2));
  vec3 baseC = galb*0.7; vec3 tipC = mix(vec3(0.040,0.085,0.016), vec3(0.105,0.150,0.030), r2); tipC = mix(tipC, vec3(0.19,0.16,0.055), dryk*0.6);
  float ao = mix(0.28, 1.0, smoothstep(0.0,0.75,t));
  vCol = mix(baseC, tipC, smoothstep(0.0,0.85,t)) * ao * (0.85+0.3*hash2(bc+ivec2(5,5)));
  vT = t; vWP = wp; vNg = gN; vFace = vec3(fw.x,0.0,fw.y);
  vSh = shadow1(vec3(p.x,h,p.y));
  gl_Position = uVP * vec4(wp, 1.0);
}`
const GRASS_FS = `
in vec3 vCol; in float vT; in vec3 vWP; in vec3 vNg; in vec3 vFace; in float vSh; out vec4 o;
void main(){
  if (uExtra.w > 0.5) { o = vec4(0.0); return; }
  vec3 V = normalize(uCam.xyz - vWP); float ff = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNg*1.4 + vFace*0.55*ff + vec3(0.0, 0.5, 0.0));
  vec3 L = uSunDir.xyz;
  float ndl = clamp(dot(N, L)*0.65 + 0.35, 0.0, 1.0);
  float trans = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0) * smoothstep(0.1,0.9,vT) * 0.55;
  vec3 sun = uSunCol.rgb * (ndl + trans*1.4) * vSh;
  vec3 lit = vCol * (sun + ambient(N)*mix(0.55,1.0,vT) + pointLights(vWP, N)) + vCol*vec3(0.9,1.0,0.3)*trans*uSunCol.rgb*0.25*vSh;
  o = vec4(applyFog(lit, vWP), 1.0);
}`
function createGrass(E, ground) {
  const gl = E.gl, P = E.prog('grass', GRASS_VS, GRASS_FS, { ground: true, lightVS: true })
  const bands = E.q >= 2
    ? [{ G: 112, cs: 0.16, wx: 1.0, hy: 1.0, far: 8.6, near: 0 }, { G: 128, cs: 0.36, wx: 2.0, hy: 1.1, far: 23, near: 7.8 }, { G: 120, cs: 1.0, wx: 5.5, hy: 1.35, far: 58, near: 21 }]
    : [{ G: 80, cs: 0.2, wx: 1.1, hy: 1.0, far: 8.0, near: 0 }, { G: 84, cs: 0.6, wx: 3, hy: 1.1, far: 24, near: 7 }]
  return {
    draw(camX, camZ) {
      P.use(); P.i1('uShadow', 7); ground.bind(P, 5)
      for (const b of bands) {
        P.f4('uGrid', Math.floor(camX / b.cs) - b.G / 2, Math.floor(camZ / b.cs) - b.G / 2, b.cs, b.G); P.f4('uBand', b.wx, b.hy, b.far, b.near)
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 45, b.G * b.G)
      }
    },
  }
}
window.__RealmGrass = { createGrass, createGround }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, G = window.__RealmGL, { sstep, clamp, mix } = C
let sd = 12345; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) | 0; return (sd >>> 0) / 4294967296 }
const rr = (a, b) => a + (b - a) * rnd()

// ---------------------------------------------------------------- procedural tree geometry
// vertex: pos3 nrm3 uv2 data4 (kind, rnd, ao, hN)
function Builder() { const v = [], ix = []; return { v, ix, push(p, n, u, vv, d) { v.push(p[0], p[1], p[2], n[0], n[1], n[2], u, vv, d[0], d[1], d[2], d[3]); return v.length / 12 - 1 } } }
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
function tube(B, pts, radii, sides, H, rndv) {
  const rings = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)], t = norm(sub(nx, pv))
    let a = Math.abs(t[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0]; const u = norm(cross(a, t)), w = cross(t, u), ring = []
    for (let s = 0; s <= sides; s++) { const ang = (s / sides) * Math.PI * 2, c = Math.cos(ang), sn = Math.sin(ang), n = [u[0] * c + w[0] * sn, u[1] * c + w[1] * sn, u[2] * c + w[2] * sn]
      ring.push(B.push([p[0] + n[0] * radii[i], p[1] + n[1] * radii[i], p[2] + n[2] * radii[i]], n, s / sides, i / (pts.length - 1) * (rndv + 1), [0, rndv, 0.5, clamp(p[1] / H, 0, 1)])) }
    rings.push(ring)
  }
  for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) { const a = rings[i][s], b = rings[i][s + 1], c = rings[i + 1][s], d = rings[i + 1][s + 1]; B.ix.push(a, b, c, b, d, c) }
}
function card(B, center, right, up, w, h, kind, crownC, crownR, rndv, aoBase) {
  const n = norm(cross(right, up)), cd = norm(sub(center, crownC)), dist = Math.hypot(...sub(center, crownC)) / crownR
  const H = 8, ao = clamp(aoBase + (1 - aoBase) * dist, 0.25, 1), cs = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]], ids = []
  for (const [sx, sy, u, v] of cs) ids.push(B.push([center[0] + right[0] * sx * w / 2 + up[0] * sy * h / 2, center[1] + right[1] * sx * w / 2 + up[1] * sy * h / 2, center[2] + right[2] * sx * w / 2 + up[2] * sy * h / 2], cd, u, v, [kind, rndv, ao, clamp(center[1] / H, 0, 1)]))
  // store card normal in a second set of vertices? we pack crown direction as normal and recover facing in the shader from derivatives
  B.ix.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3])
}
function buildOak(lod) {
  const T = Builder(), L = Builder(); sd = lod ? 777 : 4242
  const H = 8, trunk = [[0, 0, 0], [0.05, 1.2, 0.03], [-0.04, 2.6, 0.06], [0.03, 3.9, -0.02], [0, 4.7, 0]], rad = [0.34, 0.27, 0.21, 0.15, 0.08]
  tube(T, trunk, rad, lod ? 6 : 10, H, 0.3)
  const tips = []
  const nb = lod ? 0 : 5
  for (let i = 0; i < nb; i++) { const a = (i / nb) * Math.PI * 2 + rr(-0.3, 0.3), y0 = rr(2.8, 4.2), len = rr(1.8, 2.8), up = rr(0.5, 1.1)
    const p0 = [0, y0, 0], p1 = [Math.cos(a) * len * 0.45, y0 + up * 0.55, Math.sin(a) * len * 0.45], p2 = [Math.cos(a) * len, y0 + up, Math.sin(a) * len]
    tube(T, [p0, p1, p2], [0.12, 0.075, 0.03], 5, H, 0.6); tips.push(p2, p1) }
  const crownC = [0, 5.6, 0], crownR = 3.2, count = lod ? 40 : 250
  for (let i = 0; i < count; i++) {
    let p; const ti = tips.length && rnd() < 0.55 ? tips[(rnd() * tips.length) | 0] : null
    if (ti) p = [ti[0] + rr(-1.1, 1.1), ti[1] + rr(-0.2, 1.4), ti[2] + rr(-1.1, 1.1)]
    else { const th = rnd() * Math.PI * 2, ph = Math.acos(rr(-0.55, 1)), r = crownR * Math.cbrt(rr(0.25, 1)); p = [crownC[0] + r * Math.sin(ph) * Math.cos(th) * 1.05, crownC[1] + r * Math.cos(ph) * 0.78, crownC[2] + r * Math.sin(ph) * Math.sin(th) * 1.05] }
    const s = lod ? rr(2.0, 3.0) : rr(0.95, 1.5), th = rnd() * Math.PI * 2, tilt = rr(0.1, 1.2)
    const n = norm([Math.cos(th) * Math.sin(tilt) + (p[0] - crownC[0]) * 0.15, Math.cos(tilt) + 0.2, Math.sin(th) * Math.sin(tilt) + (p[2] - crownC[2]) * 0.15]), a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const right = norm(cross(a, n)), up = cross(n, right), ang = rnd() * 6.28, c = Math.cos(ang), sn = Math.sin(ang)
    card(L, p, [right[0] * c + up[0] * sn, right[1] * c + up[1] * sn, right[2] * c + up[2] * sn], [up[0] * c - right[0] * sn, up[1] * c - right[1] * sn, up[2] * c - right[2] * sn], s, s, 1, crownC, crownR, rnd(), 0.35)
  }
  return { T, L, H }
}
function buildPine(lod) {
  const T = Builder(), L = Builder(); sd = lod ? 991 : 5151
  const H = 9, trunk = [[0, 0, 0], [0.02, 1.8, 0], [-0.03, 3.8, 0.02], [0.02, 6.0, 0], [0, 8.6, 0]], rad = [0.30, 0.22, 0.15, 0.08, 0.02]
  tube(T, trunk, rad, lod ? 6 : 9, H, 0.2)
  const whorls = lod ? 5 : 9, crownC = [0, 4.8, 0], crownR = 4.6
  for (let w = 0; w < whorls; w++) {
    const f = w / (whorls - 1), y = 1.7 + f * 6.2, L0 = mix(2.5, 0.55, f * f * 0.5 + f * 0.5), per = lod ? 6 : Math.round(mix(9, 5, f))
    for (let k = 0; k < per; k++) {
      const a = (k / per) * Math.PI * 2 + w * 0.7 + rr(-0.15, 0.15), len = L0 * rr(0.85, 1.15), droop = rr(0.45, 0.8) // radians downward
      const dir = [Math.cos(a) * Math.cos(droop), -Math.sin(droop) * 0.55 + 0.1, Math.sin(a) * Math.cos(droop)], mid = [dir[0] * len * 0.5, y + dir[1] * len * 0.5, dir[2] * len * 0.5]
      const right = norm(cross([0, 1, 0], dir)), upv = norm(cross(dir, right))
      // a card laid along the branch: "right" is the branch axis, "up" is across it (slightly tilted so it catches light)
      card(L, mid, [dir[0], dir[1], dir[2]], [right[0] * 0.9 + upv[0] * 0.2, right[1] * 0.9 + upv[1] * 0.2, right[2] * 0.9 + upv[2] * 0.2], len * 1.1, len * 0.62, 2, crownC, crownR, rnd(), 0.4)
    }
  }
  return { T, L, H }
}

const TREE_VS = `
in vec3 aPos; in vec3 aNrm; in vec2 aUV; in vec4 aData; in vec4 iPos; in vec4 iAux;
uniform float uKind; // 0 = bark, 1 = broadleaf leaves, 2 = pine needles
out vec3 vWP; out vec3 vN; out vec2 vUV; out vec4 vData; out vec4 vAux; out vec3 vCrown;
void main(){
  float sc = iPos.w, yaw = iAux.x, cy = cos(yaw), sy = sin(yaw);
  vec3 lp = aPos*sc; vec3 rp = vec3(cy*lp.x + sy*lp.z, lp.y, -sy*lp.x + cy*lp.z);
  vec3 wp = iPos.xyz + rp; float hN = aData.w;
  vec2 gust = vec2(vnoise(wp.xz*0.04+vec2(TIME*0.30,0.0))-0.5, vnoise(wp.xz*0.04+vec2(0.0,TIME*0.26)+9.0)-0.5)*2.0*WIND;
  float ph = iAux.z*6.283;
  wp.xz += (gust*0.30 + vec2(sin(TIME*1.1+ph), cos(TIME*0.9+ph))*0.04*WIND) * hN*hN*sc*(uKind==2.0?0.6:1.0);
  if (uKind > 0.5) wp += vec3(sin(TIME*3.1+aData.y*23.0+ph), cos(TIME*2.5+aData.y*17.0), sin(TIME*3.4+aData.y*11.0))*0.045*WIND*(0.3+hN)*sc;
  vec3 n = vec3(cy*aNrm.x + sy*aNrm.z, aNrm.y, -sy*aNrm.x + cy*aNrm.z);
  vWP = wp; vN = n; vUV = aUV; vData = aData; vAux = iAux; vCrown = n;
  gl_Position = uVP * vec4(wp, 1.0);
}`
const TREE_FS = `
in vec3 vWP; in vec3 vN; in vec2 vUV; in vec4 vData; in vec4 vAux; in vec3 vCrown; out vec4 o; uniform float uKind;
float leafShape(vec2 uv, float seed){
  float m = 0.0;
  for(int i=0;i<9;i++){ float fi = float(i)+seed*13.0;
    vec2 c = vec2(hash1(fi*1.31), hash1(fi*2.17))*0.74+0.13; float a = hash1(fi*3.7)*6.2832;
    vec2 q = uv-c; vec2 r = vec2(cos(a)*q.x+sin(a)*q.y, -sin(a)*q.x+cos(a)*q.y); r.x /= 0.27; r.y /= 0.115 * (1.0 - 0.4*abs(r.x));
    m = max(m, 1.0 - smoothstep(0.78,1.0,length(r))); }
  return m;
}
float needleShape(vec2 uv, float seed){
  // uv.x along the branch (0 base -> 1 tip), uv.y across
  float across = uv.y*2.0-1.0; float tip = 1.0 - uv.x; float halfw = mix(0.02, 0.5, sqrt(clamp(tip,0.0,1.0))) * (1.0-0.25*uv.x);
  float spine = 1.0 - smoothstep(0.0, 0.05, abs(across)*0.5);
  float needles = smoothstep(0.36,0.62, abs(sin((uv.x*34.0) + sign(across)*abs(across)*5.0 + seed*6.0)));
  float env = 1.0 - smoothstep(halfw*0.7, halfw, abs(across)*0.5);
  return max(spine*(1.0-uv.x*0.4), needles*env*(0.85));
}
void main(){
  if (uKind > 0.5) {
    float m = uKind < 1.5 ? leafShape(vUV, vData.y) : needleShape(vUV, vData.y);
    if (uExtra.w > 0.5) { if (m < 0.45) discard; o = vec4(0.0); return; }
    if (m < 0.04) discard;
    vec3 V = normalize(uCam.xyz - vWP); vec3 L = uSunDir.xyz;
    vec3 N = normalize(vCrown); float facing = dot(N, V) < -0.2 ? -1.0 : 1.0;
    vec3 N2 = normalize(N + vec3(0.0,0.35,0.0));
    float ndl = clamp(dot(N2, L)*0.6+0.4, 0.0, 1.0); float trans = pow(clamp(dot(-V,L),0.0,1.0), 2.0) * 0.8;
    vec3 base = uKind < 1.5 ? mix(vec3(0.014,0.034,0.007), vec3(0.040,0.066,0.012), vAux.w) : mix(vec3(0.016,0.040,0.020), vec3(0.036,0.070,0.030), vAux.w);
    base *= 0.8 + 0.5*hash1(vData.y*91.0); base = mix(base, vec3(0.13,0.12,0.03), (uKind<1.5?0.12:0.0)*hash1(vAux.z*7.0+1.0));
    float vein = uKind < 1.5 ? 0.82 + 0.18*smoothstep(0.0,0.5,m) : 0.85 + 0.3*m;
    float ao = vData.z; float sh = shadow1(vWP);
    vec3 lit = base*vein*(uSunCol.rgb*(ndl*sh + trans*sh*0.9*vec3(1.0,1.0,0.5)) + ambient(N2)*ao*1.1 + pointLights(vWP,N2));
    o = vec4(applyFog(lit, vWP), smoothstep(0.04,0.5,m));
  } else {
    if (uExtra.w > 0.5) { o = vec4(0.0); return; }
    vec3 N = normalize(vN); float u = vUV.x, v = vUV.y;
    float bn = vnoise(vec2(u*22.0, v*3.0)) * 0.6 + vnoise(vec2(u*60.0, v*9.0)) * 0.4; float ridge = smoothstep(0.35,0.75,bn);
    vec3 bark = mix(vec3(0.030,0.021,0.014), vec3(0.075,0.058,0.042), ridge) * (0.8+0.4*vData.y);
    bark = mix(bark, vec3(0.03,0.06,0.02), smoothstep(0.4,0.0,vData.w)*0.35*vnoise(vec2(u*6.0,v*2.0)));
    N = normalize(N + vec3(0.0,0.0,0.0)*bn);
    float ndl = max(dot(N, uSunDir.xyz), 0.0), sh = shadow1(vWP);
    vec3 lit = bark*(uSunCol.rgb*ndl*sh + ambient(N)*mix(0.5,1.0,vData.w) + pointLights(vWP,N));
    o = vec4(applyFog(lit, vWP), 1.0);
  }
}`

function createTrees(E) {
  const gl = E.gl, P = E.prog('trees', TREE_VS, TREE_FS, { attribs: ['aPos', 'aNrm', 'aUV', 'aData', 'iPos', 'iAux'], lightVS: false })
  function upload(Bd) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao)
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Bd.v), gl.STATIC_DRAW)
    const st = 48; [[0, 3, 0], [1, 3, 12], [2, 2, 24], [3, 4, 32]].forEach(([i, n, o]) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, st, o) })
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(Bd.ix), gl.STATIC_DRAW)
    const inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inst)
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(4, 1); gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(5, 1)
    gl.bindVertexArray(null); return { vao, n: Bd.ix.length, inst }
  }
  const mk = (b) => ({ trunk: upload(b.T), leaf: upload(b.L) })
  const M = { oak: [mk(buildOak(0)), mk(buildOak(1))], pine: [mk(buildPine(0)), mk(buildPine(1))] }
  const lists = { oak: [[], []], pine: [[], []] }, counts = { oak: [0, 0], pine: [0, 0] }
  let gx = 1e9, gz = 1e9, gm = -1, solids = []
  const HI = 85, LO = 340, CELL = 6
  function generate(cx, cz, density) { // density(x,z,h,slope) -> probability 0..1, plus pine/oak choice
    gx = cx; gz = cz; gm = C.getMode(); solids = []
    const arr = { oak: [[], []], pine: [[], []] }
    const n = Math.ceil(LO / CELL)
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const ci = Math.floor(cx / CELL) + i, cj = Math.floor(cz / CELL) + j
      const x = (ci + C.ihash(ci, cj)) * CELL, z = (cj + C.ihash(ci + 91, cj + 17)) * CELL, d = Math.hypot(x - cx, z - cz); if (d > LO) continue
      const h = C.terrainH(x, z), dn = density(x, z, h); if (dn <= 0 || C.ihash(ci + 5, cj + 77) > dn) continue
      const nn = C.terrainN(x, z, 1.0); if (nn[1] < 0.84) continue
      const species = density.species ? density.species(x, z, h) : (h > 60 ? 1 : 0), key = species ? 'pine' : 'oak', sc = mix(0.85, 1.55, C.ihash(ci + 3, cj + 8)) * (species ? 1.25 : 1)
      const yaw = C.ihash(ci + 11, cj + 12) * 6.283, phase = C.ihash(ci + 21, cj + 31), tint = C.ihash(ci + 41, cj + 51)
      const rec = [x, h - 0.12, z, sc, yaw, species, phase, tint]
      const lod = d < HI ? 0 : 1; arr[key][lod].push(...rec)
      if (d < 70) solids.push({ x, z, r: (species ? 0.32 : 0.4) * sc })
    }
    for (const k of ['oak', 'pine']) for (let l = 0; l < 2; l++) { const src = arr[k][l], n8 = src.length / 8, f = new Float32Array(n8 * 8); for (let i = 0; i < n8; i++) { const r = src.slice(i * 8, i * 8 + 8); f.set([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]], i * 8) } counts[k][l] = n8; const mesh = M[k][l]; for (const part of [mesh.trunk, mesh.leaf]) { gl.bindBuffer(gl.ARRAY_BUFFER, part.inst); gl.bufferData(gl.ARRAY_BUFFER, f, gl.DYNAMIC_DRAW) } }
  }
  const api = {
    solids: () => solids, counts: () => counts,
    update(cx, cz, density, force) { if (force || gm !== C.getMode() || Math.hypot(cx - gx, cz - gz) > 45) generate(cx, cz, density) },
    draw(shadowPass) {
      P.use(); P.i1('uShadow', 7)
      for (const k of ['oak', 'pine']) for (let l = 0; l < 2; l++) {
        if (shadowPass && l === 1) continue; const n = counts[k][l]; if (!n) continue; const m = M[k][l]
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); P.f1('uKind', 0); gl.bindVertexArray(m.trunk.vao); gl.enable(gl.CULL_FACE); gl.drawElementsInstanced(gl.TRIANGLES, m.trunk.n, gl.UNSIGNED_INT, 0, n)
        gl.disable(gl.CULL_FACE); if (!shadowPass && E.msaa) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); P.f1('uKind', k === 'oak' ? 1 : 2); gl.bindVertexArray(m.leaf.vao); gl.drawElementsInstanced(gl.TRIANGLES, m.leaf.n, gl.UNSIGNED_INT, 0, n)
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
      }
      gl.bindVertexArray(null)
    },
  }
  return api
}
window.__RealmTrees = { createTrees }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, G = window.__RealmGL, { M } = C

// ---------------------------------------------------------------- mesh builders (pos3 nrm3 uv2 = 8 floats)
function mesh(gl, v, ix) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao)
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW)
  ;[[0, 3, 0], [1, 3, 12], [2, 2, 24]].forEach(([i, n, o]) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 32, o) })
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(ix), gl.STATIC_DRAW); gl.bindVertexArray(null)
  return { vao, n: ix.length }
}
function roundedBox(gl, sx, sy, sz, r, seg = 10) { // each face is a grid pushed onto a rounded box
  const v = [], ix = [], faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]]
  const hx = sx / 2, hy = sy / 2, hz = sz / 2
  faces.forEach(([n, u, w], fi) => {
    const base = v.length / 8
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * 2 - 1, b = (j / seg) * 2 - 1
      let p = [n[0] + u[0] * a + w[0] * b, n[1] + u[1] * a + w[1] * b, n[2] + u[2] * a + w[2] * b]
      const q = [Math.max(-(hx - r), Math.min(hx - r, p[0] * hx)), Math.max(-(hy - r), Math.min(hy - r, p[1] * hy)), Math.max(-(hy * 0 + hz - r), Math.min(hz - r, p[2] * hz))]
      let d = [p[0] * hx - q[0], p[1] * hy - q[1], p[2] * hz - q[2]]; const l = Math.hypot(...d) || 1; d = [d[0] / l, d[1] / l, d[2] / l]
      v.push(q[0] + d[0] * r, q[1] + d[1] * r, q[2] + d[2] * r, d[0], d[1], d[2], (i / seg), (j / seg))
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; if (fi % 2 === 0) ix.push(a, b, c, b, d, c); else ix.push(a, c, b, b, c, d) }
  })
  // winding fix: make sure outward faces are CCW by checking one triangle per face
  return mesh(gl, v, ix)
}
function uvSphere(gl, r, lat = 14, lon = 20) {
  const v = [], ix = []
  for (let j = 0; j <= lat; j++) for (let i = 0; i <= lon; i++) { const th = (j / lat) * Math.PI, ph = (i / lon) * Math.PI * 2, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph); v.push(x * r, y * r, z * r, x, y, z, i / lon, j / lat) }
  for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) { const a = j * (lon + 1) + i, b = a + 1, c = a + lon + 1, d = c + 1; ix.push(a, b, c, b, d, c) }
  return mesh(gl, v, ix)
}
function cylinder(gl, r0, r1, h, seg = 20) {
  const v = [], ix = []
  for (let j = 0; j <= 1; j++) for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r = j ? r1 : r0, slope = (r0 - r1) / h; const nl = Math.hypot(1, slope); v.push(c * r, j * h, s * r, c / nl, slope / nl, s / nl, i / seg, j) }
  for (let i = 0; i < seg; i++) { const a = i, b = i + 1, c = i + seg + 1, d = c + 1; ix.push(a, c, b, b, c, d) }
  const cb = v.length / 8; v.push(0, h, 0, 0, 1, 0, 0.5, 0.5); for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; v.push(Math.cos(a) * r1, h, Math.sin(a) * r1, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5) } for (let i = 0; i < seg; i++) ix.push(cb, cb + 2 + i, cb + 1 + i)
  return mesh(gl, v, ix)
}
function disc(gl, seg = 48, rings = 6) { // unit disc in the XY plane, uv = position*0.5+0.5
  const v = [0, 0, 0, 0, 0, 1, 0.5, 0.5], ix = []
  for (let r = 1; r <= rings; r++) for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, x = Math.cos(a) * r / rings, y = Math.sin(a) * r / rings; v.push(x, y, 0, 0, 0, 1, x * 0.5 + 0.5, y * 0.5 + 0.5) }
  for (let i = 0; i < seg; i++) ix.push(0, 1 + i, 2 + i)
  for (let r = 1; r < rings; r++) for (let i = 0; i < seg; i++) { const a = 1 + (r - 1) * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; ix.push(a, c, b, b, c, d) }
  return mesh(gl, v, ix)
}
function ringFlat(gl, r0, r1, seg = 64) { // flat annulus in XZ (shockwaves, rune circles)
  const v = [], ix = []
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); v.push(c * r0, 0, s * r0, 0, 1, 0, 0, i / seg, c * r1, 0, s * r1, 0, 1, 0, 1, i / seg) }
  for (let i = 0; i < seg; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; ix.push(a, c, b, b, c, d) }
  return mesh(gl, v, ix)
}

// ---------------------------------------------------------------- object shader (blooks, stone, titan, props)
const OBJ_VS = `
in vec3 aPos; in vec3 aNrm; in vec2 aUV; uniform mat4 uModel; uniform vec3 uShear;
out vec3 vWP; out vec3 vN; out vec2 vUV; out vec3 vLP;
void main(){ vec4 w = uModel * vec4(aPos,1.0); w.xz += uShear.xy * clamp(aPos.y + 0.5, 0.0, 1.0) * uShear.z; vWP = w.xyz; vN = normalize(mat3(uModel)*aNrm); vUV = aUV; vLP = aPos; gl_Position = uVP * w; }`
const OBJ_FS = `
in vec3 vWP; in vec3 vN; in vec2 vUV; in vec3 vLP; out vec4 o;
uniform int uMat; uniform vec3 uTint; uniform vec4 uEm; uniform vec4 uP; uniform sampler2D uTex; uniform mat4 uModel;
float rune(vec2 uv){ vec2 c = floor(uv); vec2 f = fract(uv); float h = hash2(ivec2(c)); float m = 0.0;
  float bar = 0.13; vec2 q = abs(f-0.5);
  if (h > 0.15) m = max(m, step(q.x, bar*0.5)*step(q.y,0.36));
  if (h > 0.4)  m = max(m, step(q.y, bar*0.5)*step(q.x,0.30));
  if (h > 0.62) m = max(m, step(abs(f.x-f.y), bar*0.7)*step(q.x,0.33));
  if (h > 0.78) m = max(m, step(abs(f.x+f.y-1.0), bar*0.7)*step(q.x,0.33));
  if (h > 0.9)  m = max(m, 1.0-smoothstep(0.07,0.13,length(f-0.5)));
  return m; }
void main(){
  if (uMat == 6) {
    vec4 t = texture(uTex, vUV); if (t.a < 0.4) discard;
    if (uExtra.w > 0.5) { o = vec4(0.0); return; }
    vec3 N = normalize(vN), V = normalize(uCam.xyz - vWP), L = uSunDir.xyz; bool back = vLP.z < 0.0;
    float e = 1.0/256.0; vec3 T = normalize(uModel[0].xyz), B = normalize(uModel[1].xyz);
    float lx = dot(texture(uTex, vUV+vec2(e,0.0)).rgb - texture(uTex, vUV-vec2(e,0.0)).rgb, vec3(0.3,0.59,0.11)), ly = dot(texture(uTex, vUV+vec2(0.0,e)).rgb - texture(uTex, vUV-vec2(0.0,e)).rgb, vec3(0.3,0.59,0.11));
    float sg = back ? -1.0 : 1.0; N = normalize(N - (T*lx*sg - B*ly)*1.1);
    vec3 alb = pow(t.rgb, vec3(2.2)) * 0.34; if (back) alb = mix(alb, vec3(dot(alb, vec3(0.33))), 0.35) * 0.62;
    alb = mix(alb, vec3(0.7,0.04,0.02), uP.z);
    float sh = shadowAt(vWP, N), ndl = max(dot(N, L), 0.0), wrap = clamp((dot(N, L) + 0.4)/1.4, 0.0, 1.0);
    vec3 H = normalize(L + V); float spec = pow(max(dot(N, H), 0.0), 56.0) * (0.04 + 0.5*pow(1.0 - max(dot(N, V), 0.0), 3.0)); float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    float ao = mix(0.55, 1.0, smoothstep(-0.5, 0.05, vLP.y));
    vec3 sss = alb * uSunCol.rgb * pow(max(dot(-V, L), 0.0), 2.0) * 0.5 * sh;
    vec3 lit = alb * (uSunCol.rgb * mix(ndl, wrap, 0.35) * sh + ambient(N) * ao * 1.1 + pointLights(vWP, N)) + sss + spec * uSunCol.rgb * sh * 1.2 + rim * ambient(N) * 0.55 * (alb + 0.05) + vec3(1.0,0.2,0.1) * uP.z * 0.8;
    o = vec4(applyFog(lit, vWP), 1.0); return;
  }
  if (uExtra.w > 0.5) { o = vec4(0.0); return; }
  vec3 N = normalize(vN); vec3 V = normalize(uCam.xyz - vWP); vec3 alb = uTint; vec3 em = vec3(0.0); float rough = 0.0;
  if (uMat == 0) { // blook cube: art on the four sides
    vec3 a = abs(N);
    if (a.y < 0.8) { vec4 t = texture(uTex, vec2(vUV.x, 1.0 - vUV.y)); alb = mix(pow(uTint,vec3(2.2)), pow(t.rgb,vec3(2.2)), t.a)*0.28; } else alb = pow(uTint,vec3(2.2))*0.25;
  } else if (uMat == 1 || uMat == 2) { // stone (1) and cracked titan rock (2)
    vec3 q = vWP*1.7 + vLP*0.3; float n1 = vnoise(q.xz*3.0 + q.y*2.0), n2 = vnoise(q.xz*11.0 + q.yz*9.0);
    float crack = 1.0 - smoothstep(0.0, 0.05, abs(vnoise(q.xy*2.2 + q.z*2.6) - 0.5)); 
    alb = uTint * (0.55 + 0.7*n1) * (0.8 + 0.4*n2);
    N = normalize(N + (vec3(n1, n2, vnoise(q.zx*5.0)) - 0.5)*0.5);
    float moss = smoothstep(0.35,0.75, N.y) * smoothstep(0.35,0.7, vnoise(vWP.xz*1.3 + vWP.y*0.8)) * uP.x;
    moss += smoothstep(1.2, 0.0, vWP.y - (terrainH(vWP.xz))) * 0.5 * uP.x * smoothstep(0.3,0.7,n1);
    alb = mix(alb, vec3(0.035,0.070,0.016)*(0.7+0.6*n2), clamp(moss,0.0,0.9));
    alb *= 1.0 - crack*0.22;
    if (uMat == 2) { float lava = smoothstep(0.06, 0.0, abs(vnoise(q.xy*1.1+q.z*1.3+TIME*0.04) - 0.5)) * uP.y; em = vec3(1.0,0.34,0.06) * lava * 3.2 * (0.7+0.3*sin(TIME*2.0)); }
    if (uMat == 1 && uEm.w > 0.0) { float pulse = 0.65 + 0.35*sin(TIME*1.6 + vWP.y*1.5); vec2 g = (abs(N.x) > abs(N.z) ? vWP.zy : vWP.xy) * vec2(2.4, 2.4); float rn = rune(g) * smoothstep(0.55, 0.9, 1.0 - abs(N.y)); em = uEm.rgb * rn * uEm.w * pulse; alb *= 1.0 - rn*0.6; }
    rough = 1.0;
  } else if (uMat == 4) { alb = uTint * (0.85 + 0.3*vnoise(vWP.xz*8.0 + vWP.y*6.0)); }
  else if (uMat == 3) { o = vec4(uTint*uEm.w, 1.0); return; }
  else if (uMat == 5) { float aa = pow(max(dot(N,V),0.0),1.3)*(1.0-clamp(vLP.y,0.0,1.0))*uP.x; o = vec4(uTint*uEm.w, aa); return; }
  float sh = shadowAt(vWP, N); float ndl = max(dot(N, uSunDir.xyz), 0.0);
  float rim = pow(1.0 - max(dot(N,V),0.0), 3.0);
  vec3 lit = alb * (uSunCol.rgb*ndl*sh + ambient(N)*(0.75+0.25*N.y) + pointLights(vWP, N)) + em;
  lit += rim * ambient(N) * 0.25 * alb;
  if (uMat == 0) lit += pow(max(dot(reflect(-uSunDir.xyz, N), V), 0.0), 40.0) * uSunCol.rgb * sh * 0.05;
  o = vec4(applyFog(lit, vWP), 1.0);
}`

const PORTAL_FS = `
in vec3 vWP; in vec3 vN; in vec2 vUV; in vec3 vLP; out vec4 o; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uOpen;
void main(){
  if (uExtra.w > 0.5) discard;
  vec2 q = vUV*2.0-1.0; float r = length(q), a = atan(q.y, q.x);
  float sw = a + TIME*0.7 + 2.2/(r+0.22), sw2 = a*2.0 - TIME*1.1 + 1.0/(r+0.3);
  vec2 w = vec2(cos(sw), sin(sw))*r, w2 = vec2(cos(sw2), sin(sw2))*r;
  float n1 = fbm(w*3.2 + TIME*0.15, 4), n2 = fbm(w2*5.5 - TIME*0.3 + n1*2.0, 3);
  float tunnel = 0.5 + 0.5*sin(r*16.0 - TIME*3.2 + n1*5.0);
  float core = exp(-r*3.6), rim = smoothstep(0.70,0.97,r);
  vec3 col = mix(uC0, uC1, smoothstep(0.2,0.8,n2)) * (0.25 + 1.5*n1*n1*2.0) * (0.35 + 0.9*tunnel);
  col += uC2 * core * 1.1 + uC1 * rim * 1.7 * (0.6+0.8*n2);
  float alpha = (1.0 - smoothstep(0.90, 1.0, r)) * uOpen;
  o = vec4(applyFog(col*1.2, vWP)*0.0 + col*1.2, alpha);
}`
const PART_VS = `
uniform int uType; uniform vec3 uOrg; uniform vec3 uCol; uniform float uPx; uniform vec4 uA; uniform float uAge;
out vec4 vC;
float h(float n){ return fract(sin(n*91.3458)*47453.5453); }
void main(){
  float id = float(gl_VertexID); float r1 = h(id+1.0), r2 = h(id+2.0), r3 = h(id+3.0), r4 = h(id+4.0);
  vec3 p; float size = 0.05, alpha = 1.0; vec3 col = uCol;
  if (uType == 0) { // portal sparks spiral into the arch
    float ph = fract(r1 + TIME*(0.12+0.25*r2)); float ang = r3*6.2831853 + ph*5.0; float rad = uA.x*(1.0 - ph*0.85);
    vec3 lp = vec3(cos(ang)*rad*uA.y, uA.z + sin(ang)*rad*0.9, (r4-0.5)*0.5*(1.0-ph)); float cyw = cos(uA.w), syw = sin(uA.w); p = uOrg + vec3(cyw*lp.x + syw*lp.z, lp.y, -syw*lp.x + cyw*lp.z); 
    size = 0.06+0.07*r2; alpha = sin(ph*3.1416); col = mix(uCol, vec3(1.0), ph*ph);
  } else if (uType == 1) { // pollen / dust motes near the camera
    vec3 c = floor(uCam.xyz/22.0)*22.0 + 11.0; p = c + (vec3(r1,r2,r3)-0.5)*44.0; p.y = uCam.w + 0.3 + r4*7.0; p.x += sin(TIME*0.3+r2*20.0)*1.2 + TIME*0.35*WIND; p.z += cos(TIME*0.27+r1*20.0)*1.2; p.x = c.x + mod(p.x - c.x + 22.0, 44.0) - 22.0;
    size = 0.035 + 0.03*r4; alpha = (0.35+0.65*sin(TIME*1.7+r1*40.0)*0.5+0.325) * (1.0-smoothstep(14.0,24.0,length(p-uCam.xyz))) * uSunDir.w; col = vec3(1.0,0.95,0.75)*1.4;
  } else if (uType == 2) { // fire / embers
    float ph = fract(r1 + TIME*(0.5+0.7*r2)); p = uOrg + vec3((r3-0.5)*0.55*(1.0-ph) + sin(TIME*2.0+r1*30.0)*0.12*ph, ph*uA.x, (r4-0.5)*0.55*(1.0-ph)); size = (0.30*(1.0-ph) + 0.05) * uA.y; alpha = (1.0-ph)*(1.0-ph)*0.75; col = mix(vec3(1.0,0.75,0.25), vec3(1.0,0.22,0.04), ph)*2.2;
  } else if (uType == 3) { // fireflies (night only)
    vec3 c = floor(uCam.xyz/18.0)*18.0 + 9.0; p = c + (vec3(r1,r2,r3)-0.5)*36.0; float gh = terrainH(p.xz); p.y = gh + 0.5 + r4*2.2 + sin(TIME*0.8+r1*30.0)*0.3; p.x += sin(TIME*0.6+r2*17.0)*1.4; p.z += cos(TIME*0.5+r3*13.0)*1.4;
    float tw = pow(0.5+0.5*sin(TIME*2.4+r1*50.0), 3.0); size = 0.07; alpha = tw * uExtra.x * (1.0-smoothstep(10.0,20.0,length(p-uCam.xyz))); col = vec3(0.7,1.0,0.35)*3.0;
  } else { // burst: radial sparks from uOrg, age in uAge
    vec3 d = normalize(vec3(r1-0.5, r2*0.9, r3-0.5)); float sp = (2.0+5.0*r4)*uA.x; p = uOrg + d*sp*uAge + vec3(0.0,-4.0*uAge*uAge*uA.y,0.0); size = 0.09*(1.0-uAge*0.7); alpha = clamp(1.0-uAge*1.1, 0.0, 1.0); col = uCol*(1.0+r2*2.0);
  }
  vec4 cp = uVP * vec4(p,1.0); gl_Position = cp; gl_PointSize = clamp(size*uPx/max(cp.w,0.1), 1.0, 90.0); vC = vec4(col, alpha);
}`
const PART_FS = `
in vec4 vC; out vec4 o;
void main(){ vec2 d = gl_PointCoord*2.0-1.0; float f = exp(-dot(d,d)*3.2); if (uExtra.w > 0.5) discard; o = vec4(vC.rgb, vC.a*f); }`
const WATER_VS = `in vec2 aXZ; out vec3 vWP; void main(){ vec2 p = uCam.xz + aXZ*2200.0; vWP = vec3(p.x, WATERY, p.y); gl_Position = uVP*vec4(vWP,1.0); }`
const WATER_FS = `
in vec3 vWP; out vec4 o;
vec3 waveN(vec2 p){ float t = TIME; vec2 g = vec2(0.0);
  for(int i=0;i<3;i++){ float f = 0.7*pow(2.1,float(i)); vec2 q = p*f + vec2(t*0.25*(float(i)+1.0), -t*0.18*float(i+1)); float e = 0.04; float n0 = vnoise(q), nx = vnoise(q+vec2(e,0.0)), nz = vnoise(q+vec2(0.0,e)); g += vec2(n0-nx, n0-nz)/e * (0.045/(float(i)+1.0)); }
  return normalize(vec3(g.x, 1.0, g.y)); }
void main(){
  float gh = terrainH(vWP.xz); float depth = WATERY - gh; if (depth < 0.0) discard;
  vec3 V = normalize(uCam.xyz - vWP); float dist = length(uCam.xyz - vWP);
  vec3 N = waveN(vWP.xz); N = normalize(mix(N, vec3(0.0,1.0,0.0), smoothstep(30.0,300.0,dist)*0.8));
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(N,V),0.0), 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y); vec3 refl = skyCol(R) + uSunCol.rgb*pow(max(dot(R,uSunDir.xyz),0.0), 700.0)*6.0;
  vec3 shallow = vec3(0.045,0.16,0.14), deep = vec3(0.006,0.035,0.05);
  float k = 1.0 - exp(-depth*0.42); vec3 body = mix(shallow, deep, k) * (uSunCol.rgb*0.18*max(uSunDir.y,0.0) + ambient(vec3(0,1,0))*0.9);
  float foam = (1.0 - smoothstep(0.0, 0.55, depth + (vnoise(vWP.xz*3.0+TIME*0.5)-0.5)*0.35)) * (0.5 + 0.5*vnoise(vWP.xz*9.0 - TIME*0.8));
  vec3 col = mix(body, refl, clamp(fres,0.0,1.0)) + vec3(0.8,0.85,0.9)*foam*0.5*(uSunCol.rgb*0.2+ambient(vec3(0,1,0)));
  float alpha = smoothstep(0.0, 0.5, depth) * (0.88 + 0.12*fres);
  o = vec4(applyFog(col, vWP), alpha);
}`
const RING_FS = `
in vec3 vWP; in vec3 vN; in vec2 vUV; in vec3 vLP; out vec4 o; uniform vec3 uTint; uniform vec4 uP;
void main(){ if (uExtra.w > 0.5) discard; float e = smoothstep(0.0,0.2,vUV.x)*smoothstep(1.0,0.8,vUV.x); float s = 0.6+0.4*sin(vUV.y*60.0+TIME*8.0); o = vec4(uTint*(1.5+s)*uP.x, e*uP.y); }`

function createObjects(E) {
  const gl = E.gl
  const obj = E.prog('obj', OBJ_VS, OBJ_FS, { attribs: ['aPos', 'aNrm', 'aUV'], ground: false })
  const portalP = E.prog('portal', OBJ_VS, PORTAL_FS, { attribs: ['aPos', 'aNrm', 'aUV'] })
  const ringP = E.prog('ring', OBJ_VS, RING_FS, { attribs: ['aPos', 'aNrm', 'aUV'] })
  const partP = E.prog('particles', PART_VS, PART_FS, {})
  const waterP = E.prog('water', WATER_VS, WATER_FS, { attribs: ['aXZ'] })
  const meshes = { cube: roundedBox(gl, 1, 1, 1, 0.16, 10), box: roundedBox(gl, 1, 1, 1, 0.03, 4), sphere: uvSphere(gl, 0.5), cyl: cylinder(gl, 0.5, 0.5, 1, 24), cone: cylinder(gl, 0.5, 0.02, 1, 18), disc: disc(gl), ring: ringFlat(gl, 0.85, 1.0, 72) }
  // water: a simple 2x2 grid of quads (big plane)
  const wv = gl.createVertexArray(); gl.bindVertexArray(wv); const wb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, wb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null)
  const pv = gl.createVertexArray()
  const tex = new Map(), white = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); return t })()
  const O = {
    meshes, setTexture(name, source) { const t = tex.get(name) || gl.createTexture(); tex.set(name, t); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4); return t },
    // draw one lit object. o: {mesh, model(mat4), mat, tint[3], em[4], p[4], tex}
    draw(o, shadowPass) {
      obj.use(); obj.i1('uShadow', 7); obj.i1('uTex', 3); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, (o.tex && tex.get(o.tex)) || white); gl.activeTexture(gl.TEXTURE0)
      obj.m4('uModel', o.model); obj.f3('uShear', 0, 0, 0); obj.i1('uMat', o.mat | 0); obj.f3('uTint', ...(o.tint || [1, 1, 1])); const em = o.em || [0, 0, 0, 0]; obj.f4('uEm', em[0], em[1], em[2], em[3]); const pp = o.p || [1, 1, 0, 0]; obj.f4('uP', pp[0], pp[1], pp[2], pp[3])
      const m = meshes[o.mesh]; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null)
    },
    blooks: new Map(),
    makeBlook(name, source) { const old = O.blooks.get(name); if (old) { gl.deleteTexture(old.tex) } const m = window.__RealmBlook.buildRelief(gl, source); O.blooks.set(name, m); return m },
    drawBlook(o, shadow) { const m = O.blooks.get(o.name); if (!m) return; obj.use(); obj.i1('uShadow', 7); obj.i1('uTex', 3); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, m.tex); gl.activeTexture(gl.TEXTURE0); obj.m4('uModel', o.model); obj.i1('uMat', 6); obj.f3('uTint', 1, 1, 1); obj.f4('uEm', 0, 0, 0, 0); obj.f4('uP', 1, 0, o.flash || 0, 0); const sh = o.shear || [0, 0, 0]; obj.f3('uShear', sh[0], sh[1], 1); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null); obj.f3('uShear', 0, 0, 0) },
    drawPortal(model, c0, c1, c2, open) { portalP.use(); portalP.m4('uModel', model); portalP.f3('uC0', ...c0); portalP.f3('uC1', ...c1); portalP.f3('uC2', ...c2); portalP.f1('uOpen', open); const m = meshes.disc; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null) },
    drawRing(model, tint, strength, alpha) { ringP.use(); ringP.m4('uModel', model); ringP.f3('uTint', ...tint); ringP.f4('uP', strength, alpha, 0, 0); const m = meshes.ring; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null) },
    particles(type, count, org, col, a = [0, 0, 0, 0], age = 0) { partP.use(); partP.i1('uType', type); partP.f3('uOrg', org[0], org[1], org[2]); partP.f3('uCol', col[0], col[1], col[2]); partP.f1('uPx', E.h * 0.5 / Math.tan((E.fov || 1.05) / 2)); partP.f4('uA', a[0], a[1], a[2], a[3]); partP.f1('uAge', age); gl.bindVertexArray(pv); gl.drawArrays(gl.POINTS, 0, count); gl.bindVertexArray(null) },
    water() { waterP.use(); gl.bindVertexArray(wv); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null) },
  }
  return O
}
window.__RealmObjects = { createObjects }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, { M } = C
// Every blook gets its own 3D figure: the art is inflated into a plush/vinyl figurine (silhouette -> distance field -> pillowy depth),
// textured front and back with its own art, lit with clearcoat + sheen + rim light, and animated by a vertex shader (idle, hop, attack, hurt).
const AV_VS = `
in vec3 aPos; in vec3 aNrm; in vec2 aUV; in float aAO;
uniform mat4 uModel; uniform vec4 uAnim; uniform vec4 uSeed; // anim: time, move 0..1, attack 0..1, lean ; seed: phase, tempo, amp, fly
out vec3 vWP; out vec3 vN; out vec2 vUV; out float vAO; out float vY;
void main(){
  vec3 p = aPos; float h = clamp(p.y/1.4, 0.0, 1.0);
  float t = uAnim.x*uSeed.y + uSeed.x, mv = uAnim.y, amp = uSeed.z;
  float br = sin(t*2.1); p.y *= 1.0 + 0.018*br; p.xz *= 1.0 - 0.010*br;
  float s = sin(t*7.0); float land = min(s,0.0), air = max(s,0.0);
  float fly = uSeed.w;
  p.y *= 1.0 + 0.10*land*mv*amp*(1.0-fly); p.xz *= 1.0 - 0.06*land*mv*amp*(1.0-fly);
  p.y += air*0.20*mv*amp*(1.0-fly) + fly*(0.35 + 0.10*sin(t*2.6) + 0.06*mv);
  p.x += sin(t*9.0 + p.y*5.0)*0.022*mv*h*amp; p.z += cos(t*8.0 + p.y*4.0)*0.016*mv*h;
  p.x += sin(t*3.0 + p.y*3.0)*0.006*h;
  float a = uAnim.z; if (a > 0.0) { float sw = sin(a*3.14159); p.z += sw*0.45*(0.35+h); p.y *= 1.0 - 0.10*sw; p.x += sw*0.05*sin(a*18.0); }
  float lean = uAnim.w; float cl = cos(lean), sl = sin(lean); p = vec3(p.x, p.y*cl - p.z*sl, p.y*sl + p.z*cl);
  vec3 n = vec3(aNrm.x, aNrm.y*cl - aNrm.z*sl, aNrm.y*sl + aNrm.z*cl);
  vec4 w = uModel * vec4(p, 1.0); vWP = w.xyz; vN = normalize(mat3(uModel)*n); vUV = aUV; vAO = aAO; vY = h; gl_Position = uVP * w;
}`
const AV_FS = `
in vec3 vWP; in vec3 vN; in vec2 vUV; in float vAO; in float vY; out vec4 o;
uniform sampler2D uTex; uniform vec4 uMat; uniform vec4 uFlash; // mat: hue, invert, glow, rarity(0..1) ; flash: rgb, amount
vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a), sa = sin(a); return c*ca + cross(k,c)*sa + k*dot(k,c)*(1.0-ca); }
void main(){
  if (uExtra.w > 0.5) { o = vec4(0.0); return; }
  vec4 t = texture(uTex, vUV); vec3 alb = pow(t.rgb, vec3(2.2));
  if (uMat.x > 0.0) alb = hueRot(alb, TIME*uMat.x*1.3); if (uMat.y > 0.5) alb = vec3(1.0) - alb*0.9;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N; vec3 V = normalize(uCam.xyz - vWP); vec3 L = uSunDir.xyz;
  float ndv = max(dot(N,V),0.0), ndl = dot(N,L);
  float wrap = clamp(ndl*0.6 + 0.4, 0.0, 1.0); wrap *= wrap;
  float sh = shadowAt(vWP, N);
  vec3 H = normalize(L+V); float spec = pow(max(dot(N,H),0.0), 70.0)*0.45 + pow(max(dot(N,H),0.0), 12.0)*0.06; // clearcoat
  vec3 sss = alb*uSunCol.rgb*pow(1.0-ndv, 2.0)*0.22*max(0.0, 0.5-ndl*0.5); // light bleeding through thin edges
  vec3 amb = ambient(N)*(0.55+0.45*vAO);
  vec3 lit = alb*0.42*(uSunCol.rgb*wrap*sh + amb + pointLights(vWP,N)) + sss + spec*uSunCol.rgb*sh;
  lit += pow(1.0-ndv, 3.0)*ambient(N)*0.30*(0.5+alb);
  lit += alb*uMat.z*(1.2+0.5*sin(TIME*3.0+vY*6.0));
  lit = mix(lit, uFlash.rgb*2.0, uFlash.a);
  o = vec4(applyFog(lit, vWP), 1.0);
}`
const KEY_FLY = /(bird|bat|dragon|ghost|angel|fairy|bee|butterfly|owl|eagle|phoenix|wisp|cloud|balloon|moth|crow|parrot|duck|swan|jet|rocket|ufo|alien|star|moon|sun|comet|kite|drone|spirit|wing|hawk|raven|dove|angel|unicorn|pegasus)/i
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967296 }

function buildMesh(img, R = 96) {
  const cv = document.createElement('canvas'); cv.width = cv.height = R; const g = cv.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, R, R)
  // 1) find the real bounds of the art
  const probe = document.createElement('canvas'); const pw = Math.min(256, img.naturalWidth || img.width || 128), ph = Math.min(256, img.naturalHeight || img.height || 128); probe.width = pw; probe.height = ph
  const pg = probe.getContext('2d', { willReadFrequently: true }); pg.drawImage(img, 0, 0, pw, ph); const pd = pg.getImageData(0, 0, pw, ph).data
  let x0 = pw, y0 = ph, x1 = 0, y1 = 0; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (pd[(y * pw + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = pw - 1; y1 = ph - 1 }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fit = (R - 8) / Math.max(bw, bh), dw = bw * fit, dh = bh * fit
  const ox = (R - dw) / 2, oy = R - 4 - dh // feet on the ground, centred
  g.drawImage(probe, x0, y0, bw, bh, ox, oy, dw, dh)
  const px = g.getImageData(0, 0, R, R).data, mask = new Uint8Array(R * R)
  for (let i = 0; i < R * R; i++) mask[i] = px[i * 4 + 3] > 40 ? 1 : 0
  // 2) fill small holes (so eyes etc. do not tear the mesh)
  const seen = new Uint8Array(R * R), st = []; for (let i = 0; i < R; i++) { for (const k of [i, (R - 1) * R + i, i * R, i * R + R - 1]) if (!mask[k] && !seen[k]) { seen[k] = 1; st.push(k) } }
  while (st.length) { const k = st.pop(), x = k % R, y = (k / R) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= R || ny >= R) continue; const n = ny * R + nx; if (!mask[n] && !seen[n]) { seen[n] = 1; st.push(n) } } }
  for (let i = 0; i < R * R; i++) if (!mask[i] && !seen[i]) mask[i] = 1
  // 3) distance to edge (two-pass chamfer)
  const d = new Float32Array(R * R); for (let i = 0; i < R * R; i++) d[i] = mask[i] ? 1e4 : 0
  for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) { const i = y * R + x; if (!mask[i]) continue; let v = d[i]; if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - R] + 1); if (x > 0) v = Math.min(v, d[i - R - 1] + 1.4); if (x < R - 1) v = Math.min(v, d[i - R + 1] + 1.4) } d[i] = v }
  for (let y = R - 1; y >= 0; y--) for (let x = R - 1; x >= 0; x--) { const i = y * R + x; if (!mask[i]) continue; let v = d[i]; if (x < R - 1) v = Math.min(v, d[i + 1] + 1); if (y < R - 1) { v = Math.min(v, d[i + R] + 1); if (x < R - 1) v = Math.min(v, d[i + R + 1] + 1.4); if (x > 0) v = Math.min(v, d[i + R - 1] + 1.4) } d[i] = v }
  let maxd = 1; for (let i = 0; i < R * R; i++) if (mask[i] && d[i] > maxd) maxd = d[i]
  // 4) pillow depth + a hint of relief from the art's brightness
  const z = new Float32Array(R * R), tk = Math.min(1, 0.55 * maxd), blur = new Float32Array(R * R)
  for (let i = 0; i < R * R; i++) { if (!mask[i]) continue; const t = Math.min(1, d[i] / (tk + 1e-3)), base = Math.pow(1 - (1 - t) * (1 - t), 0.8), lum = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255; z[i] = base * (0.82 + 0.18 * (lum - 0.5) * 2 * Math.min(1, d[i] / 4)) }
  for (let pass = 0; pass < 2; pass++) { for (let y = 1; y < R - 1; y++) for (let x = 1; x < R - 1; x++) { const i = y * R + x; blur[i] = (z[i] * 4 + z[i - 1] + z[i + 1] + z[i - R] + z[i + R]) / 8 } for (let i = 0; i < R * R; i++) if (mask[i]) z[i] = blur[i] }
  const worldH = 1.45, s = worldH / Math.max(dh, dw * 0.9, 1) * 1.0, zScale = Math.min(0.36, Math.max(0.2, (Math.min(dw, dh) * s) * 0.55))
  // 5) vertices: front and back share the silhouette
  const idx = new Int32Array(R * R).fill(-1), vf = [], vb = []
  const at = (x, y) => (x < 0 || y < 0 || x >= R || y >= R ? 0 : z[y * R + x])
  const push = (arr, x, y, front) => { const i = y * R + x, zz = z[i] * zScale; const dzx = (at(x + 1, y) - at(x - 1, y)) * zScale / (2 * s), dzy = (at(x, y + 1) - at(x, y - 1)) * zScale / (2 * s); const sgn = front ? 1 : -1
    let nx = -dzx * sgn, ny = dzy * sgn, nz = sgn * 1.0; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l
    const lap = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * z[i]); const ao = Math.max(0.25, Math.min(1, 0.6 + 6.0 * lap + 0.5 * z[i]))
    arr.push((x - R / 2 + 0.5) * s, (R - y) * s - (R - (oy + dh)) * s * 1 - 0.0, sgn * zz, nx, ny, nz, (front ? x : R - x) / R, y / R, ao) }
  // build index per pixel
  let n = 0; for (let i = 0; i < R * R; i++) if (mask[i]) idx[i] = n++
  const yShift = 0
  const verts = new Float32Array(n * 2 * 9); let vi = 0
  const put = (front) => { for (let i = 0; i < R * R; i++) { if (!mask[i]) continue; const x = i % R, y = (i / R) | 0; const arr = []; push(arr, x, y, front); arr[1] += yShift; for (let k = 0; k < 9; k++) verts[vi++] = arr[k] } }
  put(true); put(false)
  // feet at y = 0
  let minY = 1e9; for (let i = 0; i < n * 2; i++) minY = Math.min(minY, verts[i * 9 + 1]); for (let i = 0; i < n * 2; i++) verts[i * 9 + 1] -= minY
  const ix = []
  for (let y = 0; y < R - 1; y++) for (let x = 0; x < R - 1; x++) { const a = idx[y * R + x], b = idx[y * R + x + 1], c = idx[(y + 1) * R + x], dd = idx[(y + 1) * R + x + 1]; if (a < 0 || b < 0 || c < 0 || dd < 0) continue; ix.push(a, c, b, b, c, dd); ix.push(n + a, n + b, n + c, n + b, n + dd, n + c) }
  // closing strip on the silhouette: triangles with 3 corners
  for (let y = 0; y < R - 1; y++) for (let x = 0; x < R - 1; x++) { const q = [idx[y * R + x], idx[y * R + x + 1], idx[(y + 1) * R + x], idx[(y + 1) * R + x + 1]]; const m = q.filter((v) => v >= 0); if (m.length === 3) { const [a, b, c] = m; ix.push(a, c, b); ix.push(n + a, n + b, n + c) } }
  return { verts, ix: new Uint32Array(ix), canvas: cv, height: (verts.reduce((m, v, i) => (i % 9 === 1 && v > m ? v : m), 0)), count: n }
}

function createAvatars(E, O, avatarFor) {
  const gl = E.gl, P = E.prog('avatar', AV_VS, AV_FS, { attribs: ['aPos', 'aNrm', 'aUV', 'aAO'] }), cache = new Map(), white = (() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 150, 50, 255])); return t })()
  function upload(m) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW)
    ;[[0, 3, 0], [1, 3, 12], [2, 2, 24], [3, 1, 32]].forEach(([i, n, o]) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 36, o) })
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ix, gl.STATIC_DRAW); gl.bindVertexArray(null)
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m.canvas); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return { vao, n: m.ix.length, tex, height: m.height }
  }
  function entry(id) {
    let e = cache.get(id); if (e) return e
    const info = (avatarFor && avatarFor(id)) || {}, nm = info.name || id, hh = hashStr(String(id))
    e = { id, ready: false, failed: false, fly: KEY_FLY.test(nm) ? 1 : 0, seed: [hh * 6.28, 0.85 + hashStr(id + 't') * 0.4, 0.75 + hashStr(id + 'a') * 0.6], hue: info.hue ? 0.6 : (info.rarity === 'chroma' ? 0.7 : 0), inv: info.zero ? 1 : 0, glow: info.rarity === 'mystical' ? 0.12 : info.rarity === 'legendary' ? 0.05 : 0, height: 1.4 }
    cache.set(id, e)
    if (!info.src) { e.failed = true; return e }
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => { try { const m = buildMesh(im); const u = upload(m); Object.assign(e, u, { ready: true }) } catch (err) { console.warn('avatar build failed', id, err); e.failed = true } }
    im.onerror = () => { e.failed = true }; im.src = info.src
    return e
  }
  return {
    entry, has: (id) => { const e = entry(id); return e.ready }, count: () => cache.size,
    // returns false when the avatar is not ready (caller draws the fallback cube)
    draw(id, model, anim, shadow, flash) {
      const e = entry(id); if (!e.ready) return false
      P.use(); P.i1('uShadow', 7); P.i1('uTex', 3); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, e.tex); gl.activeTexture(gl.TEXTURE0)
      P.m4('uModel', model); P.f4('uAnim', anim[0], anim[1], anim[2], anim[3]); P.f4('uSeed', e.seed[0], e.seed[1], e.seed[2], e.fly); P.f4('uMat', e.hue, e.inv, e.glow, 0)
      const f = flash || [0, 0, 0, 0]; P.f4('uFlash', f[0], f[1], f[2], f[3]); gl.bindVertexArray(e.vao); gl.disable(gl.CULL_FACE); gl.drawElements(gl.TRIANGLES, e.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null); return true
    },
    height: (id) => { const e = entry(id); return e.ready ? e.height : 1.2 }, failed: (id) => entry(id).failed,
  }
}
window.__RealmAvatars = { createAvatars, buildMesh }
})()
;
(function () {
'use strict'
const RCOL = { common: '#9aa7b2', uncommon: '#4cc45a', rare: '#3b8df0', epic: '#b04cf0', legendary: '#ffb400' }
const ITEMS = {
  wood_sword: { n: 'Wooden Sword', t: 'weapon', r: 'common', dmg: 16, reach: 3.0, cd: 0.50, kind: 'sword', d: 'A trusty starter blade.' },
  oak_spear: { n: 'Oak Spear', t: 'weapon', r: 'uncommon', dmg: 21, reach: 4.4, cd: 0.62, kind: 'spear', d: 'Long reach, steady hits.' },
  iron_sword: { n: 'Iron Sword', t: 'weapon', r: 'uncommon', dmg: 25, reach: 3.1, cd: 0.48, kind: 'sword', d: 'Sharp, balanced and reliable.' },
  sun_saber: { n: 'Sun Saber', t: 'weapon', r: 'rare', dmg: 35, reach: 3.3, cd: 0.44, kind: 'sword', d: 'Forged from a Sun Shard.' },
  stone_hammer: { n: 'Stone Hammer', t: 'weapon', r: 'rare', dmg: 58, reach: 3.0, cd: 0.95, kind: 'hammer', d: 'Slow, heavy, crushing.' },
  frost_glaive: { n: 'Frost Glaive', t: 'weapon', r: 'epic', dmg: 46, reach: 4.2, cd: 0.54, kind: 'spear', d: 'Cold enough to crack stone.' },
  hollow_edge: { n: 'Hollow Edge', t: 'weapon', r: 'legendary', dmg: 78, reach: 3.7, cd: 0.46, kind: 'sword', d: 'Whispers when drawn.' },
  leather_vest: { n: 'Leather Vest', t: 'armor', r: 'common', hp: 15, d: 'Better than nothing.' },
  chain_mail: { n: 'Chain Mail', t: 'armor', r: 'uncommon', hp: 32, d: 'Rings of old iron.' },
  sun_plate: { n: 'Sunplate', t: 'armor', r: 'rare', hp: 55, d: 'Warm to the touch.' },
  frost_mail: { n: 'Frostmail', t: 'armor', r: 'epic', hp: 80, d: 'Never melts.' },
  hollow_plate: { n: 'Hollow Plate', t: 'armor', r: 'legendary', hp: 120, d: 'Lighter than it looks.' },
  swift_charm: { n: 'Swift Charm', t: 'charm', r: 'common', speed: 0.08, d: '+8% move speed.' },
  lucky_charm: { n: 'Lucky Charm', t: 'charm', r: 'uncommon', crit: 0.12, d: '+12% critical hits.' },
  heart_charm: { n: 'Heart Charm', t: 'charm', r: 'rare', regen: 1.4, d: 'Slowly restores health.' },
  titan_charm: { n: 'Titan Charm', t: 'charm', r: 'epic', dmgMul: 0.15, d: '+15% damage.' },
  potion_s: { n: 'Small Potion', t: 'potion', r: 'common', heal: 40, stack: 9, d: 'Restores 40 health.' },
  potion_l: { n: 'Large Potion', t: 'potion', r: 'rare', heal: 100, stack: 9, d: 'Restores 100 health.' },
}
const GEAR = { 1: ['wood_sword', 'leather_vest', 'swift_charm', 'oak_spear'], 2: ['iron_sword', 'chain_mail', 'lucky_charm', 'oak_spear', 'stone_hammer'], 3: ['sun_saber', 'sun_plate', 'heart_charm', 'stone_hammer'], 4: ['frost_glaive', 'frost_mail', 'titan_charm', 'sun_saber'], 5: ['hollow_edge', 'hollow_plate', 'titan_charm', 'frost_glaive'] }
const rng = Math.random
const pick = (a) => a[(rng() * a.length) | 0]
// tier: 'wood' | 'iron' | 'gold' | 'boss' | 'enemy' ; lvl 1..5 (chapter)
function rollLoot(tier, lvl = 1) {
  const out = [], add = (id, n = 1) => { const f = out.find((o) => o.id === id); if (f) f.n += n; else out.push({ id, n }) }
  const gear = (minR) => { const pool = (GEAR[Math.min(5, Math.max(1, lvl))] || GEAR[1]).filter((id) => ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(ITEMS[id].r) >= minR); return pool.length ? pick(pool) : pick(GEAR[1]) }
  if (tier === 'enemy') { if (rng() < 0.22) add('potion_s'); if (rng() < 0.06 + lvl * 0.01) add(gear(0)); return out }
  if (tier === 'wood') { add('potion_s', 1 + ((rng() * 2) | 0)); if (rng() < 0.7) add(gear(0)); if (rng() < 0.15) add('potion_l'); return out }
  if (tier === 'iron') { add('potion_s', 2); if (rng() < 0.5) add('potion_l'); add(gear(1)); if (rng() < 0.4) add(gear(1)); return out }
  if (tier === 'gold') { add('potion_l', 1 + ((rng() * 2) | 0)); add(gear(2)); if (rng() < 0.6) add(gear(2)); if (rng() < 0.14) add(gear(4)); return out }
  add('potion_l', 2); add(gear(3)); add(gear(2)); if (rng() < 0.25) add(gear(4)); return out
}
const ICON = {
  weapon: (c, k) => (k === 'spear' ? `<path d="M6 26L24 8" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M22 4l6 2-2 6z" fill="${c}"/>` : k === 'hammer' ? `<path d="M8 26L20 12" stroke="#b9895a" stroke-width="3.5" stroke-linecap="round"/><rect x="15" y="5" width="13" height="9" rx="2" fill="${c}" transform="rotate(35 21 9)"/>` : `<path d="M6 26L22 10" stroke="#8a6a44" stroke-width="3.5" stroke-linecap="round"/><path d="M14 18l-4 4M22 10L28 4l-1 5z" stroke="${c}" stroke-width="2.4" fill="${c}"/><path d="M10 22l-4 4" stroke="#6a4a2a" stroke-width="3" stroke-linecap="round"/>`),
  armor: (c) => `<path d="M8 8l8-3 8 3 3 6-4 3v11H9V17l-4-3z" fill="${c}" stroke="#2a1608" stroke-width="1.6" stroke-linejoin="round"/>`,
  charm: (c) => `<circle cx="16" cy="18" r="8" fill="${c}" stroke="#2a1608" stroke-width="1.6"/><path d="M16 4v6" stroke="#2a1608" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="18" r="3" fill="#fff" fill-opacity=".55"/>`,
  potion: (c) => `<path d="M13 4h6v6l5 9a5 5 0 01-4.4 7.4h-7.2A5 5 0 018 19l5-9z" fill="${c}" stroke="#2a1608" stroke-width="1.6" stroke-linejoin="round"/><rect x="12" y="3" width="8" height="3" rx="1" fill="#8a6a44"/>`,
}
const iconSVG = (id) => { const it = ITEMS[id]; if (!it) return ''; const c = it.t === 'potion' ? (it.heal > 60 ? '#ff4a6a' : '#ff8aa0') : RCOL[it.r]; return `<svg viewBox="0 0 32 32" width="100%" height="100%">${ICON[it.t](c, it.kind)}</svg>` }

function createInventory(root, ui, opts = {}) {
  const KEY = opts.key || 'oranget_realm_inv'
  let st = { slots: new Array(20).fill(null), eq: { weapon: 'wood_sword', armor: null, charm: null }, hot: [null, null, null, null, null, null] }
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.slots) st = { ...st, ...j } } catch {}
  if (!st.slots.some((s) => s && s.id === 'potion_s')) { const i = st.slots.indexOf(null); if (i >= 0 && !st._seeded) { st.slots[i] = { id: 'potion_s', n: 3 }; st._seeded = 1 } }
  const subs = []; let sel = null, open = false
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch {} }
  const emit = () => { save(); render(); subs.forEach((f) => f()) }
  const count = (id) => st.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0)
  const A = {
    onChange(f) { subs.push(f) },
    state: () => st,
    add(id, n = 1) { const it = ITEMS[id]; if (!it) return false; let left = n
      if (it.stack) for (const s of st.slots) if (s && s.id === id && s.n < it.stack && left > 0) { const k = Math.min(it.stack - s.n, left); s.n += k; left -= k }
      while (left > 0) { const i = st.slots.indexOf(null); if (i < 0) { emit(); return false } const k = it.stack ? Math.min(it.stack, left) : 1; st.slots[i] = { id, n: k }; left -= k }
      emit(); return true },
    remove(id, n = 1) { let left = n; for (let i = 0; i < st.slots.length && left > 0; i++) { const s = st.slots[i]; if (s && s.id === id) { const k = Math.min(s.n, left); s.n -= k; left -= k; if (s.n <= 0) st.slots[i] = null } } emit() },
    count,
    stats() {
      const w = ITEMS[st.eq.weapon] || ITEMS.wood_sword, a = ITEMS[st.eq.armor] || {}, c = ITEMS[st.eq.charm] || {}
      return { dmg: Math.round(w.dmg * (1 + (c.dmgMul || 0))), reach: w.reach, cd: w.cd, kind: w.kind, maxHp: 100 + (a.hp || 0), speed: 1 + (c.speed || 0), crit: 0.05 + (c.crit || 0), regen: c.regen || 0, weapon: st.eq.weapon }
    },
    equip(id) { const it = ITEMS[id]; if (!it || !['weapon', 'armor', 'charm'].includes(it.t)) return; const prev = st.eq[it.t]; st.eq[it.t] = id; const i = st.slots.findIndex((s) => s && s.id === id); if (i >= 0) st.slots[i] = prev ? { id: prev, n: 1 } : null; emit() },
    useId(id) { const it = ITEMS[id]; if (!it) return null; if (it.t === 'potion') { if (count(id) <= 0) return null; A.remove(id, 1); return { heal: it.heal } } if (['weapon', 'armor', 'charm'].includes(it.t)) { A.equip(id); return { equipped: id } } return null },
    useHot(i) { const id = st.hot[i]; if (!id) return null; if (ITEMS[id].t !== 'potion' && st.eq[ITEMS[id].t] === id) return null; return A.useId(id) },
    toggle(v) { open = v == null ? !open : v; panel.style.display = open ? 'block' : 'none'; if (open) render() },
    isOpen: () => open, hotbar: () => st.hot, ITEMS,
  }
  // ---- DOM: hotbar + backpack
  const css = document.createElement('style'); css.textContent = `
.rm-hot{position:absolute;left:50%;bottom:max(env(safe-area-inset-bottom),12px);transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto}
.rm-slot{position:relative;width:54px;height:54px;border-radius:10px;background:rgba(18,9,2,.66);border:2px solid rgba(255,255,255,.4);display:grid;place-items:center;color:#fff;font:12px system-ui}
.rm-slot svg{width:36px;height:36px}.rm-slot b{position:absolute;left:4px;top:1px;font-size:10px;opacity:.8;font-weight:400}.rm-slot em{position:absolute;right:4px;bottom:1px;font-size:11px;font-style:normal;font-weight:700}
.rm-slot.on{border-color:#ffb25a;box-shadow:0 0 10px #ffb25a88}
.rm-pack{position:absolute;right:12px;top:64px;width:min(420px,94vw);max-height:78vh;overflow:auto;background:rgba(18,9,2,.92);border:2px solid #ffb25a;border-radius:14px;padding:12px;display:none;pointer-events:auto;font-family:system-ui,sans-serif;color:#fff}
.rm-pack h3{margin:0 0 8px;font:400 18px 'Titan One',system-ui}
.rm-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.rm-grid .rm-slot{width:auto;height:auto;aspect-ratio:1}
.rm-eq{display:flex;gap:6px;margin-bottom:10px}.rm-eq .rm-slot{flex:1;height:60px;width:auto}.rm-eq small{position:absolute;left:0;right:0;bottom:-1px;font-size:9px;text-align:center;opacity:.7}
.rm-det{margin-top:10px;padding:8px;border-radius:10px;background:rgba(255,255,255,.07);font-size:13px;line-height:1.4}.rm-det b{font-size:15px}
.rm-det button{margin:6px 6px 0 0;padding:5px 12px;border-radius:8px;background:#ff8a1f;color:#fff;font:700 12px system-ui}.rm-det button.alt{background:rgba(255,255,255,.18)}`
  document.head.appendChild(css)
  const hot = document.createElement('div'); hot.className = 'rm-hot'; ui.root.appendChild(hot)
  const panel = document.createElement('div'); panel.className = 'rm-pack'; ui.root.appendChild(panel)
  const slotHTML = (id, n, extra = '') => id ? `${iconSVG(id)}${n > 1 ? `<em>${n}</em>` : ''}${extra}` : extra
  function render() {
    hot.innerHTML = ''
    for (let i = 0; i < 6; i++) { const id = st.hot[i], d = document.createElement('div'); d.className = 'rm-slot' + (id && st.eq[ITEMS[id].t] === id ? ' on' : ''); const n = id && ITEMS[id].stack ? count(id) : 0; d.innerHTML = slotHTML(id, n, `<b>${i + 1}</b>`); if (id) d.style.borderColor = d.classList.contains('on') ? '' : RCOL[ITEMS[id].r]; d.onclick = () => { const r = A.useHot(i); if (r && opts.onUse) opts.onUse(r) }; hot.appendChild(d) }
    if (!open) return
    const eq = ['weapon', 'armor', 'charm'].map((k) => { const id = st.eq[k]; return `<div class="rm-slot" data-eq="${k}" style="${id ? 'border-color:' + RCOL[ITEMS[id].r] : ''}">${id ? iconSVG(id) : ''}<small>${k}</small></div>` }).join('')
    const grid = st.slots.map((s, i) => `<div class="rm-slot" data-i="${i}" style="${s ? 'border-color:' + RCOL[ITEMS[s.id].r] : ''}${sel === i ? ';box-shadow:0 0 0 2px #fff' : ''}">${s ? slotHTML(s.id, s.n) : ''}</div>`).join('')
    const stt = A.stats(); let det = ''
    if (sel != null && st.slots[sel]) { const id = st.slots[sel].id, it = ITEMS[id], stats = it.t === 'weapon' ? `Damage ${it.dmg} | Reach ${it.reach} | ${it.cd}s` : it.t === 'armor' ? `+${it.hp} max health` : it.t === 'potion' ? `Heals ${it.heal}` : it.d
      det = `<div class="rm-det"><b style="color:${RCOL[it.r]}">${it.n}</b> <small>${it.r} ${it.t}</small><br>${stats}<br><i style="opacity:.7">${it.d}</i><br>${it.t === 'potion' ? '<button data-a="use">Use</button>' : '<button data-a="equip">Equip</button>'}<button class="alt" data-a="pin">Pin to hotbar</button><button class="alt" data-a="drop">Discard</button></div>` }
    panel.innerHTML = `<h3>Backpack <small style="font:12px system-ui;opacity:.7">Dmg ${stt.dmg} | HP ${stt.maxHp} | Speed ${Math.round(stt.speed * 100)}%</small></h3><div class="rm-eq">${eq}</div><div class="rm-grid">${grid}</div>${det}`
    panel.querySelectorAll('[data-i]').forEach((e) => (e.onclick = () => { sel = +e.dataset.i; render() }))
    panel.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { const s = st.slots[sel]; if (!s) return; const a = b.dataset.a
      if (a === 'use' || a === 'equip') { const r = A.useId(s.id); if (r && opts.onUse) opts.onUse(r) } else if (a === 'pin') { const free = st.hot.indexOf(null); const slot = free >= 0 ? free : 5; st.hot = st.hot.map((h) => (h === s.id ? null : h)); st.hot[slot] = s.id; emit() } else if (a === 'drop') { st.slots[sel] = null; sel = null; emit() }
      if (!st.slots[sel]) sel = null; render() }))
  }
  // equipped weapon is always available on slot 1 so you can swap quickly
  if (!st.hot[0]) st.hot[0] = st.eq.weapon
  render()
  A.dispose = () => { hot.remove(); panel.remove(); css.remove() }
  return A
}
window.__RealmItems = { ITEMS, RCOL, rollLoot, createInventory, iconSVG }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, { M, clamp, mix } = C
const TAU = Math.PI * 2, smooth = (t) => t * t * (3 - 2 * t)
const BOSSES = {
  titan: { name: 'Meadow Titan', hp: 900, build: 'golem', scale: 1, pal: { tint: [0.17, 0.155, 0.14], lava: [1.0, 0.34, 0.06], core: [1.0, 0.42, 0.1], stun: [0.5, 0.85, 1.0] }, atk: ['slam', 'stomp', 'rocks'], speed: 2.6, light: [0.7, 0.3, 0.1] },
  warden: { name: 'Thornwood Warden', hp: 1100, build: 'ent', scale: 1, pal: { tint: [0.055, 0.035, 0.022], leaf: [0.02, 0.06, 0.012], lava: [0.4, 1.0, 0.25], core: [0.5, 1.0, 0.3], stun: [1.0, 0.8, 0.3] }, atk: ['roots', 'sweep', 'bolts', 'roots'], speed: 2.3, light: [0.15, 0.5, 0.12] },
  tide: { name: 'Tide Golem', hp: 1300, build: 'crab', scale: 1, pal: { tint: [0.07, 0.13, 0.15], lava: [0.2, 0.85, 1.0], core: [0.3, 0.9, 1.0], stun: [1.0, 0.7, 0.3] }, atk: ['burst', 'slam', 'bolts', 'stomp'], speed: 3.1, light: [0.1, 0.4, 0.55] },
  glacier: { name: 'Glacier Colossus', hp: 1600, build: 'golem', scale: 1.15, pal: { tint: [0.30, 0.38, 0.46], lava: [0.35, 0.75, 1.0], core: [0.4, 0.85, 1.0], stun: [1.0, 0.6, 0.2] }, atk: ['shards', 'charge', 'stomp', 'slam'], speed: 2.8, light: [0.25, 0.45, 0.7] },
  hollow: { name: 'The Hollow King', hp: 2000, build: 'king', scale: 1, pal: { tint: [0.035, 0.028, 0.05], lava: [0.75, 0.3, 1.0], core: [0.8, 0.4, 1.0], stun: [1.0, 0.9, 0.4] }, atk: ['orbs', 'tp', 'slam', 'shards'], speed: 3.3, light: [0.45, 0.15, 0.7] },
}
const ATK = {
  slam: { dur: 1.5, stun: 3.2 }, stomp: { dur: 1.1, stun: 0 }, rocks: { dur: 1.5, stun: 0 }, roots: { dur: 1.3, stun: 0 }, sweep: { dur: 1.5, stun: 0 }, burst: { dur: 1.3, stun: 0 },
  bolts: { dur: 1.2, stun: 0 }, shards: { dur: 1.3, stun: 0 }, charge: { dur: 1.9, stun: 2.6 }, orbs: { dur: 1.4, stun: 0 }, tp: { dur: 1.4, stun: 1.6 },
}
let hid = 1
const newBoss = (key, x, z, y, scaleHp = 1, dmgMul = 1) => { const d = BOSSES[key]; return { key, x, z, y, yaw: 0, hp: Math.round(d.hp * scaleHp), max: Math.round(d.hp * scaleHp), state: 'rise', t: 0, cd: 2.0, arm: 0, stun: 0, atk: null, hz: [], dead: 0, flash: 0, phase: 1, dm: dmgMul, vis: 1 } }

// one simulation tick. targets: [{x,z,y,alive}], ctx: { H(x,z), fx(f) }
function bossTick(T, dt, targets, ctx) {
  const D = BOSSES[T.key]; if (T.state !== 'fight') return
  T.t += dt; T.flash = Math.max(0, T.flash - dt * 3)
  const alive = targets.filter((t) => t.alive !== false); let tg = alive[0] || targets[0]; let bd = 1e9
  for (const t of alive) { const d = Math.hypot(t.x - T.x, t.z - T.z); if (d < bd) { bd = d; tg = t } }
  if (!tg) return
  if (T.phase === 1 && T.hp < T.max * 0.4) { T.phase = 2; ctx.fx({ k: 'roar', x: T.x, z: T.z, y: T.y }) }
  const sp = D.speed * (T.phase === 2 ? 1.25 : 1), dx = tg.x - T.x, dz = tg.z - T.z, d = Math.hypot(dx, dz)
  const hazStep = () => stepHazards(T.hz, dt)
  if (T.stun > 0) { T.stun -= dt; T.arm = mix(T.arm, 0, dt * 4); hazStep(); if (T.stun <= 0) T.cd = 1.2; return }
  const want = Math.atan2(dx, dz); let dy = want - T.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU
  T.yaw += dy * Math.min(1, dt * (T.atk ? (T.atk.kind === 'charge' && T.atk.t / T.atk.dur > 0.4 ? 0 : 0.9) : 2.2))
  if (!T.atk) {
    if (d > 9) { T.x += Math.sin(T.yaw) * sp * dt; T.z += Math.cos(T.yaw) * sp * dt }
    T.arm = mix(T.arm, 0, dt * 5); T.cd -= dt
    if (T.cd <= 0) { let kind = D.atk[(Math.random() * D.atk.length) | 0]; if (d < 8 && Math.random() < 0.4) kind = 'stomp'; if (T.key === 'hollow' && Math.random() < 0.3) kind = 'tp'; T.atk = { kind, t: 0, dur: ATK[kind].dur * (T.phase === 2 ? 0.85 : 1), hit: false, tx: tg.x, tz: tg.z } }
  } else {
    const a = T.atk; a.t += dt; const k = a.t / a.dur
    T.arm = k < 0.65 ? smooth(k / 0.65) * 1.6 : mix(1.6, -0.6, smooth(clamp((k - 0.65) / 0.2, 0, 1)))
    if (a.kind === 'charge') { if (k > 0.4 && k < 0.62) { const L = Math.hypot(a.tx - T.x, a.tz - T.z) || 1; if (!a.dx) { a.dx = (a.tx - T.x) / L; a.dz = (a.tz - T.z) / L } T.x += a.dx * 46 * dt; T.z += a.dz * 46 * dt; for (const t of alive) if (Math.hypot(t.x - T.x, t.z - T.z) < 4.2 && !a.hitSet) { T.hz.push({ id: hid++, k: 'hit', x: T.x, z: T.z, r: 4.4, dmg: 30, t: 0, life: 0.2 }); a.hitSet = true } } }
    if (!a.hit && k >= (a.kind === 'tp' ? 0.45 : 0.68)) {
      a.hit = true; const dmg = (x) => Math.round(x * T.dm), fx = (o) => ctx.fx(o), fwd = [Math.sin(T.yaw), Math.cos(T.yaw)], G = (x, z) => ctx.H(x, z)
      const ring = (x, z, spd, dm, maxR = 46) => T.hz.push({ id: hid++, k: 'ring', x, z, y: G(x, z), r: 2, spd, maxR, dmg: dmg(dm) })
      const zone = (x, z, r, delay, dm) => T.hz.push({ id: hid++, k: 'zone', x, z, y: G(x, z), r, t: 0, delay, life: delay + 0.7, dmg: dmg(dm) })
      const bolt = (x, z, ang, spd, dm, r = 0.9, life = 3) => T.hz.push({ id: hid++, k: 'bolt', x, z, y: G(x, z) + 1.4, dx: Math.sin(ang), dz: Math.cos(ang), spd, r, t: 0, life, dmg: dmg(dm) })
      if (a.kind === 'slam') { const sx = T.x + fwd[0] * 4, sz = T.z + fwd[1] * 4; ring(sx, sz, 16, 25); fx({ k: 'burst', x: sx, z: sz, y: G(sx, sz), c: [1, 0.6, 0.25], n: 150, shake: 0.9 }); T.stun = ATK.slam.stun }
      else if (a.kind === 'stomp') { T.hz.push({ id: hid++, k: 'zone', x: T.x, z: T.z, y: G(T.x, T.z), r: 7.5, t: 0.7, delay: 0.7, life: 1.3, dmg: dmg(22) }); fx({ k: 'burst', x: T.x, z: T.z, y: G(T.x, T.z), c: [1, 0.7, 0.4], n: 110, shake: 0.7 }); T.cd = 1.6 }
      else if (a.kind === 'rocks') { for (let i = 0; i < (T.phase === 2 ? 5 : 3); i++) { const ox = (i - 1) * 3.2, tx = tg.x + ox + (Math.random() - 0.5) * 2, tz = tg.z + (Math.random() - 0.5) * 3; T.hz.push({ id: hid++, k: 'proj', x0: T.x, y0: T.y + 12 * (D.scale || 1), z0: T.z, x: tx, z: tz, y: G(tx, tz), r: 3.2, t: -i * 0.26, dur: 1.5, life: 1.5 + 0.2, dmg: dmg(16) }) } T.cd = 2.0 }
      else if (a.kind === 'roots') { const n = T.phase === 2 ? 7 : 5; for (let i = 0; i < n; i++) { const ang = (i / n) * TAU, rr = i === 0 ? 0 : 5 + Math.random() * 6; zone(tg.x + Math.cos(ang) * rr, tg.z + Math.sin(ang) * rr, 3.4, 1.0 + i * 0.1, 22) } T.cd = 1.6 }
      else if (a.kind === 'sweep') { for (let i = 0; i < 5; i++) { const ang = T.yaw + (i - 2) * 0.32, dd = 6 + i * 1.5; zone(T.x + Math.sin(ang) * dd, T.z + Math.cos(ang) * dd, 3.6, 0.4 + i * 0.2, 20) } T.cd = 1.5 }
      else if (a.kind === 'burst') { for (let i = 0; i < 3; i++) setTimeout && 0; ring(T.x, T.z, 11, 18, 40); T.hz.push({ id: hid++, k: 'ring', x: T.x, z: T.z, y: G(T.x, T.z), r: -4, spd: 11, maxR: 40, dmg: dmg(18) }); T.hz.push({ id: hid++, k: 'ring', x: T.x, z: T.z, y: G(T.x, T.z), r: -10, spd: 11, maxR: 40, dmg: dmg(18) }); fx({ k: 'burst', x: T.x, z: T.z, y: G(T.x, T.z), c: [0.4, 0.8, 1], n: 120, shake: 0.7 }); T.cd = 1.8 }
      else if (a.kind === 'bolts' || a.kind === 'shards') { const n = a.kind === 'shards' ? (T.phase === 2 ? 9 : 7) : (T.phase === 2 ? 7 : 5), spread = a.kind === 'shards' ? 0.2 : 0.17, base = Math.atan2(tg.x - T.x, tg.z - T.z); for (let i = 0; i < n; i++) bolt(T.x + fwd[0] * 3, T.z + fwd[1] * 3, base + (i - (n - 1) / 2) * spread, a.kind === 'shards' ? 22 : 15, a.kind === 'shards' ? 16 : 14, 0.8, 2.6); T.cd = 1.5 }
      else if (a.kind === 'orbs') { const n = T.phase === 2 ? 6 : 4, base = Math.atan2(tg.x - T.x, tg.z - T.z); for (let i = 0; i < n; i++) bolt(T.x, T.z, base + (i - (n - 1) / 2) * 0.45, 7, 18, 1.2, 7); T.cd = 1.4 }
      else if (a.kind === 'tp') { const ang = Math.random() * TAU; fx({ k: 'burst', x: T.x, z: T.z, y: T.y + 4, c: [0.7, 0.3, 1], n: 90, shake: 0 }); T.x = tg.x + Math.cos(ang) * 9; T.z = tg.z + Math.sin(ang) * 9; fx({ k: 'burst', x: T.x, z: T.z, y: T.y + 4, c: [0.7, 0.3, 1], n: 90, shake: 0.3 }); T.hz.push({ id: hid++, k: 'zone', x: T.x, z: T.z, y: G(T.x, T.z), r: 9, t: 0, delay: 0.7, life: 1.4, dmg: dmg(26) }) }
    }
    if (k >= 1) { const st = ATK[a.kind].stun; if (st && a.kind !== 'slam') T.stun = st; T.atk = null; if (T.cd < 0.8) T.cd = 1.2 }
  }
  hazStep()
}
function stepHazards(hz, dt) {
  for (let i = hz.length - 1; i >= 0; i--) {
    const h = hz[i]
    if (h.k === 'ring') { h.r += h.spd * dt; if (h.r > h.maxR) hz.splice(i, 1) }
    else if (h.k === 'zone') { h.t += dt; if (h.t > h.life) hz.splice(i, 1) }
    else if (h.k === 'proj') { h.t += dt; if (h.t > h.life) hz.splice(i, 1) }
    else if (h.k === 'bolt') { h.t += dt; h.x += h.dx * h.spd * dt; h.z += h.dz * h.spd * dt; if (h.t > h.life || h._used) hz.splice(i, 1) }
    else if (h.k === 'hit') { h.t += dt; if (h.t > h.life) hz.splice(i, 1) }
  }
}
// damage this client's player takes from hazards. me: {x,z,y,gy}
function hazardDamage(hz, me) {
  let dmg = 0; const air = me.y > me.gy + 0.9
  for (const h of hz) {
    if (h.k === 'ring') { const pd = Math.hypot(me.x - h.x, me.z - h.z); if (!h._hit && h.r > 0 && Math.abs(pd - h.r) < 1.7 && !air) { h._hit = true; dmg += h.dmg } }
    else if (h.k === 'zone') { if (!h._hit && h.t >= h.delay && h.t < h.delay + 0.35 && Math.hypot(me.x - h.x, me.z - h.z) < h.r && !air) { h._hit = true; dmg += h.dmg } }
    else if (h.k === 'proj') { if (!h._hit && h.t >= h.dur && Math.hypot(me.x - h.x, me.z - h.z) < h.r) { h._hit = true; dmg += h.dmg } }
    else if (h.k === 'bolt') { if (!h._hit && Math.hypot(me.x - h.x, me.z - h.z) < h.r + 0.5 && Math.abs((me.y + 0.6) - h.y) < 2.4) { h._hit = true; h._used = true; dmg += h.dmg } }
    else if (h.k === 'hit') { if (!h._hit && Math.hypot(me.x - h.x, me.z - h.z) < h.r) { h._hit = true; dmg += h.dmg } }
  }
  return dmg
}

// ---------------------------------------------------------------- models (composite parts)
function bossParts(T, tm) {
  const D = BOSSES[T.key], pal = D.pal, out = [], sc = D.scale, breathe = Math.sin(tm * 1.6) * 0.12, crumble = T.dead || 0, ys = 1 - crumble * 0.9, y0 = T.y - crumble * 2
  const stunned = T.stun > 0, lava = stunned ? 0 : 1
  const base = (lx, ly, lz) => { const c = Math.cos(T.yaw), s = Math.sin(T.yaw); return [T.x + (c * lx + s * lz) * sc, y0 + ly * ys * sc, T.z + (-s * lx + c * lz) * sc] }
  const P = (mesh, lx, ly, lz, sx, sy, sz, rx = 0, rz = 0, tn = pal.tint, m = 2, p = [1, lava, 0, 0], e = [0, 0, 0, 0]) => { const w = base(lx, ly, lz); out.push({ mesh, model: M.trs(w[0], w[1], w[2], T.yaw, sx * sc, sy * ys * sc, sz * sc, rx, rz), mat: m, tint: tn, p, em: e }) }
  const coreC = stunned ? pal.stun : pal.core, glow = (stunned ? 6 : 3.2) + (T.flash || 0) * 3
  if (T.key === 'warden') { // living tree
    P('cyl', 0, 0, 0, 4.2, 9, 4.2, 0, 0, pal.tint, 2, [1, 0, 0, 0])
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; P('cone', Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, 1.5, 3.2, 1.5, 0, 0, pal.tint, 2, [1, 0, 0, 0]) }
    for (const [lx, ly, lz, s] of [[0, 11.5, 0, 6.2], [-3.6, 10.2, 1.2, 4.4], [3.8, 10.6, -1, 4.6], [0.6, 13.6, 1, 4.2], [-1, 9.6, -3.4, 3.8]]) P('sphere', lx, ly + breathe, lz, s, s * 0.8, s, 0, 0, pal.leaf, 4, [1, 0, 0, 0])
    P('box', 0, 7.6 + breathe, 2.1, 2.4, 0.5, 0.2, 0, 0, pal.lava, 3, [1, 1, 0, 0], [0, 0, 0, 4.5]); P('sphere', 0, 5.6 + breathe, 2.1, 1.3 + 0.15 * Math.sin(tm * 6), 1.3, 0.6, 0, 0, coreC, 3, [1, 0, 0, 0], [0, 0, 0, glow])
    for (const s of [-1, 1]) { const ang = -T.arm * (s === 1 ? 1.1 : 1.0) * 0.9; P('cyl', s * 3.8, 6.2, 0.4, 0.8, 6, 0.8, ang * 0.7 + 0.5, s * 0.9, pal.tint, 2, [1, 0, 0, 0]); P('sphere', s * 5.6, 4.2 + (T.arm * 1.0), 1.6 + T.arm * 1.6, 1.8, 1.8, 1.8, 0, 0, pal.leaf, 4, [1, 0, 0, 0]) }
  } else if (T.key === 'tide') { // crab golem
    P('sphere', 0, 3.4 + breathe, 0, 9, 4.4, 7, 0, 0, pal.tint); P('sphere', 0, 5.2 + breathe, 1.0, 5.6, 2.6, 4.4, 0, 0, pal.tint)
    for (const s of [-1, 1]) { const op = T.arm * 0.6; P('cyl', s * 3.2, 5.4, 3.4, 0.5, 2.4, 0.5, 0, 0, pal.tint); P('sphere', s * 3.2, 7.8 + breathe, 3.4, 1.0, 1.0, 1.0, 0, 0, [1, 1, 1], 3, [1, 0, 0, 0], [0, 0, 0, 1.4]); P('cube', s * 7.4, 3.2, 3.6 + T.arm * 2.2, 3.4, 2.4, 6.0, 0, s * 0.12, pal.tint); P('cube', s * 8.2 - s * op, 3.3, 8.4 + T.arm * 3.6, 1.6, 1.6, 3.6, 0, s * (0.35 + op), pal.tint) }
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) P('cyl', s * 5.4, 0.2, -1.6 + i * 2.2, 0.7, 3.2, 0.7, 0, s * 0.8, pal.tint)
    P('sphere', 0, 3.9 + breathe, 3.3, 3.0 + 0.3 * Math.sin(tm * 5), 2.2, 1.0, 0, 0, coreC, 3, [1, 0, 0, 0], [0, 0, 0, glow])
  } else if (T.key === 'king') { // floating robed king
    const hov = 1.0 + Math.sin(tm * 1.4) * 0.35
    P('cone', 0, hov, 0, 7.0, 10.5, 7.0, 0, 0, pal.tint, 4, [1, 0, 0, 0]); P('cube', 0, 11.6 + hov, 0.2, 2.8, 2.9, 2.8, 0, 0, [0.07, 0.065, 0.08], 4, [1, 0, 0, 0])
    P('box', 0, 11.8 + hov, 1.65, 2.0, 0.42, 0.2, 0, 0, pal.lava, 3, [1, 0, 0, 0], [0, 0, 0, 6.0])
    for (let i = 0; i < 5; i++) { const a = (i / 5 - 0.5) * 1.6; P('cone', Math.sin(a) * 1.5, 13.3 + hov + Math.cos(a) * 0.2, 0.2, 0.55, 1.6, 0.55, 0, -a, [0.9, 0.7, 0.2], 3, [1, 0, 0, 0], [0, 0, 0, 1.6]) }
    for (let i = 0; i < 4; i++) { const a = tm * 1.1 + (i / 4) * TAU; P('sphere', Math.cos(a) * 5.4, 6.0 + hov + Math.sin(tm * 2 + i) * 0.7, Math.sin(a) * 5.4, 1.1, 1.1, 1.1, 0, 0, pal.core, 3, [1, 0, 0, 0], [0, 0, 0, 4.0]) }
    for (const s of [-1, 1]) { const raise = T.arm * 0.9; P('cube', s * 4.2, 8.2 + hov + raise, 1.4 + raise, 1.5, 4.4, 1.5, 0.3, s * 0.4, pal.tint, 4, [1, 0, 0, 0]); P('sphere', s * 5.0, 5.8 + hov + raise * 1.5, 2.8 + raise * 1.4, 1.2, 1.2, 1.2, 0, 0, pal.core, 3, [1, 0, 0, 0], [0, 0, 0, 3.0]) }
  } else { // golem (titan, glacier)
    P('cube', -1.6, 2.4, 0, 2.6, 4.8, 2.6); P('cube', 1.6, 2.4, 0, 2.6, 4.8, 2.6); P('cube', 0, 7.4 + breathe, 0, 6.6, 5.4, 4.2); P('cube', 0, 11.2 + breathe, 0.4, 3.0, 2.6, 3.0)
    P('box', 0, 11.35 + breathe, 1.95, 2.0, 0.45, 0.2, 0, 0, pal.lava, 3, [1, 1, 0, 0], [0, 0, 0, 5.0]); P('sphere', 0, 7.6 + breathe, 2.15, 1.7 + 0.2 * Math.sin(tm * 6), 1.7, 0.7, 0, 0, coreC, 3, [1, 0, 0, 0], [0, 0, 0, glow])
    for (const s of [-1, 1]) { const raise = T.arm * (s === 1 ? 1 : 0.9), ang = -raise * 1.2; P('cube', s * 4.4, 8.6, 0, 2.2, 2.2, 2.2); P('cube', s * 4.9, 8.6 - Math.cos(ang) * 2.8, Math.sin(-ang) * 2.8 + 0.5, 2.0, 3.8, 2.0, ang * 0.5); P('cube', s * 4.9, 8.6 - Math.cos(ang) * 5.2, Math.sin(-ang) * 5.2 + 0.8, 3.1, 3.1, 3.1) }
    if (T.key === 'glacier') for (let i = 0; i < 5; i++) P('cone', -3 + i * 1.5, 10.2 + breathe, -1.4, 0.7, 2.6 - Math.abs(i - 2) * 0.4, 0.7, 0, (i - 2) * 0.12, [0.7, 0.85, 1.0], 3, [1, 0, 0, 0], [0, 0, 0, 0.7])
  }
  return out
}
// telegraphs and projectiles (additive / blended pass)
function bossFX(T, O, H, tm) {
  for (const h of T.hz) {
    if (h.k === 'ring' && h.r > 0) O.drawRing(M.trs(h.x, H(h.x, h.z) + 0.6, h.z, 0, h.r, 1, h.r), [1.0, 0.3, 0.12], 2.0, 0.85)
    else if (h.k === 'zone') { const pre = h.t < h.delay; if (pre) O.drawRing(M.trs(h.x, H(h.x, h.z) + 0.5, h.z, 0, h.r * (0.4 + 0.6 * h.t / h.delay), 1, h.r * (0.4 + 0.6 * h.t / h.delay)), [1.0, 0.18, 0.08], 1.4 + Math.sin(tm * 16), 0.6); else O.draw({ mesh: 'cyl', model: M.trs(h.x, H(h.x, h.z), h.z, 0, h.r * 0.9, 8 * (1 - (h.t - h.delay) / 0.7), h.r * 0.9), mat: 5, tint: [1.0, 0.45, 0.15], em: [0, 0, 0, 3.0], p: [1, 0, 0, 0] }) }
    else if (h.k === 'proj') { const k = clamp(h.t / h.dur, 0, 1); if (h.t >= 0) { const x = mix(h.x0, h.x, k), z = mix(h.z0, h.z, k), y = mix(h.y0, h.y, k) + Math.sin(k * Math.PI) * 9; O.draw({ mesh: 'sphere', model: M.trs(x, y, z, tm * 3, 1.7, 1.7, 1.7), mat: 3, tint: [1.0, 0.45, 0.12], em: [0, 0, 0, 3.0] }); O.drawRing(M.trs(h.x, h.y + 0.4, h.z, 0, 3.2, 1, 3.2), [1.0, 0.2, 0.1], 1.0 + k * 2, 0.5) } }
    else if (h.k === 'bolt') O.draw({ mesh: 'sphere', model: M.trs(h.x, h.y, h.z, tm * 5, h.r * 1.3, h.r * 1.3, h.r * 1.3), mat: 3, tint: BOSSES[T.key].pal.lava, em: [0, 0, 0, 4.0] })
  }
}
window.__RealmBoss = { BOSSES, newBoss, bossTick, stepHazards, hazardDamage, bossParts, bossFX, ATK }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, { M, clamp, mix } = C, I = window.__RealmItems
const TAU = Math.PI * 2, H = (x, z) => C.terrainH(x, z)
const TYPES = {
  slime: { name: 'Slime', hp: 40, dmg: 8, spd: 3.0, r: 0.85, aggro: 13, windup: 0.5, col: [0.05, 0.38, 0.1], glow: [0.5, 1, 0.5] },
  goblin: { name: 'Goblin', hp: 75, dmg: 12, spd: 4.3, r: 0.7, aggro: 16, windup: 0.45, col: [0.12, 0.26, 0.07], glow: [1, 0.3, 0.1] },
  wisp: { name: 'Wisp', hp: 50, dmg: 10, spd: 2.6, r: 0.6, aggro: 20, windup: 0.8, ranged: true, fly: true, col: [0.3, 0.6, 0.8], glow: [0.5, 0.9, 1] },
  brute: { name: 'Stone Brute', hp: 170, dmg: 20, spd: 3.0, r: 1.3, aggro: 14, windup: 0.75, col: [0.2, 0.18, 0.16], glow: [1, 0.4, 0.1] },
  frost: { name: 'Frostling', hp: 110, dmg: 15, spd: 4.0, r: 0.8, aggro: 16, windup: 0.5, col: [0.35, 0.5, 0.65], glow: [0.4, 0.8, 1] },
  shade: { name: 'Shade', hp: 140, dmg: 18, spd: 5.0, r: 0.8, aggro: 22, windup: 0.4, col: [0.05, 0.03, 0.09], glow: [0.7, 0.3, 1] },
}
const CAMP = 110
function createEnemies(ctx) {
  const E = { list: [], camps: new Map(), hz: [] }
  const hashC = (i, j, s) => C.ihash(i * 7 + s, j * 13 + s * 3)
  E.clear = () => { E.list = []; E.camps.clear(); E.hz = [] }
  E.spawn = (type, x, z, o = {}) => { const T = TYPES[type]; const e = { id: Math.random().toString(36).slice(2, 8), type, T, x, z, y: H(x, z), hx: x, hz: z, hp: Math.round(T.hp * (o.hpMul || 1)), max: Math.round(T.hp * (o.hpMul || 1)), st: 'idle', t: Math.random() * 3, yaw: Math.random() * TAU, flash: 0, vx: 0, vz: 0, dm: o.dmMul || 1, guard: !!o.guard, lvl: o.lvl || 1, hop: Math.random() * 6 }; E.list.push(e); return e }
  // camps are generated lazily around the player from a hash of the cell, so the whole map is full of them without storing anything
  E.stream = (px, pz, biome, avoid) => {
    const ci0 = Math.floor(px / CAMP), cj0 = Math.floor(pz / CAMP), now = performance.now()
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const ci = ci0 + i, cj = cj0 + j, key = ci + ',' + cj, c = E.camps.get(key)
      if (c) { if (c.cleared && now - c.cleared > 300000 && Math.hypot(px - c.x, pz - c.z) > 140) E.camps.delete(key); continue }
      const hv = hashC(ci, cj, 1); const x = (ci + 0.15 + 0.7 * hashC(ci, cj, 2)) * CAMP, z = (cj + 0.15 + 0.7 * hashC(ci, cj, 3)) * CAMP
      E.camps.set(key, { key, x, z, cleared: 0, ids: [] })
      if (hv > 0.42) continue; const h = H(x, z); if (avoid && avoid(x, z, h)) continue
      const types = biome(x, z, h), n = 2 + ((hashC(ci, cj, 4) * 3) | 0), lvl = clamp(1 + Math.floor(Math.hypot(x, z) / 260), 1, 5)
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU, r = 3 + hashC(ci, cj, 5 + k) * 4, ex = x + Math.cos(a) * r, ez = z + Math.sin(a) * r; if (H(ex, ez) < C.WORLD.water + 0.8) continue; const e = E.spawn(types[(hashC(ci, cj, 9 + k) * types.length) | 0], ex, ez, { hpMul: 1 + 0.18 * (lvl - 1), dmMul: 1 + 0.12 * (lvl - 1), lvl }); e.camp = key; E.camps.get(key).ids.push(e.id) }
    }
    E.list = E.list.filter((e) => e.guard || Math.hypot(e.x - px, e.z - pz) < 280)
  }
  E.update = (dt, P, hurt, nearEnemyFn) => { // P: {x,z,y,alive}
    const alive = P.alive !== false
    for (const e of E.list) {
      const T = e.T, dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz); e.flash = Math.max(0, e.flash - dt * 4); e.t += dt
      if (d > 90 && !e.guard) continue
      if (e.st === 'dead') continue
      if (e.kb) { e.x += e.kb[0] * dt; e.z += e.kb[1] * dt; e.kb[0] *= 0.88; e.kb[1] *= 0.88; if (Math.hypot(e.kb[0], e.kb[1]) < 0.3) e.kb = null }
      if (e.st === 'idle') { if (e.t > 2.2) { e.t = 0; e.wx = e.hx + (Math.random() - 0.5) * 8; e.wz = e.hz + (Math.random() - 0.5) * 8 } if (e.wx != null) { const wx = e.wx - e.x, wz = e.wz - e.z, wd = Math.hypot(wx, wz); if (wd > 0.6) { e.x += wx / wd * T.spd * 0.35 * dt; e.z += wz / wd * T.spd * 0.35 * dt; e.yaw = Math.atan2(wx, wz) } } if (alive && d < T.aggro) { e.st = 'chase'; e.t = 0 } }
      else if (e.st === 'chase') {
        if (!alive || d > T.aggro * 2.2) { e.st = 'idle'; continue }
        const want = T.ranged ? 9 : T.r + 1.2; e.yaw = Math.atan2(dx, dz)
        if (d > want + 0.3) { const sp = T.spd * (1 + 0.05 * e.lvl); e.x += dx / d * sp * dt; e.z += dz / d * sp * dt } else if (T.ranged && d < want - 3) { e.x -= dx / d * T.spd * dt; e.z -= dz / d * T.spd * dt }
        if (d < (T.ranged ? 16 : T.r + 1.5) && e.t > 0.5) { e.st = 'wind'; e.t = 0 }
      } else if (e.st === 'wind') { e.yaw = Math.atan2(dx, dz); if (e.t >= T.windup) { if (T.ranged) E.hz.push({ id: Math.random(), k: 'bolt', x: e.x, z: e.z, y: e.y + 1.4, dx: dx / d, dz: dz / d, spd: 10, r: 0.7, t: 0, life: 3, dmg: Math.round(T.dmg * e.dm) }); else if (d < T.r + 2.0) hurt(Math.round(T.dmg * e.dm)); e.st = 'recover'; e.t = 0 } }
      else if (e.st === 'recover') { if (e.t > 0.8) { e.st = 'chase'; e.t = 0 } }
      // keep apart
      for (const o of E.list) if (o !== e && o.st !== 'dead') { const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), mr = T.r + o.T.r; if (od > 0.01 && od < mr) { e.x += ox / od * (mr - od) * 0.5; e.z += oz / od * (mr - od) * 0.5 } }
      const g = H(e.x, e.z); if (g < C.WORLD.water - 0.6 && C.getMode() === 1) { e.x -= dx / (d || 1) * 0.0; } e.y = T.fly ? g + 1.6 + Math.sin(e.t * 2 + e.hop) * 0.3 : g
    }
    for (let i = E.hz.length - 1; i >= 0; i--) { const h = E.hz[i]; h.t += dt; h.x += h.dx * h.spd * dt; h.z += h.dz * h.spd * dt; if (h.t > h.life || h._used) E.hz.splice(i, 1) }
  }
  // returns enemies hit; weapon: {reach}
  E.strike = (P, face, W, dmg, crit) => {
    const fx = Math.sin(face), fz = Math.cos(face), hits = []
    for (const e of E.list) { if (e.st === 'dead') continue; const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz); if (d < W.reach + e.T.r + 0.4 && (dx * fx + dz * fz) / (d || 1) > 0.15) { const dm = Math.round(dmg * (crit ? 2 : 1)); e.hp -= dm; e.flash = 1; e.kb = [dx / (d || 1) * 7, dz / (d || 1) * 7]; if (e.st === 'idle') e.st = 'chase'; hits.push({ e, dm, killed: e.hp <= 0 }); if (e.hp <= 0) { e.st = 'dead'; if (e.camp) { const c = E.camps.get(e.camp); if (c && c.ids.every((id) => !E.list.find((q) => q.id === id && q.st !== 'dead'))) c.cleared = performance.now() } } } }
    E.list = E.list.filter((e) => e.st !== 'dead' || e.dying === undefined ? e.st !== 'dead' : false); return hits
  }
  E.draw = (O, tm, shadow) => {
    for (const e of E.list) {
      const T = e.T, c = e.flash > 0 ? [1, 0.9, 0.8] : T.col, wob = e.st === 'wind' ? 1 + 0.25 * Math.sin(e.t * 30) : 1, mdl = (lx, ly, lz, sx, sy, sz, rx = 0, rz = 0) => { const cs = Math.cos(e.yaw), sn = Math.sin(e.yaw); return M.trs(e.x + cs * lx + sn * lz, e.y + ly, e.z - sn * lx + cs * lz, e.yaw, sx, sy, sz, rx, rz) }
      const lunge = e.st === 'wind' ? -0.2 : e.st === 'recover' ? 0.4 : 0
      if (e.type === 'slime') { const hop = Math.abs(Math.sin(tm * 5 + e.hop)), sq = e.st === 'idle' ? 1 + 0.06 * Math.sin(tm * 2 + e.hop) : 0.8 + 0.4 * hop; O.draw({ mesh: 'sphere', model: mdl(0, 0.45 * sq + hop * 0.5, 0, 1.7 * wob / Math.sqrt(sq), 1.0 * sq, 1.7 * wob / Math.sqrt(sq)), mat: 4, tint: c }, shadow); if (!shadow) { O.draw({ mesh: 'sphere', model: mdl(-0.28, 0.6 * sq + hop * 0.5, 0.7, 0.2, 0.26, 0.2), mat: 3, tint: [1, 1, 1], em: [0, 0, 0, 1.2] }); O.draw({ mesh: 'sphere', model: mdl(0.28, 0.6 * sq + hop * 0.5, 0.7, 0.2, 0.26, 0.2), mat: 3, tint: [1, 1, 1], em: [0, 0, 0, 1.2] }) } }
      else if (e.type === 'wisp') { O.draw({ mesh: 'sphere', model: mdl(0, 0, 0, 0.9 * wob, 0.9 * wob, 0.9 * wob), mat: 3, tint: c, em: [0, 0, 0, 3.2] }, shadow) }
      else if (e.type === 'brute') { O.draw({ mesh: 'cube', model: mdl(0, 1.2, 0, 1.9, 2.0, 1.5, lunge), mat: 2, tint: c, p: [0.6, 0.6, 0, 0] }, shadow); O.draw({ mesh: 'cube', model: mdl(0, 2.55, 0.15, 1.0, 0.9, 0.9), mat: 2, tint: c, p: [0.6, 0.6, 0, 0] }, shadow); for (const s of [-1, 1]) O.draw({ mesh: 'cube', model: mdl(s * 1.25, 1.3 + (e.st === 'wind' ? 0.8 : 0), 0.3, 0.7, 1.7, 0.7), mat: 2, tint: c, p: [0.6, 0.4, 0, 0] }, shadow); if (!shadow) O.draw({ mesh: 'box', model: mdl(0, 2.6, 0.62, 0.7, 0.14, 0.1), mat: 3, tint: T.glow, em: [0, 0, 0, 4] }) }
      else { // goblin / frostling / shade: small hunched figure with a club
        O.draw({ mesh: 'cube', model: mdl(0, 0.65, 0, 0.85, 0.95, 0.7, lunge), mat: 4, tint: c }, shadow); O.draw({ mesh: 'cube', model: mdl(0, 1.38, 0.1, 0.7, 0.6, 0.6), mat: 4, tint: c }, shadow)
        O.draw({ mesh: 'cyl', model: mdl(0.55, 0.3, 0.2, 0.18, 1.1, 0.18, e.st === 'wind' ? -1.1 : -0.3 - 0.4 * Math.sin(tm * 3 + e.hop)), mat: 4, tint: [0.14, 0.08, 0.04] }, shadow)
        if (!shadow) { for (const s of [-1, 1]) O.draw({ mesh: 'sphere', model: mdl(s * 0.18, 1.45, 0.42, 0.13, 0.13, 0.13), mat: 3, tint: T.glow, em: [0, 0, 0, 4] }) }
      }
    }
  }
  E.drawFX = (O, tm) => { for (const h of E.hz) O.draw({ mesh: 'sphere', model: M.trs(h.x, h.y, h.z, tm * 4, 0.9, 0.9, 0.9), mat: 3, tint: [0.5, 0.9, 1.0], em: [0, 0, 0, 3.5] }) }
  return E
}

function createChests(ctx) {
  const Ch = { list: new Map(), opened: new Set(ctx.opened || []) }
  const SZ = 120
  Ch.clear = () => Ch.list.clear()
  Ch.stream = (px, pz, avoid) => {
    const ci0 = Math.floor(px / SZ), cj0 = Math.floor(pz / SZ)
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const ci = ci0 + i, cj = cj0 + j, key = ci + ',' + cj; if (Ch.list.has(key)) continue
      Ch.list.set(key, null)
      if (C.ihash(ci * 3 + 1, cj * 5 + 2) > 0.34) continue
      const x = (ci + 0.1 + 0.8 * C.ihash(ci + 7, cj + 3)) * SZ, z = (cj + 0.1 + 0.8 * C.ihash(ci + 9, cj + 5)) * SZ, h = H(x, z), n = C.terrainN(x, z, 1)
      if (h < C.WORLD.water + 1.2 || n[1] < 0.88 || (avoid && avoid(x, z, h))) continue
      const r = Math.hypot(x, z), q = C.ihash(ci + 11, cj + 13), tier = r < 220 ? (q < 0.8 ? 'wood' : 'iron') : r < 600 ? (q < 0.4 ? 'wood' : q < 0.85 ? 'iron' : 'gold') : (q < 0.2 ? 'wood' : q < 0.65 ? 'iron' : 'gold')
      Ch.list.set(key, { key, x, z, y: h, tier, open: Ch.opened.has(key) ? 1 : 0, yaw: C.ihash(ci + 4, cj + 6) * TAU, lvl: clamp(1 + Math.floor(r / 250), 1, 5) })
    }
  }
  Ch.nearest = (px, pz, maxD = 2.8) => { let b = null, bd = maxD; for (const c of Ch.list.values()) { if (!c || c.open >= 1) continue; const d = Math.hypot(c.x - px, c.z - pz); if (d < bd) { bd = d; b = c } } return b }
  Ch.open = (c) => { if (!c || c.opening || c.open >= 1) return null; c.opening = true; Ch.opened.add(c.key); return I.rollLoot(c.tier, c.lvl) }
  Ch.update = (dt) => { for (const c of Ch.list.values()) if (c && c.opening && c.open < 1) { c.open = Math.min(1, c.open + dt * 1.6); if (c.open >= 1) c.opening = false } }
  Ch.draw = (O, tm, shadow) => {
    const col = { wood: [[0.17, 0.095, 0.045], [0.10, 0.08, 0.06]], iron: [[0.12, 0.13, 0.16], [0.30, 0.32, 0.36]], gold: [[0.5, 0.33, 0.07], [0.9, 0.7, 0.2]] }
    for (const c of Ch.list.values()) {
      if (!c) continue; const [body, trim] = col[c.tier], a = c.open * 1.7, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), at = (lx, ly, lz) => [c.x + cs * lx + sn * lz, c.y + ly, c.z - sn * lx + cs * lz]
      let p = at(0, 0.32, 0); O.draw({ mesh: 'box', model: M.trs(p[0], p[1], p[2], c.yaw, 1.15, 0.64, 0.78), mat: 4, tint: body }, shadow)
      p = at(0, 0.64, 0); O.draw({ mesh: 'box', model: M.trs(p[0], p[1], p[2], c.yaw, 1.19, 0.08, 0.82), mat: 4, tint: trim }, shadow)
      const pv = at(0, 0.66, -0.39), lidY = pv[1] + 0.2 * Math.cos(a) + 0.39 * Math.sin(a), back = -0.2 * Math.sin(a) + 0.39 * Math.cos(a) - 0.39 // offset from the pivot along the chest's forward axis
      const lp = at(0, 0, -0.39 + 0.39 + back + 0.0); O.draw({ mesh: 'box', model: M.trs(lp[0], lidY, lp[2], c.yaw, 1.15, 0.4, 0.78, -a), mat: 4, tint: body }, shadow)
      p = at(0, 0.5, 0.4); if (!shadow) O.draw({ mesh: 'box', model: M.trs(p[0], p[1], p[2], c.yaw, 0.16, 0.18, 0.06), mat: 3, tint: trim, em: [0, 0, 0, c.tier === 'gold' ? 2.2 : 0.6] })
    }
  }
  Ch.drawFX = (O, tm) => { for (const c of Ch.list.values()) if (c && c.open < 1 && c.tier !== 'wood') O.draw({ mesh: 'cyl', model: M.trs(c.x, c.y, c.z, 0, 0.9, c.tier === 'gold' ? 18 : 8, 0.9), mat: 5, tint: c.tier === 'gold' ? [1.0, 0.75, 0.25] : [0.6, 0.75, 1.0], em: [0, 0, 0, 1.5], p: [c.tier === 'gold' ? 0.9 : 0.5, 0, 0, 0] }) }
  return Ch
}
window.__RealmWorld = { createEnemies, createChests, TYPES }
})()
;
(function () {
'use strict'
// ---------------------------------------------------------------- in-memory network (tests, and a fallback for solo "party" practice)
function createMemNet(bus, uid, name, av) {
  bus.parties = bus.parties || {}
  const L = { members: [], pos: [], chat: [], state: [], ev: {} }, self = { uid, name, av, ready: false }
  let code = null, host = false
  const P = () => bus.parties[code]
  const net = {
    uid, name, get code() { return code }, isHost: () => host,
    async create() { code = String(1000 + Math.floor(Math.random() * 9000)); bus.parties[code] = { members: {}, subs: [] }; host = true; await net.join(code, true); return code },
    async join(c, asHost) { if (!bus.parties[c]) throw new Error('No party with that code.'); code = String(c); const p = P(); if (Object.keys(p.members).length >= 4) throw new Error('That party is full.'); p.members[uid] = { ...self, host: !!asHost }; p.subs.push(net); host = !!asHost; p.subs.forEach((n) => n._members()); return true },
    leave() { if (!code) return; const p = P(); if (p) { delete p.members[uid]; p.subs = p.subs.filter((n) => n !== net); const ids = Object.keys(p.members); if (host && ids.length) { p.members[ids[0]].host = true; p.subs.find((n) => n.uid === ids[0])._setHost() } p.subs.forEach((n) => n._members()) } code = null; host = false },
    members: () => (code && P() ? Object.values(P().members) : []), onMembers: (f) => L.members.push(f),
    setReady(b) { self.ready = b; if (code && P() && P().members[uid]) { P().members[uid].ready = b; P().subs.forEach((n) => n._members()) } },
    send(type, data) { if (code && P()) P().subs.forEach((n) => n !== net && (n._ev[type] || []).forEach((f) => f(data, uid))) }, on(type, f) { (L.ev[type] = L.ev[type] || []).push(f) },
    pos(d) { if (code && P()) P().subs.forEach((n) => n !== net && n._pos.forEach((f) => f(uid, d))) }, onPos: (f) => L.pos.push(f),
    state(d) { if (code && P()) P().subs.forEach((n) => n !== net && n._state.forEach((f) => f(d))) }, onState: (f) => L.state.push(f),
    chat(text) { const m = { uid, name, text: String(text).slice(0, 140), ts: Date.now() }; if (code && P()) P().subs.forEach((n) => n._chat.forEach((f) => f(m))) }, onChat: (f) => L.chat.push(f),
    _members() { L.members.forEach((f) => f(net.members())) }, _setHost() { host = true }, _ev: L.ev, _pos: L.pos, _chat: L.chat, _state: L.state,
  }
  return net
}

const CSS = `
.rm-party{position:absolute;left:12px;top:64px;width:min(340px,92vw);max-height:80vh;overflow:auto;background:rgba(18,9,2,.93);border:2px solid #7fb2ff;border-radius:14px;padding:12px;display:none;pointer-events:auto;font-family:system-ui,sans-serif;color:#fff;font-size:14px}
.rm-party h3{margin:0 0 8px;font:400 18px 'Titan One',system-ui}.rm-party .row{display:flex;gap:6px;margin:6px 0;align-items:center}
.rm-party input,.rm-party select{flex:1;min-width:0;padding:7px 9px;border-radius:8px;border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font:inherit}.rm-party select option{color:#000}
.rm-party button{padding:7px 12px;border-radius:9px;background:#3b82f6;color:#fff;font:700 13px system-ui}.rm-party button.alt{background:rgba(255,255,255,.18)}.rm-party button.go{background:#ff8a1f}.rm-party button:disabled{opacity:.45}
.rm-mem{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.07);margin:4px 0}.rm-mem i{margin-left:auto;font-style:normal;font-size:12px;opacity:.85}
.rm-chat{height:150px;overflow:auto;background:rgba(0,0,0,.35);border-radius:8px;padding:6px 8px;font-size:13px;line-height:1.35;margin-top:6px}.rm-chat b{color:#9cc4ff}.rm-chat .me b{color:#ffb25a}.rm-chat .sys{opacity:.7;font-style:italic}
.rm-mini{position:absolute;left:12px;bottom:78px;width:min(340px,70vw);pointer-events:none;font:13px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;display:none}.rm-mini div{margin-top:2px}.rm-mini b{color:#9cc4ff}.rm-mini input{pointer-events:auto;width:100%;margin-top:4px;padding:6px 9px;border-radius:8px;border:2px solid #7fb2ff;background:rgba(18,9,2,.85);color:#fff;font:inherit;display:none}
.rm-wave{position:absolute;left:50%;top:104px;transform:translateX(-50%);font:400 14px 'Titan One',system-ui;letter-spacing:.14em;text-shadow:0 1px 3px #000;display:none}`
function createParty(ui, net, hooks) {
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css)
  const panel = document.createElement('div'); panel.className = 'rm-party'; ui.root.appendChild(panel)
  const mini = document.createElement('div'); mini.className = 'rm-mini'; ui.root.appendChild(mini)
  const miniIn = document.createElement('input'); miniIn.maxLength = 140; miniIn.placeholder = 'Message the party, Enter to send'; mini.appendChild(miniIn)
  const wave = document.createElement('div'); wave.className = 'rm-wave'; ui.root.appendChild(wave)
  const log = []; let open = false, ready = false, lastSend = 0, miniT = 0
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const line = (m) => { log.push(m); if (log.length > 60) log.shift(); render(); showMini() }
  const showMini = () => { if (!hooks.inRaid()) { mini.style.display = 'none'; return } mini.style.display = 'block'; const rows = mini.querySelectorAll('div'); rows.forEach((r) => r.remove()); log.slice(-5).forEach((m) => { const d = document.createElement('div'); d.innerHTML = m.sys ? `<i>${esc(m.text)}</i>` : `<b>${esc(m.name)}</b> ${esc(m.text)}`; mini.insertBefore(d, miniIn) }); clearTimeout(miniT); miniT = setTimeout(() => { if (document.activeElement !== miniIn) mini.querySelectorAll('div').forEach((r) => (r.style.opacity = 0.0)) }, 7000); mini.querySelectorAll('div').forEach((r) => (r.style.opacity = 1)) }
  function render() {
    if (!open) return
    const mem = net ? net.members() : [], inParty = !!(net && net.code), host = net && net.isHost()
    const ch = hooks.chapters()
    let h = `<h3>Raid Party</h3>`
    if (!net) h += `<p style="opacity:.8">Party chat is unavailable right now (the Realtime Database could not be reached). You can still run a solo raid.</p>`
    else if (!inParty) h += `<div class="row"><button data-a="create" class="go">Create party</button></div><div class="row"><input id="rm-code" placeholder="Party code" inputmode="numeric" maxlength="6"><button data-a="join">Join</button></div>`
    else h += `<div style="margin-bottom:4px">Party code <b style="font-size:20px;letter-spacing:.2em">${esc(net.code)}</b> <small style="opacity:.7">(share it, up to 4 players)</small></div>` + mem.map((m) => `<div class="rm-mem"><span>${esc(m.name)}</span>${m.host ? '<i>HOST</i>' : `<i>${m.ready ? 'Ready' : 'Not ready'}</i>`}</div>`).join('') + `<div class="row">${host ? '' : `<button data-a="ready" class="alt">${ready ? 'Unready' : 'Ready up'}</button>`}<button data-a="leave" class="alt">Leave</button></div>`
    h += `<div class="row"><select id="rm-mode"><option value="rush">Boss Rush (all bosses, no checkpoints)</option>${ch.map((c) => `<option value="boss:${c.key}">${esc(c.name)} only</option>`).join('')}</select></div>`
    h += `<div class="row"><button data-a="start" class="go" ${net && inParty && !host ? 'disabled' : ''}>${net && inParty ? (host ? 'Start raid' : 'Waiting for host') : 'Start solo raid'}</button></div>`
    if (net && inParty) h += `<div class="rm-chat" id="rm-log">${log.map((m) => (m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div class="${m.uid === net.uid ? 'me' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`)).join('')}</div><div class="row"><input id="rm-msg" maxlength="140" placeholder="Type a message"><button data-a="send">Send</button></div>`
    const keepMode = (panel.querySelector('#rm-mode') || {}).value, keepMsg = (panel.querySelector('#rm-msg') || {}).value, keepCode = (panel.querySelector('#rm-code') || {}).value
    panel.innerHTML = h; const mode = panel.querySelector('#rm-mode'); if (mode && keepMode) mode.value = keepMode; const mg = panel.querySelector('#rm-msg'); if (mg && keepMsg) mg.value = keepMsg; const cd = panel.querySelector('#rm-code'); if (cd && keepCode) cd.value = keepCode
    const lg = panel.querySelector('#rm-log'); if (lg) lg.scrollTop = lg.scrollHeight
    const send = () => { const m = panel.querySelector('#rm-msg'); if (!m || !m.value.trim()) return; doChat(m.value); m.value = '' }
    if (mg) mg.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send() }
    panel.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => { const a = b.dataset.a
      try {
        if (a === 'create') { await net.create(); line({ sys: 1, text: 'Party created. Share the code.' }) }
        else if (a === 'join') { await net.join((panel.querySelector('#rm-code').value || '').trim()); line({ sys: 1, text: 'You joined the party.' }) }
        else if (a === 'leave') { net.leave(); ready = false; line({ sys: 1, text: 'You left the party.' }) }
        else if (a === 'ready') { ready = !ready; net.setReady(ready) }
        else if (a === 'send') send()
        else if (a === 'start') hooks.start((panel.querySelector('#rm-mode') || {}).value || 'rush')
      } catch (e) { ui.toast(e.message || 'Could not do that') }
      render() }))
  }
  const doChat = (text) => { const now = Date.now(); if (now - lastSend < 600 || !net || !net.code) return; lastSend = now; net.chat(text); line({ uid: net.uid, name: net.name, text: String(text).slice(0, 140) }) }
  miniIn.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { if (miniIn.value.trim()) doChat(miniIn.value); miniIn.value = ''; miniIn.style.display = 'none'; miniIn.blur() } else if (e.key === 'Escape') { miniIn.value = ''; miniIn.style.display = 'none'; miniIn.blur() } }
  const keyOpen = (e) => { if (e.key === 'Enter' && hooks.inRaid() && net && net.code && document.activeElement !== miniIn && !/INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) { miniIn.style.display = 'block'; mini.querySelectorAll('div').forEach((r) => (r.style.opacity = 1)); miniIn.focus(); e.preventDefault() } }
  addEventListener('keydown', keyOpen)
  if (net) { net.onChat((m) => line(m)); net.onMembers((m) => { render(); if (hooks.members) hooks.members(m) }) }
  return {
    toggle(v) { open = v == null ? !open : v; panel.style.display = open ? 'block' : 'none'; if (open) render() }, isOpen: () => open, render, line, showMini,
    setWave(t) { wave.style.display = t ? 'block' : 'none'; wave.textContent = t || '' }, chatFocus: () => document.activeElement === miniIn,
    destroy() { removeEventListener('keydown', keyOpen); panel.remove(); mini.remove(); wave.remove(); css.remove() },
  }
}
window.__RealmParty = { createParty, createMemNet }
})()
;
(function () {
'use strict'
const CSS = `
.rm-root{position:relative;width:100%;height:100%;overflow:hidden;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;font-family:'Titan One',system-ui,sans-serif;color:#fff}
.rm-root canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.rm-ui{position:absolute;inset:0;pointer-events:none}
.rm-ui button,.rm-ui .rm-hit{pointer-events:auto}
.rm-top{position:absolute;left:10px;right:10px;top:max(env(safe-area-inset-top),10px);display:flex;gap:10px;align-items:flex-start}
.rm-hp{width:min(260px,38vw)}
.rm-bar{height:14px;border-radius:7px;background:rgba(0,0,0,.5);border:2px solid rgba(255,255,255,.55);overflow:hidden}
.rm-bar i{display:block;height:100%;width:100%;background:linear-gradient(#ff9a3c,#ff6a00);transition:width .2s}
.rm-lbl{font-size:12px;opacity:.9;margin-bottom:3px;text-shadow:0 1px 2px #000}
.rm-obj{flex:1;text-align:center;text-shadow:0 1px 3px #000}
.rm-obj b{display:block;font-size:12px;letter-spacing:.12em;opacity:.8;font-weight:400}
.rm-obj span{font-size:clamp(14px,2.2vw,20px)}
.rm-obj small{display:block;font-size:12px;opacity:.85;margin-top:2px}
.rm-btns{display:flex;gap:8px}
.rm-btn{padding:8px 14px;border-radius:10px;background:rgba(20,10,0,.55);border:2px solid rgba(255,255,255,.5);color:#fff;font:inherit;font-size:14px}
.rm-boss{position:absolute;left:50%;top:70px;transform:translateX(-50%);width:min(560px,80vw);text-align:center;display:none;text-shadow:0 1px 3px #000}
.rm-boss .rm-bar{height:18px;border-color:#ffd9a0}.rm-boss .rm-bar i{background:linear-gradient(#ff5a3c,#c01500)}
.rm-dlg{position:absolute;left:50%;bottom:max(env(safe-area-inset-bottom),22px);transform:translateX(-50%);width:min(720px,92vw);padding:14px 18px;border-radius:14px;background:rgba(18,9,2,.82);border:2px solid #ffb25a;display:none;font-family:system-ui,sans-serif}
.rm-dlg b{display:block;font-family:'Titan One',system-ui,sans-serif;color:#ffb25a;font-size:15px;margin-bottom:4px;font-weight:400}
.rm-dlg p{margin:0;font-size:clamp(15px,2vw,19px);line-height:1.4;min-height:2.8em}
.rm-dlg small{display:block;text-align:right;opacity:.6;font-size:12px;margin-top:4px}
.rm-prompt{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(18,9,2,.7);border:2px solid rgba(255,255,255,.6);font-size:15px;display:none;text-align:center}
.rm-title{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;text-shadow:0 3px 12px #000;text-align:center}
.rm-title h1{margin:0;font-weight:400;font-size:clamp(34px,8vw,92px);letter-spacing:.06em;color:#ffe2b8}
.rm-title p{margin:6px 0 0;font-family:system-ui,sans-serif;letter-spacing:.3em;font-size:clamp(11px,1.6vw,16px);opacity:.85}
.rm-tag{position:absolute;transform:translate(-50%,-100%);padding:3px 10px;border-radius:999px;background:rgba(18,9,2,.62);border:1.5px solid rgba(255,255,255,.55);font-size:13px;white-space:nowrap;text-align:center;display:none}
.rm-tag small{display:block;font-family:system-ui,sans-serif;font-size:11px;opacity:.8}
.rm-mark{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;display:none}
.rm-mark svg{width:100%;height:100%;filter:drop-shadow(0 1px 2px #000)}
.rm-mark span{position:absolute;left:50%;top:100%;transform:translateX(-50%);font-size:11px;font-family:system-ui,sans-serif;text-shadow:0 1px 2px #000;white-space:nowrap}
.rm-stick{position:absolute;left:max(env(safe-area-inset-left),22px);bottom:max(env(safe-area-inset-bottom),26px);width:128px;height:128px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.4);display:none;pointer-events:auto;touch-action:none}
.rm-stick i{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px;border-radius:50%;background:rgba(255,200,140,.55);border:2px solid rgba(255,255,255,.8)}
.rm-act{position:absolute;right:max(env(safe-area-inset-right),20px);bottom:max(env(safe-area-inset-bottom),26px);display:none;gap:12px;align-items:flex-end;pointer-events:none}
.rm-act button{width:72px;height:72px;border-radius:50%;background:rgba(255,140,40,.55);border:3px solid rgba(255,255,255,.8);color:#fff;font:inherit;font-size:13px;pointer-events:auto;touch-action:none}
.rm-act button.sm{width:56px;height:56px;background:rgba(255,255,255,.18)}
.rm-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%);padding:8px 18px;border-radius:999px;background:rgba(18,9,2,.78);border:2px solid #ffb25a;font-size:16px;opacity:0;transition:opacity .3s;white-space:nowrap}
.rm-skip{position:absolute;right:14px;bottom:18px;display:none}
.rm-help{position:absolute;left:12px;bottom:12px;font-family:system-ui,sans-serif;font-size:12px;opacity:.7;text-shadow:0 1px 2px #000}
.rm-hpb{display:block;width:46px;height:5px;margin:3px auto 0;background:#400;border-radius:3px;overflow:hidden}.rm-hpb i{display:block;height:100%;background:#ff5a4a}
.rm-ch{position:absolute;left:50%;top:70px;transform:translateX(-50%);width:min(440px,94vw);background:rgba(18,9,2,.94);border:2px solid #ffb25a;border-radius:14px;padding:12px;display:none;pointer-events:auto;font-family:system-ui,sans-serif}.rm-ch h3{margin:0 0 8px;font:400 18px 'Titan One',system-ui}.rm-ch .it{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.07);margin:5px 0}.rm-ch .it b{flex:1;font-weight:700}.rm-ch .it small{opacity:.7;display:block;font-weight:400}.rm-ch button{padding:6px 12px;border-radius:8px;background:#ff8a1f;color:#fff;font:700 12px system-ui}.rm-ch button:disabled{opacity:.4;background:#555}
.rm-err{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;background:#1a0d02;font-family:system-ui,sans-serif}
`
function injectCSS() { if (document.getElementById('rm-css')) return; const s = document.createElement('style'); s.id = 'rm-css'; s.textContent = CSS; document.head.appendChild(s) }
const el = (tag, cls, html, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e }

function createUI(root, opts) {
  injectCSS()
  const ui = el('div', 'rm-ui', '', root), coarse = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window
  const top = el('div', 'rm-top', '', ui)
  const hpW = el('div', 'rm-hp', '<div class="rm-lbl">HEALTH</div><div class="rm-bar"><i></i></div>', top), hp = hpW.querySelector('i')
  const objW = el('div', 'rm-obj', '<b>OBJECTIVE</b><span></span><small></small>', top), objT = objW.querySelector('span'), objS = objW.querySelector('small')
  const btns = el('div', 'rm-btns', '', top), bPack = el('button', 'rm-btn', 'Pack (B)', btns), bChap = el('button', 'rm-btn', 'Chapters (C)', btns), bParty = el('button', 'rm-btn', 'Party', btns), bHub = el('button', 'rm-btn', 'Hub', btns), bExit = el('button', 'rm-btn', 'Exit', btns); bChap.style.display = bParty.style.display = 'none'
  const boss = el('div', 'rm-boss', '<div class="rm-lbl" style="font-size:16px;letter-spacing:.2em">BOSS</div><div class="rm-bar"><i></i></div>', ui), bossBar = boss.querySelector('i'), bossName = boss.querySelector('.rm-lbl'), waveEl = el('div', 'rm-wave', '', ui), chPanel = el('div', 'rm-ch', '', ui)
  const dlg = el('div', 'rm-dlg', '<b></b><p></p><small>E / tap to continue</small>', ui), dWho = dlg.querySelector('b'), dTxt = dlg.querySelector('p')
  const prompt = el('div', 'rm-prompt', '', ui), title = el('div', 'rm-title', '<h1></h1><p></p>', ui), toast = el('div', 'rm-toast', '', ui)
  const skip = el('button', 'rm-btn rm-skip', 'Skip', ui)
  const help = el('div', 'rm-help', coarse ? '' : 'WASD move | Shift run | Space jump | J / click attack | E talk | drag to look', ui)
  const stick = el('div', 'rm-stick', '<i></i>', ui), knob = stick.querySelector('i')
  const act = el('div', 'rm-act', '', ui), bUse = el('button', 'sm', 'Use', act), bAtk = el('button', '', 'Attack', act), bJump = el('button', '', 'Jump', act)
  const tags = {}, marks = {}
  const tag = (id) => tags[id] || (tags[id] = el('div', 'rm-tag', '', ui)), mark = (id, color) => marks[id] || (marks[id] = el('div', 'rm-mark', `<svg viewBox="0 0 24 24"><path d="M12 2l8 14H4z" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg><span></span>`, ui))
  const state = { x: 0, y: 0, run: false, jump: false, attack: false, use: false, yawD: 0, pitchD: 0, skip: false, hub: false, exit: false, any: 0 }
  // keyboard
  const keys = new Set(), kd = (e) => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; keys.add(e.code); state.any++; if (e.code === 'Space') { state.jump = true; e.preventDefault() } if (e.code === 'KeyJ' || e.code === 'KeyF') state.attack = true; if (e.code === 'KeyE' || e.code === 'Enter') state.use = true; if (e.code === 'Escape') state.skip = true; if (/Arrow/.test(e.code)) e.preventDefault() }
  const ku = (e) => keys.delete(e.code)
  addEventListener('keydown', kd); addEventListener('keyup', ku)
  // touch stick
  let sid = null, sc = [0, 0]
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(e.pointerId); const r = stick.getBoundingClientRect(); sc = [r.left + r.width / 2, r.top + r.height / 2]; mv(e) }); const mv = (e) => { if (e.pointerId !== sid) return; let dx = (e.clientX - sc[0]) / 52, dy = (e.clientY - sc[1]) / 52; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l } stick._v = [dx, dy]; knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`; state.any++ }
  stick.addEventListener('pointermove', mv); const up = (e) => { if (e.pointerId !== sid) return; sid = null; stick._v = null; knob.style.transform = '' }; stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up)
  const press = (b, f) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); f(); state.any++ })
  press(bJump, () => (state.jump = true)); press(bAtk, () => (state.attack = true)); press(bUse, () => (state.use = true)); skip.onclick = () => (state.skip = true); bHub.onclick = () => (state.hub = true); bExit.onclick = () => (state.exit = true); bPack.onclick = () => (state.pack = true); bChap.onclick = () => (state.chapters = true); bParty.onclick = () => api.onPartyToggle && api.onPartyToggle()
  // look drag
  const cv = root.querySelector('canvas'); const ptr = new Map()
  cv.addEventListener('pointerdown', (e) => { if (e.target !== cv) return; cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), mouse: e.pointerType === 'mouse' }); state.any++ })
  cv.addEventListener('pointermove', (e) => { const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; state.yawD += dx * 0.0052; state.pitchD += dy * 0.0042 })
  const pu = (e) => { const p = ptr.get(e.pointerId); if (!p) return; ptr.delete(e.pointerId); if (p.mouse && performance.now() - p.t < 260 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) state.attack = true }
  cv.addEventListener('pointerup', pu); cv.addEventListener('pointercancel', pu); cv.addEventListener('contextmenu', (e) => e.preventDefault())
  cv.addEventListener('wheel', (e) => { state.zoom = (state.zoom || 0) + Math.sign(e.deltaY); e.preventDefault() }, { passive: false })
  if (coarse) { stick.style.display = 'block'; act.style.display = 'flex' }
  let toastT = 0, typeT = null
  const api = {
    root: ui, state, coarse,
    poll() {
      let x = 0, y = 0; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1; if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1
      if (stick._v) { x = stick._v[0]; y = -stick._v[1] }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l }
      const o = { x, y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') || (stick._v && Math.hypot(...stick._v) > 0.92), jump: state.jump, attack: state.attack, use: state.use, yawD: state.yawD, pitchD: state.pitchD, skip: state.skip, hub: state.hub, exit: state.exit, zoom: state.zoom || 0, pack: state.pack, chapters: state.chapters, slot0: state.slot0, slot1: state.slot1, slot2: state.slot2, slot3: state.slot3, slot4: state.slot4, slot5: state.slot5 }
      state.jump = state.attack = state.use = state.skip = state.hub = state.exit = state.pack = state.chapters = state.slot0 = state.slot1 = state.slot2 = state.slot3 = state.slot4 = state.slot5 = false; state.yawD = state.pitchD = 0; state.zoom = 0; return o
    },
    setHP(f) { hp.style.width = Math.max(0, Math.min(1, f)) * 100 + '%' },
    setObjective(t, sub) { objT.textContent = t || ''; objS.textContent = sub || '' }, showHUD(on) { top.style.display = on ? 'flex' : 'none'; help.style.display = on ? 'block' : 'none'; if (coarse) { stick.style.display = on ? 'block' : 'none'; act.style.display = on ? 'flex' : 'none' } },
    setBoss(f, name) { boss.style.display = f == null ? 'none' : 'block'; if (f != null) bossBar.style.width = Math.max(0, f) * 100 + '%'; if (name) bossName.textContent = String(name).toUpperCase() },
    setWave(t) { waveEl.style.display = t ? 'block' : 'none'; waveEl.textContent = t || '' }, showStory(on) { bChap.style.display = on ? '' : 'none'; if (!on) chPanel.style.display = 'none' }, showParty(on) { bParty.style.display = on ? '' : 'none' },
    toggleChapters(list, save, S, pick) { if (!list) { chPanel.style.display = 'none'; return } if (chPanel.style.display === 'block') { chPanel.style.display = 'none'; return } chPanel.innerHTML = '<h3>Chapters</h3>' + list.map((c) => { const un = c.n === 1 || save.ch[c.n - 1].done, d = save.ch[c.n].done; return `<div class="it"><b>${c.n}. ${c.title}<small>${d ? 'Completed' : un ? c.place : 'Locked: finish chapter ' + (c.n - 1)}</small></b><button data-n="${c.n}" ${un ? '' : 'disabled'}>${save.cur === c.n ? 'Current' : 'Go'}</button></div>` }).join(''); chPanel.style.display = 'block'; chPanel.querySelectorAll('button[data-n]').forEach((b) => (b.onclick = () => pick(+b.dataset.n))) },
    say(who, text, instant) { dlg.style.display = 'block'; dWho.textContent = who || ''; clearInterval(typeT); if (instant) { dTxt.textContent = text; return } let i = 0; dTxt.textContent = ''; typeT = setInterval(() => { i += 2; dTxt.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typeT) }, 28); api._full = text },
    finishSay() { clearInterval(typeT); if (api._full != null) dTxt.textContent = api._full }, sayTyping: () => dTxt.textContent.length < (api._full || '').length, hideSay() { dlg.style.display = 'none'; clearInterval(typeT) },
    prompt(t) { prompt.style.display = t ? 'block' : 'none'; if (t) prompt.textContent = t },
    title(h, p, on) { title.style.display = on ? 'flex' : 'none'; title.querySelector('h1').textContent = h || ''; title.querySelector('p').textContent = p || '' },
    toast(t) { toast.textContent = t; toast.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (toast.style.opacity = 0), 2400) },
    skipBtn(on) { skip.style.display = on ? 'block' : 'none' },
    tag(id, x, y, show, html) { const e = tag(id); if (!show) { e.style.display = 'none'; return } e.style.display = 'block'; e.style.left = x + 'px'; e.style.top = y + 'px'; if (html != null && e._h !== html) { e.innerHTML = html; e._h = html } },
    mark(id, color, x, y, show, label) { const e = mark(id, color); if (!show) { e.style.display = 'none'; return } e.style.display = 'block'; e.style.left = x + 'px'; e.style.top = y + 'px'; e.querySelector('span').textContent = label || '' },
    error(msg) { el('div', 'rm-err', `<div><div style="font-size:26px;margin-bottom:8px">Realm could not start</div><div style="opacity:.8;max-width:520px">${msg}</div></div>`, root) },
    destroy() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); clearInterval(typeT); ui.remove() },
  }
  return api
}
window.__RealmUI = { createUI }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, GL = window.__RealmGL, A = window.__RealmAtmo, B = window.__RealmBoss, I = window.__RealmItems, WLD = window.__RealmWorld, { M, clamp, mix, sstep } = C
const H = (x, z) => C.terrainH(x, z), TAU = Math.PI * 2, smooth = (t) => t * t * (3 - 2 * t), lerp = mix
const PATH = [[0, 0], [80, -60], [200, -120], [330, -230], [440, -330], [520, -420], [520, -420], [520, -420]], PATHF = new Float32Array(PATH.flat())
const ALTAR = [520, -420], CAMP = [0, 0], HUBP = { story: [-10.5, -15], raid: [10.5, -15] }
function pathDist(x, z) { x += (C.vnoise(x * 0.05, z * 0.05) - 0.5) * 7; z += (C.vnoise(x * 0.05 + 9, z * 0.05 + 9) - 0.5) * 7; let d = 1e9; for (let i = 0; i < 7; i++) { const a = PATH[i], b = PATH[i + 1], px = x - a[0], pz = z - a[1], bx = b[0] - a[0], bz = b[1] - a[1], den = bx * bx + bz * bz || 1, t = clamp((px * bx + pz * bz) / den, 0, 1); d = Math.min(d, Math.hypot(px - bx * t, pz - bz * t)) } return d }
function pipTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')
  g.fillStyle = '#d9a35e'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#c28a46'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 5)
  g.fillStyle = '#5a3b1e'; g.beginPath(); g.moveTo(14, 70); g.lineTo(242, 70); g.lineTo(200, 6); g.lineTo(56, 6); g.closePath(); g.fill(); g.fillStyle = '#7b2d12'; g.fillRect(14, 62, 228, 14) // hat
  g.fillStyle = '#f3efe6'; g.beginPath(); g.moveTo(40, 150); g.quadraticCurveTo(128, 300, 216, 150); g.lineTo(216, 232); g.lineTo(40, 232); g.closePath(); g.fill() // beard
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(88, 118, 20, 24, 0, 0, TAU); g.ellipse(168, 118, 20, 24, 0, 0, TAU); g.fill(); g.fillStyle = '#2a1608'; g.beginPath(); g.arc(92, 122, 10, 0, TAU); g.arc(164, 122, 10, 0, TAU); g.fill()
  g.fillStyle = '#f3efe6'; g.fillRect(64, 90, 50, 8); g.fillRect(142, 90, 50, 8); g.strokeStyle = '#a2723a'; g.lineWidth = 6; g.beginPath(); g.moveTo(112, 152); g.lineTo(144, 152); g.stroke()
  return c
}
function fallbackAvatar() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#ff9a2e'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(86, 110, 22, 28, 0, 0, TAU); g.ellipse(170, 110, 22, 28, 0, 0, TAU); g.fill(); g.fillStyle = '#2a1608'; g.beginPath(); g.arc(90, 116, 11, 0, TAU); g.arc(166, 116, 11, 0, TAU); g.fill(); g.strokeStyle = '#7a3a00'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.arc(128, 150, 36, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); return c
}



// ---------------------------------------------------------------- arenas for chapters 2-5 (found on the real terrain so every one is reachable)
let arenasReady = false
function setupArenas() {
  if (arenasReady) return; arenasReady = true; const keep = C.getMode(); C.setMode(1); C.WORLD.arenas = []
  const slopeRange = (x, z) => { let mn = 1e9, mx = -1e9; for (const [dx, dz] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]]) { const h = C.baseWorld(x + dx, z + dz); mn = Math.min(mn, h); mx = Math.max(mx, h) } return mx - mn }
  const search = (cx, cz, r0, r1, a0, a1, score) => { let best = null, bs = -1e9; for (let r = r0; r <= r1; r += 25) for (let a = a0; a <= a1; a += 0.09) { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, h = C.baseWorld(x, z), s = score(x, z, h); if (s > bs) { bs = s; best = { x, z, h } } } return best }
  const wood = search(0, 0, 380, 560, 3.2, 4.4, (x, z, h) => (h > 4 && h < 60 ? GL.forestAt(x, z, h) * 3 - slopeRange(x, z) * 0.15 + (h > 8 ? 0.3 : 0) : -9))
  const lake = search(C.WORLD.lake[0], C.WORLD.lake[1], 120, 190, 0, TAU, (x, z, h) => (h > -12 && h < 14 ? -Math.abs(h - 1) * 0.5 - slopeRange(x, z) * 0.12 : -9))
  const peak = search(0, 0, 520, 1000, 1.5, 2.6, (x, z, h) => (h < 175 && h > 40 ? h * 0.05 - slopeRange(x, z) * 0.06 : -9))
  const far = search(0, 0, 820, 1250, -0.9, 0.0, (x, z, h) => (h > 8 && h < 70 ? -slopeRange(x, z) * 0.2 : -9))
  const mk = (p, d, r, minH) => { p = p || d; return { x: p.x, z: p.z, h: Math.max(minH, p.h), r } }
  C.WORLD.arenas = [mk(wood, { x: -400, z: -300, h: 12 }, 46, 3), mk(lake, { x: -140, z: 320, h: 0 }, 46, -1.5), mk(peak, { x: -300, z: 800, h: 130 }, 46, 40), mk(far, { x: 900, z: -600, h: 20 }, 50, 6)]
  C.setMode(keep)
}
const CHAPTERS = [
  { n: 1, key: 'titan', title: 'The Awakening', place: 'Cedarvale Meadow', pick: { name: 'Sun Shard', col: [1.0, 0.72, 0.22], n: 5, guard: null }, guardType: 'slime', rune: [1.0, 0.5, 0.12], boss: 'titan', time: 18.3, cloud: 0.7, say: { intro: ['Narrator', 'Cedarvale Meadow. For a thousand years the grass has grown quiet and the wind has kept its secrets.'], boss: ['Narrator', 'The shards lift from your pack and burn like tiny suns. The standing stones begin to glow.'], win: ['Elder Pip', 'You did it! The meadow will sing your name tonight. But the hum is not gone... it moved west, into the old wood.'] } },
  { n: 2, key: 'warden', title: 'The Whispering Wood', place: 'Whispering Grove', pick: { name: 'Spirit Lantern', col: [0.45, 1.0, 0.35], n: 3 }, guardType: 'goblin', rune: [0.4, 1.0, 0.3], boss: 'warden', time: 17.2, cloud: 0.5, say: { intro: ['Elder Pip', 'The Wood is awake and angry. Three spirit lanterns hang where goblins nest. Light them and the Warden will show itself.'], boss: ['Narrator', 'Roots break the earth. The oldest tree in Cedarvale opens its eyes.'], win: ['Elder Pip', 'The Warden sleeps again. But cold water is rising in Mirror Lake...'] } },
  { n: 3, key: 'tide', title: 'Tides of Mirror Lake', place: 'Mirror Lake shore', pick: { name: 'Tide Pearl', col: [0.3, 0.85, 1.0], n: 3 }, guardType: 'slime', rune: [0.3, 0.8, 1.0], boss: 'tide', time: 15.4, cloud: 0.4, say: { intro: ['Elder Pip', 'Pearls of the old tide are scattered along the lake. Recover three and the Tide Golem will rise to claim them.'], boss: ['Narrator', 'The lake draws back and a mountain of wet stone climbs out of it.'], win: ['Elder Pip', 'The water is calm. Now look north. Something is breaking the snow.'] } },
  { n: 4, key: 'glacier', title: 'Frostpeak Pass', place: 'Frostpeak summit', pick: { name: 'Frost Beacon', col: [0.7, 0.9, 1.0], n: 3 }, guardType: 'frost', rune: [0.4, 0.8, 1.0], boss: 'glacier', time: 11.0, cloud: 0.6, say: { intro: ['Elder Pip', 'Beacons burn cold on the high ridge. Frostlings guard each one. Climb carefully.'], boss: ['Narrator', 'Ice cracks like thunder. The mountain itself stands up.'], win: ['Elder Pip', 'You have the Frost Beacons. Only one thing is left, far to the east: a crown that remembers a king.'] } },
  { n: 5, key: 'hollow', title: 'The Hollow Crown', place: 'The Hollow Throne', pick: { name: 'Crown Fragment', col: [0.8, 0.35, 1.0], n: 3 }, guardType: 'shade', rune: [0.7, 0.3, 1.0], boss: 'hollow', time: 21.0, cloud: 0.3, say: { intro: ['Elder Pip', 'Three fragments of the Hollow Crown lie in shade-haunted ruins. Reunite them... if you dare.'], boss: ['The Hollow King', 'Who walks into my silence?'], win: ['Elder Pip', 'The crown is dust and the meadow is quiet. You are the greatest hero Cedarvale has ever known.'] } },
]
const chapterBoss = (c) => B.BOSSES[c.boss]

function create(parent, opts = {}) {
  const root = document.createElement('div'); root.className = 'rm-root'; parent.appendChild(root)
  const canvas = document.createElement('canvas'); root.appendChild(canvas)
  const UI = window.__RealmUI.createUI(root, opts)
  let E, ground, grass, trees, O, Av, raf = 0, dead = false
  const debug = !!opts.debug
  try {
    E = GL.createEngine(canvas, { quality: opts.quality || (UI.coarse ? 1 : 2), debug })
    ground = window.__RealmGrass.createGround(E); grass = window.__RealmGrass.createGrass(E, ground); trees = window.__RealmTrees.createTrees(E); O = window.__RealmObjects.createObjects(E)
    Av = window.__RealmAvatars.createAvatars(E, O, opts.avatarFor || ((id) => ({ src: opts.avatar, name: id })))
  } catch (e) { console.error(e); UI.error(String(e.message || e).slice(0, 400)); return { dispose() { UI.destroy(); root.remove() } } }
  setupArenas()
  const myBlook = opts.blookId || 'toast', myName = opts.name || 'Hero'
  O.setTexture('pip', pipTexture()); O.setTexture('player', fallbackAvatar())
  if (opts.avatar) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { try { O.setTexture('player', im) } catch {} }; im.src = opts.avatar }

  // ---------------------------------------------------------------- save, inventory
  const SAVE = 'oranget_realm_v2'
  let save = { cur: 1, ch: {}, opened: [] }
  try { save = { ...save, ...JSON.parse(localStorage.getItem(SAVE) || '{}') } } catch {}
  try { const old = JSON.parse(localStorage.getItem('oranget_realm_story') || 'null'); if (old && !save._mig) { save._mig = 1; save.ch[1] = { got: old.shards || [], done: (old.stage || 0) >= 4 } } } catch {}
  for (const c of CHAPTERS) save.ch[c.n] = save.ch[c.n] || { got: [], done: false }
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)) } catch {} }
  const inv = I.createInventory(root, UI, { key: 'oranget_realm_inv', onUse: (r) => { if (r.heal) usePotion(r.heal); else if (r.equipped) { UI.toast('Equipped ' + I.ITEMS[r.equipped].n); recalc() } } })
  const enemies = WLD.createEnemies({}), chests = WLD.createChests({ opened: save.opened })
  const unlocked = (n) => n === 1 || save.ch[n - 1].done
  const curCh = () => CHAPTERS[save.cur - 1]

  // ---------------------------------------------------------------- state
  const S = { scene: 'hub', t: 0, hours: 10.5, cloud: 0.35, px: 0, py: 0, pz: 8, vy: 0, vx: 0, vz: 0, face: Math.PI, moving: 0, hp: 100, maxHp: 100, atk: 0, atkCd: 0, camYaw: 0, camPitch: 0.32, camDist: 7, flash: 0, fade: 1, shake: 0, trans: null, cut: null, bob: 0, onGround: true, hurt: 0, lastStream: -9, pot: 0, dead: false, stats: inv.stats(), regenT: 0 }
  const FX = []; let solids = [], statics = [], portals = [], pickups = [], npc = null, bonfire = null, arenaC = null, B1 = null, R = null, party = null, net = null, others = new Map(), lobbyBoard = null
  const recalc = () => { const st = inv.stats(); S.stats = st; const f = S.hp / S.maxHp; S.maxHp = st.maxHp; S.hp = Math.min(S.maxHp, Math.max(1, Math.round(f * S.maxHp))); UI.setHP(S.hp / S.maxHp) }
  inv.onChange(() => { S.stats = inv.stats(); if (S.stats.maxHp !== S.maxHp) recalc() })
  const usePotion = (heal) => { if (S.pot > 0 || S.dead) return; S.pot = 1.2; S.hp = Math.min(S.maxHp, S.hp + heal); UI.setHP(S.hp / S.maxHp); FX.push({ t: 0, org: [S.px, S.py + 0.8, S.pz], col: [1.0, 0.4, 0.5], a: [1.0, 0.2, 0, 0], n: 60 }); UI.toast('+' + heal + ' health') }

  // ---------------------------------------------------------------- helpers
  const rotLocal = (yaw, lx, ly, lz) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [c * lx + s * lz, ly, -s * lx + c * lz] }
  const mkSolid = (x, z, r) => solids.push({ x, z, r })
  const stoneTint = [0.20, 0.19, 0.18]
  function buildPortal(x, z, yaw, theme) {
    const y = H(x, z), parts = [], em = theme.rune, rr = (a, b) => a + (b - a) * Math.random(), SC = 1.3
    const add = (mesh, lx, ly, lz, ry, sx, sy, sz, rz, tint, emv) => { lx *= SC; ly *= SC; lz *= SC; sx *= SC; sy *= SC; sz *= SC; const p = rotLocal(yaw, lx, ly, lz); parts.push({ mesh, model: M.trs(x + p[0], y + p[1], z + p[2], yaw + ry, sx, sy, sz, 0, rz), mat: 1, tint: tint || stoneTint, em: emv || [em[0], em[1], em[2], 0], p: [1, 0, 0, 0] }) }
    add('cyl', 0, -0.05, 0, 0, 9.0, 0.45, 9.0, 0, [0.16, 0.155, 0.15]); add('cyl', 0, 0.3, 0, 0, 7.2, 0.18, 7.2, 0, [0.22, 0.21, 0.2], [em[0], em[1], em[2], 1.3])
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) add('box', s * 2.45 + rr(-0.05, 0.05), 0.45 + 1.2 * k + 0.6, rr(-0.04, 0.04), rr(-0.03, 0.03), 1.25 + rr(-0.05, 0.05), 1.22, 1.35, rr(-0.02, 0.02), null, [em[0], em[1], em[2], k === 1 ? 1.3 : 0.9])
    const cy = 4.1; for (let i = 0; i < 9; i++) { const a = Math.PI - (i + 0.5) / 9 * Math.PI; add('box', Math.cos(a) * 2.45, cy + Math.sin(a) * 2.45, 0, 0, 1.05, 1.28, 1.35, a - Math.PI / 2 + rr(-0.02, 0.02), null, [em[0], em[1], em[2], 1.1]) }
    add('box', 0, cy + 2.95, 0, 0, 1.5, 0.9, 1.5, 0, [0.24, 0.23, 0.22], [em[0], em[1], em[2], 1.6])
    return { x, z, y, yaw, theme, parts, cx: x, cy: y + 2.85 * SC, cz: z, light: [x + Math.sin(yaw) * 3.4, y + 3.6, z + Math.cos(yaw) * 3.4] }
  }
  function pillarRing(cx, cz, n, r, rune, hgt = 6.4, wide = 1.9) { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 0.2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = H(x, z); statics.push({ mesh: 'box', model: M.trs(x, y + hgt / 2 - 0.2, z, a + Math.PI / 2, wide, hgt, 1.2, 0.04 * (i % 3 - 1), 0.05 * (i % 2 - 0.5)), mat: 1, tint: stoneTint, em: [rune[0], rune[1], rune[2], 1.0], p: [1, 0, 0, 0] }); mkSolid(x, z, 1.1) } }
  function brazier(x, z) { const y = H(x, z); statics.push({ mesh: 'cyl', model: M.trs(x, y, z, 0, 1.1, 1.0, 1.1), mat: 1, tint: [0.12, 0.115, 0.11], p: [0.2, 0, 0, 0] }, { mesh: 'cyl', model: M.trs(x, y + 1.0, z, 0, 1.6, 0.35, 1.6), mat: 1, tint: [0.1, 0.095, 0.09], p: [0.1, 0, 0, 0] }); mkSolid(x, z, 0.9); fires.push({ x, y: y + 1.2, z }) }
  let fires = []

  // ---------------------------------------------------------------- scenes
  const biome = (x, z, h) => { if (h > 105) return ['frost', 'frost', 'brute']; if (GL.forestAt(x, z, h) > 0.35) return ['goblin', 'wisp', 'slime']; if (Math.hypot(x - C.WORLD.lake[0], z - C.WORLD.lake[1]) < 170) return ['slime', 'slime', 'goblin']; if (Math.hypot(x, z) > 850) return ['shade', 'shade', 'brute']; return ['slime', 'goblin', 'slime'] }
  const avoidSpawn = (x, z, h) => { if (h < C.WORLD.water + 1 || Math.hypot(x - CAMP[0], z - CAMP[1]) < 45 || Math.hypot(x - ALTAR[0], z - ALTAR[1]) < 70) return true; for (const a of C.WORLD.arenas) if (Math.hypot(x - a.x, z - a.z) < 70) return true; return false }
  function densityHub(x, z, h) { const r = Math.hypot(x, z); if (r < 40) return 0; for (const p of portals) if (Math.hypot(x - p.x, z - p.z) < 11) return 0; return Math.min(0.9, (r - 40) / 36) * 0.78 + (C.fbm(x * 0.03, z * 0.03, 2) > 0.62 && r < 70 ? 0.15 : 0) }
  densityHub.species = (x, z, h) => (h > 26 || C.fbm(x * 0.02 + 5, z * 0.02, 2) > 0.62 ? 1 : 0)
  function densityWorld(x, z, h) {
    if (h < C.WORLD.water + 1.2) return 0; if (Math.hypot(x - CAMP[0], z - CAMP[1]) < 20) return 0; if (Math.hypot(x - ALTAR[0], z - ALTAR[1]) < 48) return 0; for (const a of C.WORLD.arenas) if (Math.hypot(x - a.x, z - a.z) < a.r + 6) return 0; if (pathDist(x, z) < 5) return 0
    let f = GL.forestAt(x, z, h); const a2 = C.WORLD.arenas[0]; if (a2 && Math.hypot(x - a2.x, z - a2.z) < 190) f = Math.max(f, 0.8)
    return clamp(0.05 + f * 0.95, 0, 1) * (1 - sstep(150, 190, h))
  }
  densityWorld.species = (x, z, h) => (h > 58 || C.fbm(x * 0.012 + 40, z * 0.012, 2) > 0.58 ? 1 : 0)
  const densityArena = () => 0
  function clearScene() { solids = []; statics = []; portals = []; pickups = []; npc = null; bonfire = null; arenaC = null; B1 = null; fires = []; lobbyBoard = null; FX.length = 0; enemies.clear(); chests.clear(); others.forEach((o) => o); }
  function enterScene(name, spawn) {
    S.scene = name; C.setMode(name === 'world' ? 1 : name === 'hub' ? 0 : 2); clearScene(); S.dead = false; S.vx = S.vz = 0
    ground.update(0, 0, PATHF, 'scene' + name + Date.now()); UI.setBoss(null); UI.setWave(null); UI.showHUD(true); UI.prompt(''); UI.hideSay(); UI.showStory(name === 'world'); UI.showParty(name === 'lobby' || name === 'raid')
    if (name === 'hub') {
      S.hours = 10.5; S.cloud = 0.35
      portals.push(buildPortal(HUBP.story[0], HUBP.story[1], 0.22, { name: 'story', rune: [1.0, 0.52, 0.14], c0: [0.35, 0.06, 0.0], c1: [1.0, 0.5, 0.1], c2: [1.0, 0.85, 0.55], light: [3.2, 1.35, 0.35], label: 'Story Mode', sub: 'Open World | 5 Chapters' }))
      portals.push(buildPortal(HUBP.raid[0], HUBP.raid[1], -0.22, { name: 'raid', rune: [0.35, 0.5, 1.0], c0: [0.01, 0.02, 0.22], c1: [0.18, 0.32, 1.0], c2: [0.5, 0.65, 1.0], light: [0.7, 1.0, 3.2], label: 'Raid Lobby', sub: 'Boss Rush | Party' }))
      portals.forEach((p) => { statics.push(...p.parts); for (const s of [-1, 1]) { const q = rotLocal(p.yaw, s * 2.45 * 1.3, 0, 0); mkSolid(p.x + q[0], p.z + q[2], 1.2) } })
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.3, r = 24 + (i % 3) * 5, x = Math.cos(a) * r, z = Math.sin(a) * r + 6; if (Math.hypot(x - HUBP.story[0], z - HUBP.story[1]) < 8 || Math.hypot(x - HUBP.raid[0], z - HUBP.raid[1]) < 8) continue; const sc = 0.8 + (i % 4) * 0.45, y = H(x, z); statics.push({ mesh: 'sphere', model: M.trs(x, y + sc * 0.2, z, i, sc * 1.6, sc * 0.9, sc * 1.3, 0.2 * i, 0.1), mat: 1, tint: [0.2, 0.19, 0.18], p: [0.7, 0, 0, 0] }); mkSolid(x, z, sc * 0.75) }
      S.px = 0; S.pz = 9; S.camYaw = 0; S.camPitch = 0.3; S.camDist = 7.5; trees.update(S.px, S.pz, densityHub, true)
      UI.setObjective('Choose a portal', 'Walk into one to travel')
    } else if (name === 'world') {
      S.hours = 8.4; S.cloud = 0.45
      bonfire = { x: 3.2, z: 2.4, y: H(3.2, 2.4) }; mkSolid(bonfire.x, bonfire.z, 1.2)
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, x = bonfire.x + Math.cos(a) * 1.25, z = bonfire.z + Math.sin(a) * 1.25; statics.push({ mesh: 'sphere', model: M.trs(x, H(x, z) + 0.15, z, a, 0.55, 0.38, 0.5), mat: 1, tint: [0.2, 0.19, 0.18], p: [0.5, 0, 0, 0] }) }
      for (let i = 0; i < 4; i++) statics.push({ mesh: 'cyl', model: M.trs(bonfire.x, bonfire.y + 0.3, bonfire.z, i * 1.6 + 0.4, 0.2, 1.3, 0.2, 0, 1.15), mat: 4, tint: [0.09, 0.05, 0.025] })
      ;[[-4.5, 3.5], [-5.6, 2.4], [6.6, -3.2]].forEach(([x, z], i) => { statics.push({ mesh: 'box', model: M.trs(x, H(x, z) + 0.45, z, 0.3 + i, 0.9, 0.9, 0.9), mat: 4, tint: [0.16, 0.095, 0.045] }); mkSolid(x, z, 0.65) })
      npc = { x: 5.2, z: -1.0, y: H(5.2, -1.0), yaw: -1.9 }; mkSolid(5.2, -1.0, 0.7)
      // arenas for every chapter: standing stones in the chapter's colour
      const A1 = { x: ALTAR[0], z: ALTAR[1], h: H(ALTAR[0], ALTAR[1]) }
      const arenas = [A1, ...C.WORLD.arenas]
      CHAPTERS.forEach((c, i) => { const a = arenas[i]; c.arena = a; const ay = H(a.x, a.z); pillarRing(a.x, a.z, 8, 15, c.rune); statics.push({ mesh: 'box', model: M.trs(a.x, ay + 0.7, a.z, 0, 5, 1.4, 2.6), mat: 1, tint: [0.22, 0.21, 0.2], em: [c.rune[0], c.rune[1], c.rune[2], 1.2], p: [1, 0, 0, 0] }); mkSolid(a.x, a.z, 3); statics.push({ mesh: 'cyl', model: M.trs(a.x, ay - 0.1, a.z, 0, 40, 0.3, 40), mat: 1, tint: [0.15, 0.145, 0.14], em: [c.rune[0], c.rune[1], c.rune[2], 0.7], p: [1, 0, 0, 0] }) })
      S.px = 0.5; S.pz = 6.5; S.camYaw = 0.6; S.camPitch = 0.28; S.camDist = 6.4; trees.update(S.px, S.pz, densityWorld, true)
      S.hp = S.maxHp; setupChapter(save.cur)
      if (!save.intro) startIntro()
    } else if (name === 'lobby') {
      S.hours = 19.6; S.cloud = 0.3; pillarRing(0, 0, 10, 24, [0.4, 0.55, 1.0], 7.2, 2.2)
      for (const [x, z] of [[-9, -9], [9, -9], [-17, 8], [17, 8]]) brazier(x, z)
      lobbyBoard = { x: 0, z: -13, y: H(0, -13) }; statics.push({ mesh: 'box', model: M.trs(0, lobbyBoard.y + 1.7, -13, 0, 5.2, 3.2, 0.5), mat: 1, tint: [0.2, 0.19, 0.18], em: [0.4, 0.6, 1.0, 1.4], p: [0.4, 0, 0, 0] }, { mesh: 'box', model: M.trs(-2.4, lobbyBoard.y + 0.8, -13, 0, 0.5, 1.6, 0.5), mat: 1, tint: stoneTint, p: [1, 0, 0, 0] }, { mesh: 'box', model: M.trs(2.4, lobbyBoard.y + 0.8, -13, 0, 0.5, 1.6, 0.5), mat: 1, tint: stoneTint, p: [1, 0, 0, 0] }); mkSolid(0, -13, 3)
      statics.push({ mesh: 'cyl', model: M.trs(0, H(0, 0) - 0.05, 0, 0, 16, 0.2, 16), mat: 1, tint: [0.16, 0.155, 0.15], em: [0.4, 0.6, 1.0, 0.9], p: [0.3, 0, 0, 0] })
      S.px = 0; S.pz = 12; S.camYaw = 0; S.camPitch = 0.3; S.camDist = 7.5; trees.update(S.px, S.pz, densityArena, true)
      UI.setObjective('Raid Lobby', 'Open the board (E) to form a party and start a raid')
      if (!net && opts.makeNet) { try { net = opts.makeNet() } catch (e) { console.warn('party net failed', e); net = null } } bindNet()
    } else if (name === 'raid') {
      S.hours = 20.8; S.cloud = 0.45; pillarRing(0, 0, 12, 40, [0.9, 0.35, 0.2], 9, 2.4); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; brazier(Math.cos(a) * 31, Math.sin(a) * 31) }
      S.px = 0; S.pz = 30; S.camYaw = 0; S.camPitch = 0.3; S.camDist = 9.5; trees.update(S.px, S.pz, densityArena, true)
    }
    S.py = H(S.px, S.pz); S.vy = 0; if (name === 'hub') { S.hp = S.maxHp }
    solids.push(...trees.solids().map((s) => ({ ...s, tree: true }))); UI.setHP(S.hp / S.maxHp)
  }

  // ---------------------------------------------------------------- story chapters
  function setupChapter(n) {
    save.cur = n; persist(); const c = curCh(); pickups = []; B1 = null; const g = save.ch[n]; if (!c.arena) c.arena = n === 1 ? { x: ALTAR[0], z: ALTAR[1], h: H(ALTAR[0], ALTAR[1]) } : C.WORLD.arenas[n - 2]
    arenaC = c.arena; enemies.list = enemies.list.filter((e) => !e.guard)
    if (!g.done) {
      const nominal = n === 1 ? [[120, -75], [-150, -70], [250, -190], [330, -70], [410, -285]] : Array.from({ length: c.pick.n }, (_, i) => { const a = (i / c.pick.n) * TAU + n, r = 95 + 55 * ((i + n) % 3); return [arenaC.x + Math.cos(a) * r, arenaC.z + Math.sin(a) * r] })
      nominal.forEach((nm, i) => { let best = null; for (let r = 0; r < 70 && !best; r += 6) for (let a = 0; a < 12 && !best; a++) { const x = nm[0] + Math.cos(a * 0.52) * r, z = nm[1] + Math.sin(a * 0.52) * r, h = H(x, z), nn = C.terrainN(x, z, 1.0); if (h > C.WORLD.water + 1.5 && nn[1] > 0.9 && h < 175) best = [x, z] } best = best || nm; const p = { id: i, x: best[0], z: best[1], y: H(best[0], best[1]), got: g.got.includes(i) }; pickups.push(p)
        if (!p.got && n > 1) for (let k = 0; k < 3; k++) { const a = k * 2.1, e = enemies.spawn(c.guardType, p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7, { guard: true, hpMul: 1 + 0.25 * (n - 1), dmMul: 1 + 0.15 * (n - 1), lvl: n }); void e } })
    }
    refreshObjective()
  }
  const phase = () => { const g = save.ch[save.cur]; if (g.done) return 'done'; if (g.got.length < curCh().pick.n) return 'collect'; return B1 && B1.state !== 'dead' ? 'boss' : 'arena' }
  function refreshObjective() {
    const c = curCh(), g = save.ch[save.cur], ph = phase(), left = c.pick.n - g.got.length
    if (ph === 'collect') UI.setObjective(`Ch ${c.n}: ${c.title}`, `Collect ${c.pick.name}s near ${c.place} (${g.got.length} / ${c.pick.n})`)
    else if (ph === 'arena') UI.setObjective(`Ch ${c.n}: ${c.title}`, `Reach ${c.place} and face ${chapterBoss(c).name}`)
    else if (ph === 'boss') UI.setObjective(`Ch ${c.n}: ${c.title}`, `Defeat ${chapterBoss(c).name}`)
    else UI.setObjective(`Ch ${c.n} complete`, save.cur < 5 ? 'Open Chapters to continue the story' : 'The story is complete. Try the Raid Lobby!'); void left
  }
  const camOver = (x, z, dy) => [x, H(x, z) + dy, z]
  function cutscene(shots, onEnd) { S.cut = { shots, i: 0, t: 0, onEnd, said: false }; UI.showHUD(false); UI.prompt(''); UI.skipBtn(true); UI.hideSay() }
  function endCut() { const c = S.cut; S.cut = null; UI.skipBtn(false); UI.hideSay(); UI.title('', '', false); UI.showHUD(true); if (c && c.onEnd) c.onEnd() }
  function startIntro() {
    const pipP = [npc.x, npc.y + 1.2, npc.z]
    cutscene([
      { dur: 6.5, a: () => ({ p: [-70, H(-70, 50) + 38, 60], t: [0, H(0, 0) + 6, 0] }), b: () => ({ p: [-26, H(-26, 20) + 12, 20], t: [2, H(2, 0) + 2, 0] }), say: CHAPTERS[0].say.intro },
      { dur: 5.0, a: () => ({ p: [bonfire.x + 3.4, bonfire.y + 1.5, bonfire.z + 5.2], t: pipP }), b: () => ({ p: [bonfire.x + 2.2, bonfire.y + 1.3, bonfire.z + 4.2], t: pipP }), say: ['Elder Pip', 'Ah, a traveler! Sit, sit. Do you feel that hum under your feet? That is the Meadow Titan, stirring in its sleep.'] },
      { dur: 6.0, a: () => ({ p: [bonfire.x - 4, bonfire.y + 1.6, bonfire.z + 4.5], t: pipP }), b: () => ({ p: [bonfire.x - 3, bonfire.y + 1.2, bonfire.z + 3.2], t: [bonfire.x + 1, bonfire.y + 1.1, bonfire.z] }), say: ['Elder Pip', 'Five Sun Shards lie scattered across the land. Gather them and carry their light to the Ancient Altar. Chests and creatures roam the wild, so keep your backpack handy (B).'] },
      { dur: 4.2, a: () => ({ p: camOver(S.px + 4, S.pz + 7, 3), t: [S.px, S.py + 1, S.pz] }), b: () => ({ p: camOver(S.px + 1, S.pz + 6.4, 2.4), t: [S.px, S.py + 1.2, S.pz - 3] }), say: ['Elder Pip', 'Follow the old road east. Look for the beams of light. Go on, little one!'] },
    ], () => { save.intro = 1; persist(); refreshObjective(); UI.toast('Find the ' + curCh().pick.name + 's') })
  }
  function chapterIntro(c) { const pipP = npc ? [npc.x, npc.y + 1.2, npc.z] : [S.px, S.py + 1, S.pz]; cutscene([{ dur: 6.0, a: () => ({ p: camOver(S.px + 5, S.pz + 7, 3), t: [S.px, S.py + 1, S.pz] }), b: () => ({ p: camOver(S.px + 2, S.pz + 6, 2.2), t: [S.px, S.py + 1.2, S.pz - 3] }), say: c.say.intro, title: [`CHAPTER ${c.n}`, c.title.toUpperCase()] }], () => { refreshObjective() }); void pipP }
  function bossIntro(c) {
    const a = arenaC, ay = H(a.x, a.z), D = chapterBoss(c), nb = B.newBoss(c.boss, a.x, a.z, ay - 14, 1, 1); B1 = nb
    cutscene([
      { dur: 5.0, a: () => ({ p: [a.x + 34, ay + 9, a.z + 30], t: [a.x, ay + 3, a.z] }), b: () => ({ p: [a.x + 24, ay + 7, a.z + 20], t: [a.x, ay + 4, a.z] }), say: c.say.boss, fx: () => { S.hours += (c.time - S.hours) * 0.02; S.cloud += (c.cloud - S.cloud) * 0.02 } },
      { dur: 6.0, a: () => ({ p: [a.x + 20, ay + 3, a.z + 14], t: [a.x, ay, a.z] }), b: () => ({ p: [a.x + 26, ay + 16, a.z + 22], t: [a.x, ay + 10, a.z] }), fx: (k) => { S.shake = 0.9 * smooth(Math.min(1, k * 2)); nb.y = ay - 14 + 14 * smooth(clamp((k - 0.15) / 0.8, 0, 1)); if (Math.random() < 0.5) FX.push({ t: 0, org: [a.x + (Math.random() - 0.5) * 8, ay + 0.3, a.z + (Math.random() - 0.5) * 8], col: [0.5, 0.4, 0.3], a: [3, 0.2, 0, 0], n: 20 }); S.hours += (c.time - S.hours) * 0.02 } },
      { dur: 4.2, a: () => ({ p: [a.x + 12, ay + 2.5, a.z + 12], t: [a.x, ay + 9, a.z] }), b: () => ({ p: [a.x + 13, ay + 3.5, a.z + 9], t: [a.x, ay + 10.5, a.z] }), fx: () => { nb.y = ay; S.shake = 0.35 }, title: [D.name.toUpperCase(), c.place.toUpperCase()] },
    ], () => { S.shake = 0; nb.state = 'fight'; S.hp = S.maxHp; S.px = a.x - 20; S.pz = a.z + 18; S.py = H(S.px, S.pz); S.camYaw = 2.4; UI.setBoss(1, D.name); refreshObjective(); UI.toast('Dodge the red telegraphs, strike when it is stunned!') })
  }
  function victoryCutscene(c) {
    const a = arenaC, ay = H(a.x, a.z); UI.setBoss(null); save.ch[c.n].done = true; persist()
    cutscene([
      { dur: 5.5, a: () => ({ p: [a.x + 30, ay + 8, a.z + 26], t: [a.x, ay + 5, a.z] }), b: () => ({ p: [a.x + 20, ay + 12, a.z + 16], t: [a.x, ay + 7, a.z] }), fx: (k) => { if (B1) B1.dead = k; S.shake = 0.5 * (1 - k); if (Math.random() < 0.6) FX.push({ t: 0, org: [a.x + (Math.random() - 0.5) * 9, ay + 1 + Math.random() * 9, a.z + (Math.random() - 0.5) * 9], col: chapterBoss(c).pal.lava, a: [2.5, 1, 0, 0], n: 30 }) }, say: ['Narrator', `${chapterBoss(c).name} falls, and its power scatters on the wind.`] },
      { dur: 5.5, a: () => ({ p: camOver(a.x + 10, a.z + 12, 3), t: [a.x, ay + 2, a.z] }), b: () => ({ p: camOver(a.x + 8, a.z + 9, 2.4), t: [a.x, ay + 3, a.z] }), say: c.say.win },
      { dur: 3.5, a: () => ({ p: camOver(a.x + 8, a.z + 9, 2.4), t: [a.x, ay + 3, a.z] }), b: () => ({ p: camOver(a.x - 5, a.z + 28, 24), t: [a.x, ay + 2, a.z - 20] }), title: [`CHAPTER ${c.n} COMPLETE`, c.title.toUpperCase()] },
    ], () => { B1 = null; S.hp = S.maxHp; const loot = I.rollLoot('boss', c.n); giveLoot(loot, `${chapterBoss(c).name} treasure`); S.cloud = 0.35; UI.setHP(1); if (c.n < 5) { UI.toast('Chapter ' + (c.n + 1) + ' unlocked'); } refreshObjective() })
  }
  function giveLoot(loot, label) { if (!loot || !loot.length) return; loot.forEach((l) => inv.add(l.id, l.n)); UI.toast((label ? label + ': ' : '') + loot.map((l) => (l.n > 1 ? l.n + 'x ' : '') + I.ITEMS[l.id].n).join(', '), 4200) }
  function collectPickup(p) { const c = curCh(), g = save.ch[c.n]; p.got = true; if (!g.got.includes(p.id)) g.got.push(p.id); S.flash = 0.3; FX.push({ t: 0, org: [p.x, p.y + 1.6, p.z], col: c.pick.col, a: [1.6, 0.8, 0, 0], n: 160 }); UI.toast(`${c.pick.name} ${g.got.length} / ${c.pick.n}`); persist(); refreshObjective(); if (g.got.length >= c.pick.n) UI.toast('Go to ' + c.place + '.') }

  // ---------------------------------------------------------------- combat
  function hurt(n) { if (S.hurt > 0 || S.dead) return; S.hp = Math.max(0, S.hp - n); S.hurt = 0.6; S.flash = 0.18; S.shake = Math.max(S.shake, 0.5); UI.setHP(S.hp / S.maxHp); if (S.hp <= 0) onDown() }
  function onDown() {
    if (S.scene === 'raid') { S.dead = true; UI.toast(R && R.solo ? 'You fell. The run is over.' : 'You fell. Your party fights on...'); if (R && !R.solo && net) net.send('dead', {}); if (R) R.alive[myId()] = false; checkRaidFail(); return }
    S.hp = S.maxHp; UI.setHP(1)
    if (B1 && B1.state === 'fight') { S.px = B1.x - 22; S.pz = B1.z + 18; B1.hp = Math.min(B1.max, B1.hp + 120); B1.atk = null; B1.hz = [] } else { S.px = S.scene === 'world' ? 0.5 : S.px; S.pz = S.scene === 'world' ? 6.5 : S.pz }
    S.py = H(S.px, S.pz); UI.toast('You were knocked out. Try again!')
  }
  function playerAttack() {
    if (S.atkCd > 0 || S.dead) return; const st = S.stats; S.atk = 0.001; S.atkCd = st.cd; const fx = Math.sin(S.face), fz = Math.cos(S.face), crit = Math.random() < st.crit, base = st.dmg
    FX.push({ t: 0, org: [S.px + fx * 1.4, S.py + 0.9, S.pz + fz * 1.4], col: crit ? [1, 0.9, 0.4] : [1.0, 0.8, 0.4], a: [1.2, 0.5, 0, 0], n: 50 })
    const me = { x: S.px, z: S.pz }
    for (const h of enemies.strike(me, S.face, st, base, crit)) { FX.push({ t: 0, org: [h.e.x, h.e.y + 1, h.e.z], col: [1, 0.6, 0.3], a: [1.5, 0.6, 0, 0], n: 40 }); if (h.killed) { giveLoot(I.rollLoot('enemy', h.e.lvl)); FX.push({ t: 0, org: [h.e.x, h.e.y + 1, h.e.z], col: h.e.T.glow, a: [2, 1, 0, 0], n: 90 }) } }
    const T = S.scene === 'raid' ? (R && R.B) : B1; if (T && T.state === 'fight') { const dx = T.x - S.px, dz = T.z - S.pz, d = Math.hypot(dx, dz); if (d < st.reach + 7.2 && (dx * fx + dz * fz) / (d || 1) > 0.15) { const dm = Math.round(base * (crit ? 2 : 1)); damageBoss(dm); FX.push({ t: 0, org: [T.x + dx * 0.0 - fx * 3, S.py + 3, T.z - fz * 3], col: T.stun > 0 ? [0.6, 0.85, 1.0] : [1.0, 0.7, 0.3], a: [2.5, 1, 0, 0], n: 80 }); S.shake = Math.max(S.shake, 0.2) } }
  }
  function damageBoss(dm) { if (S.scene === 'raid' && R && !R.host) { net && net.send('hit', { dm }); return } const T = S.scene === 'raid' ? R.B : B1; if (!T) return; T.hp = Math.max(0, T.hp - Math.round(dm * (T.stun > 0 ? 3 : 1))); T.flash = 1 }

  // ---------------------------------------------------------------- raids
  const myId = () => (net ? net.uid : 'me')
  function bindNet() {
    if (!net || net._bound) return; net._bound = true
    net.onPos((uid, d) => { const o = others.get(uid) || { uid, x: d.x, z: d.z, yaw: d.yaw || 0, tx: d.x, tz: d.z, mv: 0, atk: 0, hp: 100 }; o.tx = d.x; o.tz = d.z; o.tyaw = d.yaw; o.mv = d.mv || 0; o.name = d.name || 'Player'; o.av = d.av || 'toast'; o.hp = d.hp; o.atk = d.atk || 0; o.t = performance.now(); others.set(uid, o) })
    net.on('start', (d) => { if (S.scene === 'lobby') startRaid(d.mode, d.seed, false) })
    net.on('hit', (d) => { if (R && R.host && R.B && R.B.state === 'fight') { R.B.hp = Math.max(0, R.B.hp - Math.round(d.dm * (R.B.stun > 0 ? 3 : 1))); R.B.flash = 1 } })
    net.on('dead', (d, uid) => { if (R) { R.alive[uid] = false; checkRaidFail() } })
    net.on('fail', () => { if (S.scene === 'raid') raidEnd(false, true) })
    net.on('win', () => { if (S.scene === 'raid') raidEnd(true, true) })
    net.on('wave', (d) => { if (R && !R.host) { R.idx = d.idx; R.phase = d.phase; UI.setWave(d.text) } })
    net.onState((d) => { if (!R || R.host || S.scene !== 'raid') return; const prev = R.B ? new Map(R.B.hz.map((h) => [h.id, h])) : new Map(); R.idx = d.idx; R.B = { ...d.B, hz: d.B.hz.map((h) => { const o = prev.get(h.id); return o ? Object.assign(h, { _hit: o._hit, _used: o._used }) : h }) } })
    net.onMembers((m) => { for (const uid of [...others.keys()]) if (!m.find((x) => x.uid === uid)) others.delete(uid) })
  }
  function startRaid(mode, seed, isHost) {
    if (S.scene !== 'lobby' && S.scene !== 'raid') return
    const inParty = !!(net && net.code), members = inParty ? net.members() : [{ uid: myId() }], host = !inParty || net.isHost() || isHost === true
    if (inParty && host && isHost !== false) net.send('start', { mode, seed: seed || Math.random() })
    beginTransition(() => {
      enterScene('raid'); const list = mode === 'rush' ? CHAPTERS.map((c) => c.boss) : [mode.split(':')[1]]
      R = { mode, list, idx: 0, host: !inParty || net.isHost(), solo: !inParty || members.length <= 1, B: null, phase: 'prep', t: 0, n: Math.max(1, members.length), alive: {}, ended: false, hpLog: 0, netT: 0 }
      members.forEach((m) => (R.alive[m.uid] = true)); S.hp = S.maxHp; S.dead = false; UI.setHP(1); S.pot = 0
      if (R.host) spawnWave(0)
      UI.setObjective('Boss Rush', mode === 'rush' ? 'Defeat all five bosses. If everyone falls, the run resets.' : 'Defeat the boss'); UI.setBoss(null); UI.toast('Raid started. No checkpoints!')
    }, 'Entering the raid...')
  }
  function spawnWave(i) {
    const key = R.list[i], ramp = 1 + 0.12 * i, B2 = B.newBoss(key, 0, -12, -16, (1 + 0.6 * (R.n - 1)) * ramp, (1 + 0.1 * (R.n - 1)) * (1 + 0.07 * i)); R.B = B2; R.idx = i; R.phase = 'rise'; R.t = 0
    const text = `BOSS ${i + 1} / ${R.list.length}  |  ${B.BOSSES[key].name.toUpperCase()}`; UI.setWave(text); if (net && net.code) net.send('wave', { idx: i, phase: 'rise', text })
  }
  function raidTick(dt) {
    if (!R || R.ended) return; const T = R.B
    if (R.host) {
      R.t += dt
      if (R.phase === 'rise' && T) { T.y = mix(-16, 0, smooth(clamp(R.t / 3.5, 0, 1))); S.shake = Math.max(S.shake, 0.3 * (1 - R.t / 3.5)); if (R.t > 3.5) { R.phase = 'fight'; T.state = 'fight'; T.y = 0; UI.setBoss(1, B.BOSSES[T.key].name) } }
      else if (R.phase === 'fight' && T) {
        const tg = [{ x: S.px, z: S.pz, y: S.py, alive: !S.dead }]; others.forEach((o) => { if (R.alive[o.uid] !== false) tg.push({ x: o.x, z: o.z, y: 0, alive: true }) })
        B.bossTick(T, dt, tg, { H, fx: (f) => { FX.push({ t: 0, org: [f.x, (f.y || 0) + 0.4, f.z], col: f.c || [1, 0.6, 0.3], a: [2.4, 1, 0, 0], n: f.n || 60 }); if (f.shake) S.shake = Math.max(S.shake, f.shake) } })
        UI.setBoss(T.hp / T.max, B.BOSSES[T.key].name)
        if (T.hp <= 0) { T.state = 'dead'; R.phase = 'dead'; R.t = 0; FX.push({ t: 0, org: [T.x, 6, T.z], col: B.BOSSES[T.key].pal.lava, a: [3, 1, 0, 0], n: 200 }); S.shake = 1 }
      } else if (R.phase === 'dead' && T) { T.dead = clamp(R.t / 3, 0, 1); if (R.t > 3.2) { if (R.idx + 1 < R.list.length) { R.phase = 'between'; R.t = 0; T.hz = []; UI.setBoss(null); const heal = Math.round(S.maxHp * 0.3); S.hp = Math.min(S.maxHp, S.hp + heal); UI.setHP(S.hp / S.maxHp); const text = `Boss ${R.idx + 1} down. Next boss in 8s. +30% health`; UI.setWave(text); if (net && net.code) net.send('wave', { idx: R.idx, phase: 'between', text }) } else { raidEnd(true, false) } } }
      else if (R.phase === 'between') { if (R.t > 8) spawnWave(R.idx + 1) }
      R.netT += dt; if (net && net.code && R.netT > 0.12 && T) { R.netT = 0; net.state({ idx: R.idx, B: { key: T.key, x: T.x, z: T.z, y: T.y, yaw: T.yaw, hp: T.hp, max: T.max, state: T.state, stun: T.stun, arm: T.arm, atk: T.atk ? { kind: T.atk.kind, t: T.atk.t, dur: T.atk.dur } : null, phase: T.phase, dead: T.dead, flash: T.flash, hz: T.hz.map((h) => { const o = {}; for (const k in h) if (k[0] !== '_') o[k] = h[k]; return o }), vis: 1, cd: 0, t: T.t, dm: T.dm } }) }
    } else if (T) { B.stepHazards(T.hz, dt); T.t += dt; T.flash = Math.max(0, (T.flash || 0) - dt * 3); if (T.state === 'fight') UI.setBoss(T.hp / T.max, B.BOSSES[T.key].name); else UI.setBoss(null) }
    if (T && T.state === 'fight' && !S.dead) { const dmg = B.hazardDamage(T.hz, { x: S.px, z: S.pz, y: S.py, gy: H(S.px, S.pz) }); if (dmg > 0) hurt(dmg) }
    if (S.dead && S.scene === 'raid') UI.prompt(R && R.solo ? '' : 'You fell. Spectating your party...')
  }
  function checkRaidFail() { if (!R || R.ended) return; const alive = Object.values(R.alive).filter((v) => v !== false).length; if (alive <= 0) { if (net && net.code && R.host) net.send('fail', {}); raidEnd(false, false) } }
  function raidEnd(win, remote) {
    if (!R || R.ended) return; R.ended = true; UI.setBoss(null)
    if (win) { UI.setWave('RAID COMPLETE'); const loot = I.rollLoot('boss', 5).concat(I.rollLoot('gold', 5)); giveLoot(loot, 'Raid rewards'); if (net && net.code && !remote && R.host) net.send('win', {}); UI.toast('Raid cleared!', 5000) }
    else { UI.setWave('RUN FAILED  |  everything resets'); UI.toast('The raid failed. You return to the lobby.', 5000) }
    setTimeout(() => { if (dead) return; beginTransition(() => { R = null; enterScene('lobby'); S.hp = S.maxHp; UI.setHP(1) }, '') }, 4200)
  }

  // ---------------------------------------------------------------- transitions + hub/world logic
  function beginTransition(go, msg) { if (S.trans) return; S.trans = { t: 0, go: () => { go(); S.fade = 1; S.trans = null; S.flash = 1 } }; if (msg) UI.toast(msg) }
  function hubLogic() {
    let near = null
    for (const p of portals) { const l = [S.px - p.x, S.pz - p.z], q = [Math.cos(p.yaw) * l[0] - Math.sin(p.yaw) * l[1], Math.sin(p.yaw) * l[0] + Math.cos(p.yaw) * l[1]]; if (Math.abs(q[0]) < 2.2 && q[1] > -0.9 && q[1] < 1.3 && S.py < p.y + 3.5 && !S.trans) { if (p.theme.name === 'story') beginTransition(() => enterScene('world'), 'Entering the open world...'); else beginTransition(() => enterScene('lobby'), 'Opening the raid lobby...') } if (Math.hypot(S.px - p.x, S.pz - p.z) < 9) near = p }
    UI.prompt(near && !S.trans ? 'Walk into the portal to travel' : '')
  }
  const exitToHub = () => beginTransition(() => { R = null; enterScene('hub') }, 'Back to the hub')
  function lobbyLogic(inp) {
    const nearBoard = lobbyBoard && Math.hypot(S.px - lobbyBoard.x, S.pz - lobbyBoard.z) < 5.5
    UI.prompt(nearBoard ? (UI.coarse ? 'Tap Use to open the raid board' : 'Press E to open the raid board') : ''); if (nearBoard && inp.use) party.toggle(true)
    if (!nearBoard && party && party.isOpen() && Math.hypot(S.px - lobbyBoard.x, S.pz - lobbyBoard.z) > 14) party.toggle(false)
  }
  function worldLogic(dt, inp) {
    const c = curCh(), ph = phase()
    if (ph === 'collect') for (const p of pickups) if (!p.got && Math.hypot(S.px - p.x, S.pz - p.z) < 2.3 && Math.abs(S.py - p.y) < 3) collectPickup(p)
    if (ph === 'arena' && arenaC && Math.hypot(S.px - arenaC.x, S.pz - arenaC.z) < 36 && !S.cut) bossIntro(c)
    if (B1 && B1.state === 'fight') { B.bossTick(B1, dt, [{ x: S.px, z: S.pz, y: S.py, alive: true }], { H, fx: (f) => { FX.push({ t: 0, org: [f.x, (f.y || 0) + 0.4, f.z], col: f.c || [1, 0.6, 0.3], a: [2.4, 1, 0, 0], n: f.n || 60 }); if (f.shake) S.shake = Math.max(S.shake, f.shake) } }); UI.setBoss(B1.hp / B1.max, chapterBoss(c).name); const dmg = B.hazardDamage(B1.hz, { x: S.px, z: S.pz, y: S.py, gy: H(S.px, S.pz) }); if (dmg > 0) hurt(dmg); if (B1.hp <= 0) { B1.state = 'dead'; B1.hz = []; victoryCutscene(c) } }
    // chests and enemies
    chests.update(dt); const nc = chests.nearest(S.px, S.pz); let prompt = ''
    if (nc) { prompt = UI.coarse ? 'Tap Use to open the chest' : 'Press E to open the chest'; if (inp.use) { const loot = chests.open(nc); if (loot) { giveLoot(loot, nc.tier + ' chest'); FX.push({ t: 0, org: [nc.x, nc.y + 1, nc.z], col: [1, 0.85, 0.4], a: [1.8, 0.8, 0, 0], n: 100 }); save.opened = [...chests.opened]; persist() } } }
    let canTalk = false
    if (npc && Math.hypot(S.px - npc.x, S.pz - npc.z) < 3.4 && !(B1 && B1.state === 'fight')) { canTalk = true; prompt = UI.coarse ? 'Tap Use to talk' : 'Press E to talk'; if (inp.use) UI.say('Elder Pip', pipLine()) }
    UI.prompt(prompt)
    if (npc) { const dx = S.px - npc.x, dz = S.pz - npc.z; if (Math.hypot(dx, dz) < 12) npc.yaw = Math.atan2(dx, dz) }
    if (S.t - S.lastStream > 1.0) { S.lastStream = S.t; enemies.stream(S.px, S.pz, biome, avoidSpawn); chests.stream(S.px, S.pz, avoidSpawn) }
    enemies.update(dt, { x: S.px, z: S.pz, y: S.py, alive: !S.dead }, hurt)
    const eh = B.hazardDamage(enemies.hz, { x: S.px, z: S.pz, y: S.py, gy: H(S.px, S.pz) }); if (eh > 0) hurt(eh)
  }
  const pipLine = () => { const c = curCh(), ph = phase(), t = ['The beams of light mark what you seek.', 'Chests hide in the wild. Gold ones glow tall.', 'Press B for your backpack, and 1 to 6 for quick slots.', 'Mind the creatures near camps. Fight smart.']; if (ph === 'collect') return `Look for the ${c.pick.name}s near ${c.place}. ` + t[(S.t | 0) % t.length]; if (ph === 'arena') return `${chapterBoss(c).name} waits at ${c.place}. Gear up first!`; if (ph === 'done') return save.cur < 5 ? 'Open the Chapters list, little hero. The next story is waiting.' : 'The meadow is safe because of you.'; return 'Strike when its core glows!' }

  // ---------------------------------------------------------------- per-frame update
  const camState = { pos: [0, 5, 10], target: [0, 1, 0] }
  function update(dt, inp) {
    S.t += dt; S.hours = (S.hours + dt * 24 / (S.scene === 'world' ? 840 : 1500)) % 24
    S.hurt = Math.max(0, S.hurt - dt); S.atkCd = Math.max(0, S.atkCd - dt); S.pot = Math.max(0, S.pot - dt); S.shake = Math.max(0, S.shake - dt * 0.9); S.flash = Math.max(0, S.flash - dt * 2.5)
    if (S.atk > 0) { S.atk += dt; if (S.atk > 0.4) S.atk = 0 } if (S.fade > 0) S.fade = Math.max(0, S.fade - dt * 1.1)
    if (S.trans) { const T = S.trans; T.t += dt; S.flash = Math.min(1, T.t / 0.8); if (!T.done && T.t >= 0.85) { T.done = true; T.go() } }
    if (inp.exit && opts.onExit) { opts.onExit(); return }
    if (inp.hub && S.scene !== 'hub' && !S.trans) exitToHub()
    if (inp.pack) inv.toggle(); if (inp.chapters && S.scene === 'world') UI.toggleChapters(CHAPTERS, save, S, (n) => { if (!unlocked(n) || S.cut) return; setupChapter(n); if (!save.ch[n].done) chapterIntro(curCh()); UI.toggleChapters(null) })
    for (let i = 0; i < 6; i++) if (inp['slot' + i]) { const r = inv.useHot(i); if (r) { if (r.heal) usePotion(r.heal); else if (r.equipped) { UI.toast('Equipped ' + I.ITEMS[r.equipped].n); recalc() } } }
    if (S.cut) {
      const c = S.cut, sh = c.shots[c.i]; c.t += dt
      if (!c.said && sh.say) { c.said = true; UI.say(sh.say[0], sh.say[1]) } if (sh.title && c.t < 0.05) UI.title(sh.title[0], sh.title[1], true)
      const k = clamp(c.t / sh.dur, 0, 1), a = sh.a(), b = sh.b(), e = smooth(k)
      camState.pos = [lerp(a.p[0], b.p[0], e) + Math.sin(S.t * 1.3) * 0.05, lerp(a.p[1], b.p[1], e) + Math.sin(S.t * 1.7) * 0.05, lerp(a.p[2], b.p[2], e)]; camState.target = [lerp(a.t[0], b.t[0], e), lerp(a.t[1], b.t[1], e), lerp(a.t[2], b.t[2], e)]
      if (sh.fx) sh.fx(k)
      if (inp.use && UI.sayTyping()) UI.finishSay(); else if ((inp.use || inp.attack) && c.t > 0.6) c.t = sh.dur
      if (inp.skip) { UI.hideSay(); S.cut.i = c.shots.length }
      if (c.t >= sh.dur) { c.i++; c.t = 0; c.said = false; UI.hideSay(); UI.title('', '', false); if (c.i >= c.shots.length) endCut() }
      updateFX(dt); return
    }
    const chatting = party && party.chatFocus()
    if (!chatting && !S.dead) { // free control
      S.camYaw -= inp.yawD; S.camPitch = clamp(S.camPitch + inp.pitchD, -0.15, 1.2); S.camDist = clamp(S.camDist + inp.zoom * 0.8, 3.5, 14)
      const fwd = [-Math.sin(S.camYaw), -Math.cos(S.camYaw)], rgt = [Math.cos(S.camYaw), -Math.sin(S.camYaw)], mx = fwd[0] * inp.y + rgt[0] * inp.x, mz = fwd[1] * inp.y + rgt[1] * inp.x, ml = Math.hypot(mx, mz)
      const sp = (inp.run ? 9.2 : 5.8) * S.stats.speed * (S.atk > 0 ? 0.6 : 1), tvx = ml > 0.01 ? (mx / Math.max(ml, 1)) * sp : 0, tvz = ml > 0.01 ? (mz / Math.max(ml, 1)) * sp : 0, acc = S.onGround ? 14 : 5
      S.vx += (tvx - S.vx) * Math.min(1, acc * dt); S.vz += (tvz - S.vz) * Math.min(1, acc * dt)
      if (ml > 0.1) { const want = Math.atan2(tvx, tvz); let d = want - S.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; S.face += d * Math.min(1, dt * 14) }
      if (S.onGround && inp.jump) { S.vy = 7.6; S.onGround = false }
      if (inp.attack && S.scene !== 'hub' && S.scene !== 'lobby') playerAttack()
    } else { S.vx *= 0.8; S.vz *= 0.8 }
    S.moving = Math.hypot(S.vx, S.vz) / 6
    let nx = S.px + S.vx * dt, nz = S.pz + S.vz * dt
    for (const s of solids) { const dx = nx - s.x, dz = nz - s.z, r = s.r + 0.45, d2 = dx * dx + dz * dz; if (d2 < r * r) { const d = Math.sqrt(d2) || 0.001; nx = s.x + dx / d * r; nz = s.z + dz / d * r } }
    const gh = H(nx, nz), nrm = C.terrainN(nx, nz, 0.8), lim = S.scene === 'hub' ? 62 : S.scene === 'raid' ? 46 : S.scene === 'lobby' ? 46 : 1e9
    if ((S.scene === 'world' && gh < C.WORLD.water - 0.9) || nrm[1] < 0.5 || Math.hypot(nx, nz) > lim) { S.vx = S.vz = 0 } else { S.px = nx; S.pz = nz }
    const g = H(S.px, S.pz); S.vy -= 22 * dt; S.py += S.vy * dt; if (S.py <= g) { S.py = g; S.vy = 0; S.onGround = true } else if (S.py > g + 0.06) S.onGround = false
    S.bob += dt * (4 + S.moving * 9)
    if (S.stats.regen > 0 && !S.dead && S.hp < S.maxHp) { S.regenT += dt; if (S.regenT > 2) { S.regenT = 0; S.hp = Math.min(S.maxHp, S.hp + Math.round(S.stats.regen * 2)); UI.setHP(S.hp / S.maxHp) } }
    if (S.scene === 'hub') hubLogic(); else if (S.scene === 'world') worldLogic(dt, inp); else if (S.scene === 'lobby') lobbyLogic(inp); else if (S.scene === 'raid') raidTick(dt)
    if (S.scene === 'lobby' || S.scene === 'raid') { S.netT = (S.netT || 0) + dt; if (net && net.code && S.netT > 0.2) { S.netT = 0; net.pos({ x: S.px, z: S.pz, yaw: S.face, mv: Math.min(1, S.moving), name: myName, av: myBlook, hp: S.hp / S.maxHp, atk: S.atk > 0 ? S.atk / 0.4 : 0 }) } others.forEach((o) => { o.x += (o.tx - o.x) * Math.min(1, dt * 8); o.z += (o.tz - o.z) * Math.min(1, dt * 8); let d = (o.tyaw || 0) - o.yaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; o.yaw += d * Math.min(1, dt * 10) }) }
    if (S.t - S.lastTree > 0.5 || S.lastTree == null) { S.lastTree = S.t; if (S.scene === 'hub' || S.scene === 'world') { trees.update(S.px, S.pz, S.scene === 'hub' ? densityHub : densityWorld); solids = solids.filter((s) => !s.tree); trees.solids().forEach((s) => solids.push({ ...s, tree: true })) } }
    updateFX(dt)
    const tgt = [S.px, S.py + 1.0, S.pz], cp = Math.cos(S.camPitch), spch = Math.sin(S.camPitch)
    let cx = tgt[0] + Math.sin(S.camYaw) * cp * S.camDist, cy = tgt[1] + spch * S.camDist, cz = tgt[2] + Math.cos(S.camYaw) * cp * S.camDist; const cg = H(cx, cz) + 0.7; if (cy < cg) cy = cg
    camState.pos = [cx, cy, cz]; camState.target = tgt
  }
  function updateFX(dt) { for (let i = FX.length - 1; i >= 0; i--) { FX[i].t += dt; if (FX[i].t > 1.1) FX.splice(i, 1) } const T = B1; if (T && T.state === 'rise') T.t += dt }

  // ---------------------------------------------------------------- drawing
  const lightsList = () => {
    const out = [], d2 = (x, z) => Math.hypot(x - S.px, z - S.pz)
    if (S.scene === 'hub') portals.forEach((p) => { const fl = 0.85 + 0.15 * Math.sin(S.t * 7 + p.x) * Math.sin(S.t * 3.1); out.push([p.light[0], p.light[1], p.light[2], 26, p.theme.light[0] * fl, p.theme.light[1] * fl, p.theme.light[2] * fl, d2(p.x, p.z)]) })
    else if (S.scene === 'world') { if (bonfire) { const fl = 0.8 + 0.2 * Math.sin(S.t * 13) * Math.sin(S.t * 5.3) + 0.1 * Math.sin(S.t * 31); out.push([bonfire.x, bonfire.y + 1.4, bonfire.z, 17, 3.0 * fl, 1.25 * fl, 0.35 * fl, d2(bonfire.x, bonfire.z)]) }
      if (B1 && B1.state !== 'rise') { const L = B.BOSSES[B1.key].light; out.push([B1.x, B1.y + 6, B1.z, 38, L[0] + 0.5 * B1.flash + (B1.stun > 0 ? 0.3 : 0), L[1], L[2], d2(B1.x, B1.z) - 30]) }
      if (phase() === 'collect') pickups.forEach((s) => { if (!s.got) out.push([s.x, s.y + 1.6, s.z, 12, curCh().pick.col[0] * 1.4, curCh().pick.col[1] * 1.2, curCh().pick.col[2] * 1.2, d2(s.x, s.z) + 4]) }) }
    else { fires.forEach((f) => { const fl = 0.8 + 0.2 * Math.sin(S.t * 13 + f.x) * Math.sin(S.t * 5.3) + 0.1 * Math.sin(S.t * 29 + f.z); out.push([f.x, f.y + 0.6, f.z, 20, 3.0 * fl, 1.3 * fl, 0.4 * fl, d2(f.x, f.z)]) }); if (R && R.B && R.B.state !== 'dead') { const L = B.BOSSES[R.B.key].light; out.push([R.B.x, R.B.y + 6, R.B.z, 40, L[0] * 1.2 + 0.5 * R.B.flash, L[1] * 1.2, L[2] * 1.2, d2(R.B.x, R.B.z) - 40]) } }
    return out.sort((a, b) => a[7] - b[7]).slice(0, 2)
  }
  const weaponParts = (px, py, pz, face, atkK) => {
    const st = S.stats, w = I.ITEMS[st.weapon] || I.ITEMS.wood_sword, sw = atkK > 0 ? Math.sin(Math.min(1, atkK) * Math.PI) : 0, ang = face + 0.9 - sw * 2.2, out = [], off = rotLocal(face, 0.62, 0.78, 0.1), bx = px + off[0], by = py + off[1], bz = pz + off[2], tilt = 0.5 - sw * 1.1
    const rc = { common: [0.5, 0.5, 0.52], uncommon: [0.45, 0.8, 0.5], rare: [0.4, 0.65, 1.0], epic: [0.7, 0.4, 1.0], legendary: [1.0, 0.75, 0.2] }[w.r]
    if (w.kind === 'spear') { out.push({ mesh: 'cyl', model: M.trs(bx, by, bz, ang, 0.07, 1.9, 0.07, -tilt - 1.2, 0), mat: 4, tint: [0.2, 0.12, 0.06] }); out.push({ mesh: 'cone', model: M.trs(bx + Math.sin(ang) * 1.25 * Math.cos(tilt + 1.2), by + 1.2 * Math.sin(tilt + 1.2), bz + Math.cos(ang) * 1.25 * Math.cos(tilt + 1.2), ang, 0.16, 0.5, 0.06, -tilt - 1.2, 0), mat: 3, tint: rc, em: [0, 0, 0, 1.4] }) }
    else if (w.kind === 'hammer') { out.push({ mesh: 'cyl', model: M.trs(bx, by, bz, ang, 0.07, 1.2, 0.07, -tilt - 0.9, 0), mat: 4, tint: [0.2, 0.12, 0.06] }); out.push({ mesh: 'box', model: M.trs(bx + Math.sin(ang) * 0.85, by + 0.85, bz + Math.cos(ang) * 0.85, ang, 0.5, 0.36, 0.34, -tilt - 0.9, 0), mat: 1, tint: [0.25, 0.24, 0.23], p: [0.5, 0, 0, 0] }) }
    else { out.push({ mesh: 'box', model: M.trs(bx, by, bz, ang, 0.06, 0.95, 0.025, -tilt - 1.05, 0), mat: 3, tint: rc, em: [0, 0, 0, 0.9] }); out.push({ mesh: 'cyl', model: M.trs(bx, by - 0.05, bz, ang, 0.03, 0.32, 0.03, -tilt - 1.05, 0), mat: 4, tint: [0.2, 0.12, 0.06] }) }
    return out
  }
  function dynamicObjects() {
    const out = [], extras = []
    const sq = 1 + (S.onGround ? Math.abs(Math.sin(S.bob)) * 0.05 * Math.min(1, S.moving) : 0), bobY = S.onGround ? Math.abs(Math.sin(S.bob)) * 0.1 * Math.min(1, S.moving) : 0
    const atk = S.atk > 0 ? Math.sin(Math.min(1, S.atk / 0.4) * Math.PI) : 0, spin = S.atk > 0 ? S.atk / 0.4 * TAU : 0
    if (!S.dead) { out.push({ kind: 'avatar', id: myBlook, model: M.trs(S.px, S.py, S.pz, S.face, 1, 1, 1), anim: [S.t, Math.min(1, S.moving), S.atk > 0 ? S.atk / 0.4 : 0, -0.1 * Math.min(1, S.moving)], flash: S.hurt > 0 ? [1, 0.2, 0.1, Math.min(0.7, S.hurt)] : null, fallback: { mesh: 'cube', model: M.trs(S.px, S.py + 0.5 + bobY, S.pz, S.face + spin, 0.95 / sq, 0.95 * sq, 0.95 / sq, -0.18 * Math.min(1, S.moving) - atk * 0.25, Math.sin(S.bob) * 0.05 * Math.min(1, S.moving)), mat: 0, tint: [0.9, 0.55, 0.2], tex: 'player' } }); if (S.scene !== 'hub' && S.scene !== 'lobby') extras.push(...weaponParts(S.px, S.py, S.pz, S.face, S.atk > 0 ? S.atk / 0.4 : 0)) }
    if (S.scene === 'lobby' || S.scene === 'raid') others.forEach((o) => { if (performance.now() - o.t > 6000) return; out.push({ kind: 'avatar', id: o.av || 'toast', model: M.trs(o.x, H(o.x, o.z), o.z, o.yaw, 1, 1, 1), anim: [S.t, o.mv || 0, o.atk || 0, -0.1 * (o.mv || 0)], fallback: { mesh: 'cube', model: M.trs(o.x, H(o.x, o.z) + 0.5, o.z, o.yaw, 0.95, 0.95, 0.95), mat: 0, tint: [0.4, 0.6, 0.9], tex: 'player' } }) })
    if (npc) extras.push({ mesh: 'cube', model: M.trs(npc.x, npc.y + 0.62 + Math.sin(S.t * 2) * 0.02, npc.z, npc.yaw, 1.15, 1.2, 1.15), mat: 0, tint: [0.7, 0.5, 0.25], tex: 'pip' })
    const BB = S.scene === 'raid' ? R && R.B : B1; if (BB && (BB.state !== 'dead' || BB.dead < 1)) extras.push(...B.bossParts(BB, S.t))
    return { avatars: out, extras }
  }
  const projectTo = (vp, x, y, z) => { const r = M.proj(vp, x, y, z); if (r[2] <= 0.1) return null; return [(r[0] * 0.5 + 0.5) * root.clientWidth, (1 - (r[1] * 0.5 + 0.5)) * root.clientHeight, r[2]] }
  let atmo = null, fr = null, vpInfo = null
  function render() {
    const w = root.clientWidth, h = root.clientHeight; if (w < 4 || h < 4) return
    E.fov = 1.02; atmo = A.atmosphere(S.hours, S.cloud)
    const pos = camState.pos.slice(), tgt = camState.target.slice(); if (S.shake > 0) { const k = S.shake * 0.12; pos[0] += (Math.random() - 0.5) * k; pos[1] += (Math.random() - 0.5) * k; pos[2] += (Math.random() - 0.5) * k }
    const lights = lightsList(), sv = A.shadowMatrix(E, atmo, [S.px, S.py, S.pz], 46), wind = (0.85 + 0.4 * Math.sin(S.t * 0.13)) * (S.cloud > 0.6 ? 1.35 : 1)
    fr = { atmo, cam: { pos, target: tgt, fov: E.fov, aspect: w / h }, shadowVP: sv, groundY: H(pos[0], pos[2]), fogDensity: S.scene === 'hub' ? 0.0017 : S.scene === 'world' ? 0.0009 + 0.0005 * S.cloud : 0.0021, time: S.t, wind, lights, player: [S.px, S.py, S.pz], bendRadius: 1.5, flash: 0 }
    vpInfo = A.writeFrame(E, fr); ground.update(pos[0], pos[2], PATHF)
    const dyn = dynamicObjects(), all = statics
    const drawDyn = (shadow) => { for (const a of dyn.avatars) { if (!Av.draw(a.id, a.model, a.anim, shadow, a.flash)) O.draw(a.fallback, shadow) } for (const o of dyn.extras) O.draw(o, shadow) }
    const drawObjs = (shadow) => { for (const o of all) O.draw(o, shadow); drawDyn(shadow); if (S.scene === 'world') { for (const p of pickups) { if (p.got) continue; const bob = Math.sin(S.t * 2 + p.id) * 0.25; O.draw({ mesh: 'cube', model: M.trs(p.x, p.y + 1.6 + bob, p.z, S.t * 1.4, 0.55, 0.95, 0.55, 0.3, 0.2), mat: 3, tint: curCh().pick.col, em: [0, 0, 0, shadow ? 0 : 4.5] }, shadow) } enemies.draw(O, S.t, shadow); chests.draw(O, S.t, shadow) } }
    E.frame({
      exposure: atmo.exposure * (S.scene === 'world' && S.cloud > 0.6 ? 1.05 : 1), bloom: 0.55, flash: Math.max(S.flash, 0), fade: S.fade > 0 ? S.fade * 0.9 : 0, bars: S.cut ? 0.115 : 0, flashCol: [1, 0.9, 0.75],
      shadow() { trees.draw(true); drawObjs(true) },
      opaque() { E.drawTerrain(pos[0], pos[2], PATHF); grass.draw(pos[0], pos[2]); trees.draw(false); drawObjs(false) },
      transparent() { if (S.scene === 'world') O.water(); if (S.scene === 'hub') portals.forEach((p) => O.drawPortal(M.trs(p.cx, p.cy, p.cz, p.yaw, 1.78 * 1.3, 2.75 * 1.3, 1), p.theme.c0, p.theme.c1, p.theme.c2, 1)) },
      additive() {
        E.gl.depthMask(false); O.particles(1, 600, [0, 0, 0], [1, 1, 1]); if (atmo.night > 0.3) O.particles(3, S.scene === 'raid' || S.scene === 'lobby' ? 90 : 160, [0, 0, 0], [1, 1, 1])
        if (S.scene === 'hub') portals.forEach((p) => { O.particles(0, 300, [p.cx, p.cy, p.cz], p.theme.c1, [3.4, 0.72, 0, p.yaw]); O.drawRing(M.trs(p.x, p.y + 0.6, p.z, 0, 4.4, 1, 4.4), p.theme.c1, 0.5 + 0.2 * Math.sin(S.t * 2), 0.55) })
        if (S.scene === 'lobby' || S.scene === 'raid') { fires.forEach((f) => { O.particles(2, 50, [f.x, f.y, f.z], [1, 0.6, 0.2], [2.0, 1.0, 0, 0]) }); O.drawRing(M.trs(0, H(0, 0) + 0.45, 0, 0, S.scene === 'raid' ? 28 : 9, 1, S.scene === 'raid' ? 28 : 9), S.scene === 'raid' && R && R.B ? B.BOSSES[R.B.key].pal.lava : [0.3, 0.5, 1.0], 0.6 + 0.3 * Math.sin(S.t * 2), 0.45) }
        if (S.scene === 'world') {
          if (bonfire) { O.particles(2, 70, [bonfire.x, bonfire.y + 0.3, bonfire.z], [1, 0.6, 0.2], [2.4, 1.0, 0, 0]); O.particles(2, 22, [bonfire.x, bonfire.y + 1.2, bonfire.z], [1, 0.4, 0.1], [3.5, 0.25, 0, 0]) }
          const c = curCh(); if (phase() === 'collect') for (const s of pickups) if (!s.got) { O.draw({ mesh: 'cyl', model: M.trs(s.x, s.y, s.z, 0, 1.5, 70, 1.5), mat: 5, tint: c.pick.col, em: [0, 0, 0, 2.5], p: [1.0, 0, 0, 0] }); O.particles(2, 16, [s.x, s.y + 1.2, s.z], c.pick.col, [2.2, 0.35, 0, 0]) }
          if (phase() === 'arena' && arenaC) O.draw({ mesh: 'cyl', model: M.trs(arenaC.x, H(arenaC.x, arenaC.z), arenaC.z, 0, 3, 90, 3), mat: 5, tint: c.rune, em: [0, 0, 0, 2.0], p: [1.0, 0, 0, 0] })
          enemies.drawFX(O, S.t); chests.drawFX(O, S.t)
        }
        const BB = S.scene === 'raid' ? R && R.B : B1; if (BB) { B.bossFX(BB, O, H, S.t); if (BB.state === 'rise' || BB.dead) O.particles(2, 60, [BB.x, H(BB.x, BB.z), BB.z], [0.7, 0.55, 0.4], [6, 3, 0, 0]) }
        for (const f of FX) O.particles(4, f.n, f.org, f.col, f.a, f.t)
        E.gl.depthMask(true)
      },
    })
    // overlays
    for (const p of portals) { const pr = projectTo(vpInfo.vp, p.x, p.y + 7.3, p.z); UI.tag('p' + p.theme.name, pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr && pr[2] < 38 && S.scene === 'hub' && !S.cut, `${p.theme.label}<small>${p.theme.sub}</small>`) }
    if (npc) { const pr = projectTo(vpInfo.vp, npc.x, npc.y + 2.5, npc.z); UI.tag('pip', pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr && pr[2] < 22 && !S.cut, 'Elder Pip') } else UI.tag('pip', 0, 0, false)
    if (lobbyBoard) { const pr = projectTo(vpInfo.vp, lobbyBoard.x, lobbyBoard.y + 4.3, lobbyBoard.z); UI.tag('board', pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr && pr[2] < 40, 'Raid Board<small>Party | Boss Rush</small>') } else UI.tag('board', 0, 0, false)
    let ti = 0; if (S.scene === 'lobby' || S.scene === 'raid') others.forEach((o) => { if (ti > 3) return; const pr = projectTo(vpInfo.vp, o.x, H(o.x, o.z) + 2.1, o.z); UI.tag('o' + ti++, pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr && pr[2] < 60 && performance.now() - o.t < 6000, o.name || 'Player') }); for (; ti < 4; ti++) UI.tag('o' + ti, 0, 0, false)
    const near = S.scene === 'world' && !S.cut ? enemies.list.filter((e) => e.st !== 'dead' && Math.hypot(e.x - S.px, e.z - S.pz) < 22).sort((a, b) => Math.hypot(a.x - S.px, a.z - S.pz) - Math.hypot(b.x - S.px, b.z - S.pz)).slice(0, 5) : []
    for (let i = 0; i < 5; i++) { const e = near[i]; const pr = e ? projectTo(vpInfo.vp, e.x, e.y + (e.T.fly ? 1.4 : 2.0), e.z) : null; UI.tag('e' + i, pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr, e ? `${e.T.name}<span class="rm-hpb"><i style="width:${Math.max(0, e.hp / e.max) * 100}%"></i></span>` : '') }
    let target = null, label = ''; if (S.scene === 'world' && !S.cut) { const ph = phase(); if (ph === 'collect') { let best = 1e9; for (const s of pickups) if (!s.got) { const d = Math.hypot(s.x - S.px, s.z - S.pz); if (d < best) { best = d; target = [s.x, s.y + 2.5, s.z]; label = Math.round(d) + ' m' } } } else if (ph === 'arena' && arenaC) { target = [arenaC.x, H(arenaC.x, arenaC.z) + 8, arenaC.z]; label = Math.round(Math.hypot(arenaC.x - S.px, arenaC.z - S.pz)) + ' m' } }
    const pr = target ? projectTo(vpInfo.vp, target[0], target[1], target[2]) : null; if (pr) { pr[0] = clamp(pr[0], 30, root.clientWidth - 30); pr[1] = clamp(pr[1], 80, root.clientHeight - 90) } UI.mark('obj', '#ffb25a', pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr, label)
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now(), scale = Math.min(window.devicePixelRatio || 1, UI.coarse ? 1.25 : 1.5), maxScale = scale, acc = 0, nF = 0
  const resize = () => { const w = root.clientWidth, h = root.clientHeight, W = Math.max(2, Math.round(w * scale)), Hh = Math.max(2, Math.round(h * scale)); if (W !== E.w || Hh !== E.h) E.resize(W, Hh) }
  function frame(now, manualDt) {
    if (dead) return
    const dt = manualDt != null ? manualDt : Math.min(0.05, (now - last) / 1000); last = now
    const inp = UI.poll(); resize(); if (manualDt == null && now) { acc += dt; nF++; if (nF === 40) { const ft = acc / nF; if (ft > 0.027 && scale > 0.55) scale = Math.max(0.55, scale * 0.85); else if (ft < 0.014 && scale < maxScale) scale = Math.min(maxScale, scale * 1.1); acc = 0; nF = 0 } }
    try { update(dt, inp); render() } catch (e) { console.error(e); if (!frame.err) { frame.err = true; UI.toast('Render error: ' + String(e.message).slice(0, 80)) } }
    if (manualDt == null) raf = requestAnimationFrame(frame)
  }
  party = window.__RealmParty.createParty(UI, null, { inRaid: () => S.scene === 'raid', chapters: () => CHAPTERS.filter((c) => unlocked(c.n)).map((c) => ({ key: c.boss, name: B.BOSSES[c.boss].name })), start: (mode) => { if (net && net.code && !net.isHost()) return; startRaid(mode, Math.random(), true); party.toggle(false) } })
  UI.onPartyToggle = () => { if (S.scene === 'lobby') { if (!party._net && net) rebuildParty(); party.toggle() } }
  function rebuildParty() { party.destroy(); party = window.__RealmParty.createParty(UI, net, { inRaid: () => S.scene === 'raid', chapters: () => CHAPTERS.filter((c) => unlocked(c.n)).map((c) => ({ key: c.boss, name: B.BOSSES[c.boss].name })), start: (mode) => { if (net && net.code && !net.isHost()) return; startRaid(mode, Math.random(), true); party.toggle(false) } }); party._net = net }
  if (opts.net) { net = opts.net; party._net = net; rebuildParty() }
  enterScene(opts.startScene || 'hub'); if (S.scene === 'lobby' && net) rebuildParty()
  if (!debug) raf = requestAnimationFrame(frame)
  const kd = (e) => { if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return; if (e.code === 'KeyB' || e.code === 'KeyI') UI.state.pack = true; if (e.code === 'KeyC') UI.state.chapters = true; const m = /^Digit([1-6])$/.exec(e.code); if (m) UI.state['slot' + (m[1] - 1)] = true }
  addEventListener('keydown', kd)
  const onVis = () => { last = performance.now() }; document.addEventListener('visibilitychange', onVis)
  const api = {
    dispose() { dead = true; cancelAnimationFrame(raf); removeEventListener('keydown', kd); document.removeEventListener('visibilitychange', onVis); try { net && net.leave && net.code && net.leave() } catch {} party.destroy(); inv.dispose(); UI.destroy(); root.remove() },
    _S: S, _save: save, enterScene, logic(n = 1, dt = 1 / 30, inp) { for (let i = 0; i < n; i++) update(dt, Object.assign({ x: 0, y: 0, run: false, jump: false, attack: false, use: false, yawD: 0, pitchD: 0, skip: false, hub: false, exit: false, zoom: 0 }, inp || {})) }, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(0, dt) },
    teleport(x, z) { S.px = x; S.pz = z; S.py = H(x, z) }, setHours(h) { S.hours = h }, camera: camState, UI, inv, enemies, chests, party: () => party, net: () => net, raid: () => R, boss: () => B1, pickups: () => pickups, others, CHAPTERS, setChapter: (n) => { setupChapter(n) }, startRaid, unlocked, setDone: (n) => { save.ch[n].done = true; persist() },
  }
  return api
}
window.OrangetRealm = { create }
})()
;
