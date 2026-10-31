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
let MODE = 0 // 0 = hub meadow, 1 = open world
const WORLD = { water: -5, start: [0, 0], altar: [520, -420], lake: [-250, 190] }
function terrainH(x, z) {
  if (MODE === 0) {
    const r = len2(x, z), n = fbm(x * 0.025, z * 0.025, 4)
    let h = (n - 0.5) * 1.6 * sstep(4, 30, r)
    h += sstep(34, 78, r) * (7 + 26 * fbm(x * 0.012 + 3.1, z * 0.012 + 3.1, 4))
    h += sstep(150, 420, r) * 70 * fbm(x * 0.004 + 9, z * 0.004 + 9, 5)
    return h
  }
  const c = fbm(x * 0.0011 + 1.3, z * 0.0011 + 1.3, 5), m = fbm(x * 0.003 + 7.7, z * 0.003 + 7.7, 5)
  let rg = 1 - Math.abs(2 * fbm(x * 0.0042 + 2, z * 0.0042 + 2, 5) - 1); rg *= rg
  let h = (c - 0.5) * 46 + (m - 0.5) * 26 + sstep(0.5, 0.72, c) * rg * 190
  const qx = x + 250, qz = z - 190; h -= 26 * Math.exp(-(qx * qx + qz * qz) / (110 * 110))
  const ax = x - 520, az = z + 420; h += 38 * Math.exp(-(ax * ax + az * az) / (140 * 140))
  h = mix((m - 0.5) * 2.5, h, sstep(45, 170, len2(x, z)))
  h = mix(30, h, sstep(34, 70, len2(ax, az)))
  return h
}
function terrainN(x, z, e = 0.6) { const dx = terrainH(x - e, z) - terrainH(x + e, z), dz = terrainH(x, z - e) - terrainH(x, z + e), l = Math.hypot(dx, 2 * e, dz); return [dx / l, 2 * e / l, dz / l] }
const waterY = () => (MODE === 1 ? WORLD.water : -1000)

// ---------------------------------------------------------------- GLSL prelude shared by every program
const GLSL_HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DShadow;
layout(std140) uniform G {
  mat4 uVP; mat4 uShadowVP; vec4 uCam; vec4 uSunDir; vec4 uSunCol; vec4 uSkyAmb; vec4 uGndAmb; vec4 uFog; vec4 uTime;
  vec4 uZenith; vec4 uHorizon; vec4 uPL0p; vec4 uPL0c; vec4 uPL1p; vec4 uPL1c; vec4 uPlayer; vec4 uCR; vec4 uCU; vec4 uCF; vec4 uMoon; vec4 uExtra;
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
  float c = fbm(p*0.0011+1.3,5), m = fbm(p*0.003+7.7,5);
  float rg = 1.0-abs(2.0*fbm(p*0.0042+2.0,5)-1.0); rg*=rg;
  float h = (c-0.5)*46.0 + (m-0.5)*26.0 + smoothstep(0.5,0.72,c)*rg*190.0;
  vec2 q = p-vec2(-250.0,190.0); h -= 26.0*exp(-dot(q,q)/(110.0*110.0));
  vec2 a = p-vec2(520.0,-420.0); h += 38.0*exp(-dot(a,a)/(140.0*140.0));
  h = mix((m-0.5)*2.5, h, smoothstep(45.0,170.0,length(p)));
  h = mix(30.0, h, smoothstep(34.0,70.0,length(a)));
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
window.__RealmCore = { M, clamp, mix, sstep, len2, TAU, ihash, vnoise, fbm, terrainH, terrainN, waterY, WORLD, GLSL_HEAD, GLSL_NOISE, GLSL_LIGHT, setMode: (m) => { MODE = m }, getMode: () => MODE }
})()
;
(function () {
'use strict'
const C = window.__RealmCore, { M, clamp, mix, sstep } = C
const { GLSL_HEAD, GLSL_NOISE, GLSL_LIGHT } = C

// forest density (same formula as forestD in GLSL)
const forestAt = (x, z, h) => C.getMode() === 0 ? 0 : sstep(0.5, 0.6, C.fbm(x * 0.0065 + 30, z * 0.0065 + 30, 4)) * sstep(55, 130, Math.hypot(x, z)) * (1 - sstep(130, 175, h)) * (1 - sstep(110, 60, Math.hypot(x - 520, z + 420)))

const GLSL_GROUND = `
uniform vec2 uPath[8];
float pathD(vec2 p){ if (MODE < 0.5) return 1e9; p += vec2(vnoise(p*0.05)-0.5, vnoise(p*0.05+9.0)-0.5)*7.0; float d=1e9; for(int i=0;i<7;i++){ vec2 a=uPath[i], b=uPath[i+1], pa=p-a, ba=b-a; float t=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); d=min(d,length(pa-ba*t)); } return d; }
float forestD(vec2 p, float h){ if (MODE < 0.5) return 0.0; return smoothstep(0.5,0.6,fbm(p*0.0065+30.0,4)) * smoothstep(55.0,130.0,length(p)) * (1.0-smoothstep(130.0,175.0,h)) * (1.0-smoothstep(110.0,60.0,length(p-vec2(520.0,-420.0)))); }
vec3 groundAlbedo(vec2 p, float h, vec3 N, out float grassAmt){
  float slope = 1.0 - N.y;
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
  const E = { gl, canvas, hasFloat, w: 2, h: 2, q: opts.quality || 2, draw: null }
  // ---- global uniform block
  const GF = new Float32Array(108), ubo = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, ubo); gl.bufferData(gl.UNIFORM_BUFFER, GF.byteLength, gl.DYNAMIC_DRAW); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo)
  E.G = GF; E.pushG = () => { gl.bindBuffer(gl.UNIFORM_BUFFER, ubo); gl.bufferSubData(gl.UNIFORM_BUFFER, 0, GF) }
  const set4 = (o, a, b, c, d) => { GF[o] = a; GF[o + 1] = b; GF[o + 2] = c; GF[o + 3] = d }
  E.setVec = set4
  // offsets (floats): VP0 SVP16 CAM32 SUNDIR36 SUNCOL40 SKYAMB44 GNDAMB48 FOG52 TIME56 ZEN60 HOR64 PL0P68 PL0C72 PL1P76 PL1C80 PLAYER84 CR88 CU92 CF96 MOON100 EXTRA104
  E.OFF = { VP: 0, SVP: 16, CAM: 32, SUNDIR: 36, SUNCOL: 40, SKYAMB: 44, GNDAMB: 48, FOG: 52, TIME: 56, ZEN: 60, HOR: 64, PL0P: 68, PL0C: 72, PL1P: 76, PL1C: 80, PLAYER: 84, CR: 88, CU: 92, CF: 96, MOON: 100, EXTRA: 104 }
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
    gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, 'G'), 0); return { p, win: gl.getUniformLocation(p, 'uWin'), path: gl.getUniformLocation(p, 'uPath') } })()
  const vao = gl.createVertexArray(); let ox = 1e9, oz = 1e9, key = ''
  const api = {
    size: SIZE, tex0: t0, tex1: t1, ox: 0, oz: 0,
    update(camX, camZ, path, force) {
      const k = C.getMode() + ':' + (force || ''); const sx = Math.floor(camX / 16) * 16, sz = Math.floor(camZ / 16) * 16
      if (!force && k === key && Math.abs(camX - ox) < 32 && Math.abs(camZ - oz) < 32) return
      key = k; ox = sx; oz = sz; api.ox = sx - SIZE / 2; api.oz = sz - SIZE / 2
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, RES, RES); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE)
      gl.useProgram(P.p); gl.uniform4f(P.win, api.ox, api.oz, SIZE, 0); if (path) gl.uniform2fv(P.path, path)
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
in vec3 aPos; in vec3 aNrm; in vec2 aUV; uniform mat4 uModel;
out vec3 vWP; out vec3 vN; out vec2 vUV; out vec3 vLP;
void main(){ vec4 w = uModel * vec4(aPos,1.0); vWP = w.xyz; vN = normalize(mat3(uModel)*aNrm); vUV = aUV; vLP = aPos; gl_Position = uVP * w; }`
const OBJ_FS = `
in vec3 vWP; in vec3 vN; in vec2 vUV; in vec3 vLP; out vec4 o;
uniform int uMat; uniform vec3 uTint; uniform vec4 uEm; uniform vec4 uP; uniform sampler2D uTex;
float rune(vec2 uv){ vec2 c = floor(uv); vec2 f = fract(uv); float h = hash2(ivec2(c)); float m = 0.0;
  float bar = 0.13; vec2 q = abs(f-0.5);
  if (h > 0.15) m = max(m, step(q.x, bar*0.5)*step(q.y,0.36));
  if (h > 0.4)  m = max(m, step(q.y, bar*0.5)*step(q.x,0.30));
  if (h > 0.62) m = max(m, step(abs(f.x-f.y), bar*0.7)*step(q.x,0.33));
  if (h > 0.78) m = max(m, step(abs(f.x+f.y-1.0), bar*0.7)*step(q.x,0.33));
  if (h > 0.9)  m = max(m, 1.0-smoothstep(0.07,0.13,length(f-0.5)));
  return m; }
void main(){
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
    alb *= 1.0 - crack*0.5;
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
      obj.m4('uModel', o.model); obj.i1('uMat', o.mat | 0); obj.f3('uTint', ...(o.tint || [1, 1, 1])); const em = o.em || [0, 0, 0, 0]; obj.f4('uEm', em[0], em[1], em[2], em[3]); const pp = o.p || [1, 1, 0, 0]; obj.f4('uP', pp[0], pp[1], pp[2], pp[3])
      const m = meshes[o.mesh]; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); gl.bindVertexArray(null)
    },
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
  const btns = el('div', 'rm-btns', '', top), bHub = el('button', 'rm-btn', 'Hub', btns), bExit = el('button', 'rm-btn', 'Exit', btns)
  const boss = el('div', 'rm-boss', '<div class="rm-lbl" style="font-size:16px;letter-spacing:.2em">MEADOW TITAN</div><div class="rm-bar"><i></i></div>', ui), bossBar = boss.querySelector('i')
  const dlg = el('div', 'rm-dlg', '<b></b><p></p><small>E / tap to continue</small>', ui), dWho = dlg.querySelector('b'), dTxt = dlg.querySelector('p')
  const prompt = el('div', 'rm-prompt', '', ui), title = el('div', 'rm-title', '<h1></h1><p></p>', ui), toast = el('div', 'rm-toast', '', ui)
  const skip = el('button', 'rm-btn rm-skip', 'Skip', ui)
  const help = el('div', 'rm-help', coarse ? '' : 'WASD move · Shift run · Space jump · J / click attack · E talk · drag to look', ui)
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
  press(bJump, () => (state.jump = true)); press(bAtk, () => (state.attack = true)); press(bUse, () => (state.use = true)); skip.onclick = () => (state.skip = true); bHub.onclick = () => (state.hub = true); bExit.onclick = () => (state.exit = true)
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
      const o = { x, y, run: keys.has('ShiftLeft') || keys.has('ShiftRight') || (stick._v && Math.hypot(...stick._v) > 0.92), jump: state.jump, attack: state.attack, use: state.use, yawD: state.yawD, pitchD: state.pitchD, skip: state.skip, hub: state.hub, exit: state.exit, zoom: state.zoom || 0 }
      state.jump = state.attack = state.use = state.skip = state.hub = state.exit = false; state.yawD = state.pitchD = 0; state.zoom = 0; return o
    },
    setHP(f) { hp.style.width = Math.max(0, Math.min(1, f)) * 100 + '%' },
    setObjective(t, sub) { objT.textContent = t || ''; objS.textContent = sub || '' }, showHUD(on) { top.style.display = on ? 'flex' : 'none'; help.style.display = on ? 'block' : 'none'; if (coarse) { stick.style.display = on ? 'block' : 'none'; act.style.display = on ? 'flex' : 'none' } },
    setBoss(f) { boss.style.display = f == null ? 'none' : 'block'; if (f != null) bossBar.style.width = Math.max(0, f) * 100 + '%' },
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
const C = window.__RealmCore, GL = window.__RealmGL, A = window.__RealmAtmo, { M, clamp, mix, sstep } = C
const H = (x, z) => C.terrainH(x, z), TAU = Math.PI * 2, V3 = { len: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) }
const smooth = (t) => t * t * (3 - 2 * t), lerp = mix
const PATH = [[0, 0], [80, -60], [200, -120], [330, -230], [440, -330], [520, -420], [520, -420], [520, -420]]
const PATHF = new Float32Array(PATH.flat())
const ALTAR = [520, -420], CAMP = [0, 0], HUBP = { story: [-10.5, -15], raid: [10.5, -15] }
function pathDist(x, z) { x += (C.vnoise(x * 0.05, z * 0.05) - 0.5) * 7; z += (C.vnoise(x * 0.05 + 9, z * 0.05 + 9) - 0.5) * 7; let d = 1e9; for (let i = 0; i < 7; i++) { const a = PATH[i], b = PATH[i + 1], px = x - a[0], pz = z - a[1], bx = b[0] - a[0], bz = b[1] - a[1], den = bx * bx + bz * bz || 1, t = clamp((px * bx + pz * bz) / den, 0, 1); d = Math.min(d, Math.hypot(px - bx * t, pz - bz * t)) } return d }

// canvas textures for the NPC
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

function create(parent, opts = {}) {
  injectGuard()
  const root = document.createElement('div'); root.className = 'rm-root'; parent.appendChild(root)
  const canvas = document.createElement('canvas'); root.appendChild(canvas)
  const UI = window.__RealmUI.createUI(root, opts)
  let E, ground, grass, trees, O, raf = 0, dead = false
  const debug = !!opts.debug
  try {
    E = GL.createEngine(canvas, { quality: opts.quality || (UI.coarse ? 1 : 2), debug })
    ground = window.__RealmGrass.createGround(E); grass = window.__RealmGrass.createGrass(E, ground); trees = window.__RealmTrees.createTrees(E); O = window.__RealmObjects.createObjects(E)
  } catch (e) { console.error(e); UI.error(String(e.message || e).slice(0, 400)); return { dispose() { UI.destroy(); root.remove() } } }

  // ---- textures
  const loadAvatar = () => { O.setTexture('player', fallbackAvatar()); if (!opts.avatar) return; const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#ff9a2e'; g.fillRect(0, 0, 256, 256); const r = Math.min(256 / im.width, 256 / im.height); g.drawImage(im, (256 - im.width * r) / 2, (256 - im.height * r) / 2, im.width * r, im.height * r); O.setTexture('player', c) } catch {} }; im.src = opts.avatar }
  loadAvatar(); O.setTexture('pip', pipTexture())

  // ---------------------------------------------------------------- state
  const SAVE = 'oranget_realm_story'
  let save = { stage: 0, shards: [] }; try { save = { ...save, ...JSON.parse(localStorage.getItem(SAVE) || '{}') } } catch {}
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)) } catch {} }
  const S = { scene: 'hub', t: 0, hours: 10.5, cloud: 0.35, px: 0, py: 0, pz: 8, vy: 0, vx: 0, vz: 0, face: Math.PI, moving: 0, hp: 100, atk: 0, atkCd: 0, camYaw: 0, camPitch: 0.32, camDist: 7, flash: 0, fade: 1, shake: 0, trans: null, cut: null, free: true, bob: 0, onGround: true, hurt: 0, lastTreeUpdate: 0, bossDead: false }
  const FX = [] // short particle bursts {t, org, col, a, n}
  let solids = [], statics = [], portals = [], shards = [], npc = null, titan = null, bonfire = null, altar = null, marks = {}
  const heightAt = (x, z) => H(x, z)

  // ---------------------------------------------------------------- building blocks
  const stoneTint = [0.20, 0.19, 0.18]
  function rotLocal(yaw, lx, ly, lz) { const c = Math.cos(yaw), s = Math.sin(yaw); return [c * lx + s * lz, ly, -s * lx + c * lz] }
  function buildPortal(x, z, yaw, theme) {
    const y = H(x, z), parts = [], em = theme.rune, rr = (a, b) => a + (b - a) * Math.random()
    const SC = 1.3, add = (mesh, lx, ly, lz, ry, sx, sy, sz, rz, tint, emv) => { lx *= SC; ly *= SC; lz *= SC; sx *= SC; sy *= SC; sz *= SC; const p = rotLocal(yaw, lx, ly, lz); parts.push({ mesh, model: M.trs(x + p[0], y + p[1], z + p[2], yaw + ry, sx, sy, sz, 0, rz), mat: 1, tint: tint || stoneTint, em: emv || [em[0], em[1], em[2], 0], p: [1, 0, 0, 0] }) }
    add('cyl', 0, -0.05, 0, 0, 9.0, 0.45, 9.0, 0, [0.16, 0.155, 0.15]); add('cyl', 0, 0.3, 0, 0, 7.2, 0.18, 7.2, 0, [0.22, 0.21, 0.2], [em[0], em[1], em[2], 1.3])
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) add('box', s * 2.45 + rr(-0.05, 0.05), 0.45 + 1.2 * k + 0.6, rr(-0.04, 0.04), rr(-0.03, 0.03), 1.25 + rr(-0.05, 0.05), 1.22, 1.35, rr(-0.02, 0.02), null, [em[0], em[1], em[2], k === 1 ? 1.3 : 0.9])
    const cy = 4.1; for (let i = 0; i < 9; i++) { const a = Math.PI - (i + 0.5) / 9 * Math.PI, rx = Math.cos(a) * 2.45, ry = cy + Math.sin(a) * 2.45; add('box', rx, ry, 0, 0, 1.05, 1.28, 1.35, a - Math.PI / 2 + rr(-0.02, 0.02), null, [em[0], em[1], em[2], 1.1]) }
    add('box', 0, cy + 2.95, 0, 0, 1.5, 0.9, 1.5, 0, [0.24, 0.23, 0.22], [em[0], em[1], em[2], 1.6]) // keystone
    return { x, z, y, yaw, theme, parts, cx: x, cy: y + 2.85 * SC, cz: z, light: [x + Math.sin(yaw) * 3.4, y + 3.6, z + Math.cos(yaw) * 3.4] }
  }
  const mkSolid = (x, z, r) => solids.push({ x, z, r })

  // ---------------------------------------------------------------- scenes
  function densityHub(x, z, h) { const r = Math.hypot(x, z); if (r < 40) return 0; for (const p of portals) if (Math.hypot(x - p.x, z - p.z) < 11) return 0; return Math.min(0.9, (r - 40) / 36) * 0.78 + (C.fbm(x * 0.03, z * 0.03, 2) > 0.62 && r < 70 ? 0.15 : 0) }
  densityHub.species = (x, z, h) => (h > 26 || C.fbm(x * 0.02 + 5, z * 0.02, 2) > 0.62 ? 1 : 0)
  function densityWorld(x, z, h) {
    if (h < C.WORLD.water + 1.2) return 0; if (Math.hypot(x - CAMP[0], z - CAMP[1]) < 20) return 0; if (Math.hypot(x - ALTAR[0], z - ALTAR[1]) < 48) return 0; if (pathDist(x, z) < 5) return 0
    const f = GL.forestAt(x, z, h); return clamp(0.05 + f * 0.95, 0, 1) * (1 - sstep(150, 190, h))
  }
  densityWorld.species = (x, z, h) => (h > 58 || C.fbm(x * 0.012 + 40, z * 0.012, 2) > 0.58 ? 1 : 0)

  function enterScene(name, spawn) {
    S.scene = name; C.setMode(name === 'world' ? 1 : 0); solids = []; statics = []; portals = []; shards = []; npc = null; titan = null; bonfire = null; altar = null; FX.length = 0
    ground.update(0, 0, PATHF, 'scene' + name + Date.now())
    if (name === 'hub') {
      S.hours = 10.5; S.cloud = 0.35
      portals.push(buildPortal(HUBP.story[0], HUBP.story[1], Math.atan2(-HUBP.story[0] * 0.3, 15) * 0 + 0.22, { name: 'story', rune: [1.0, 0.52, 0.14], c0: [0.35, 0.06, 0.0], c1: [1.0, 0.5, 0.1], c2: [1.0, 0.85, 0.55], light: [3.2, 1.35, 0.35], label: 'Story Mode', sub: 'Open World' }))
      portals.push(buildPortal(HUBP.raid[0], HUBP.raid[1], -0.22, { name: 'raid', rune: [0.35, 0.5, 1.0], c0: [0.01, 0.02, 0.22], c1: [0.18, 0.32, 1.0], c2: [0.5, 0.65, 1.0], light: [0.7, 1.0, 3.2], label: 'Raid Lobby', sub: 'Fight with friends' }))
      portals.forEach((p) => { statics.push(...p.parts); for (const s of [-1, 1]) { const q = rotLocal(p.yaw, s * 2.45 * 1.3, 0, 0); mkSolid(p.x + q[0], p.z + q[2], 1.2) } })
      // a few boulders and a stone ring in the meadow
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.3, r = 24 + (i % 3) * 5, x = Math.cos(a) * r, z = Math.sin(a) * r + 6; if (Math.hypot(x - HUBP.story[0], z - HUBP.story[1]) < 8 || Math.hypot(x - HUBP.raid[0], z - HUBP.raid[1]) < 8) continue; const sc = 0.8 + (i % 4) * 0.45, y = H(x, z); statics.push({ mesh: 'sphere', model: M.trs(x, y + sc * 0.2, z, i, sc * 1.6, sc * 0.9, sc * 1.3, 0.2 * i, 0.1), mat: 1, tint: [0.2, 0.19, 0.18], p: [0.7, 0, 0, 0] }); mkSolid(x, z, sc * 0.75) }
      S.px = 0; S.pz = 9; S.camYaw = 0; S.camPitch = 0.3; S.camDist = 7.5
      trees.update(S.px, S.pz, densityHub, true)
      UI.setObjective('Choose a portal', 'Walk into one to travel'); UI.setBoss(null)
    } else {
      S.hours = save.stage >= 3 ? 18.2 : 8.4; S.cloud = 0.45
      const gy = H(CAMP[0], CAMP[1])
      bonfire = { x: 3.2, z: 2.4, y: H(3.2, 2.4) }; mkSolid(bonfire.x, bonfire.z, 1.2)
      for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, x = bonfire.x + Math.cos(a) * 1.25, z = bonfire.z + Math.sin(a) * 1.25; statics.push({ mesh: 'sphere', model: M.trs(x, H(x, z) + 0.15, z, a, 0.55, 0.38, 0.5), mat: 1, tint: [0.2, 0.19, 0.18], p: [0.5, 0, 0, 0] }) }
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4; statics.push({ mesh: 'cyl', model: M.trs(bonfire.x, bonfire.y + 0.3, bonfire.z, a, 0.2, 1.3, 0.2, 0, 1.15), mat: 4, tint: [0.09, 0.05, 0.025] }) }
      ;[[-4.5, 3.5], [-5.6, 2.4], [6.6, -3.2]].forEach(([x, z], i) => { const y = H(x, z); statics.push({ mesh: 'box', model: M.trs(x, y + 0.45, z, 0.3 + i, 0.9, 0.9, 0.9), mat: 4, tint: [0.16, 0.095, 0.045] }); mkSolid(x, z, 0.65) })
      const pn = [5.2, -1.0]; npc = { x: pn[0], z: pn[1], y: H(pn[0], pn[1]), yaw: -1.9 }; mkSolid(pn[0], pn[1], 0.7)
      // Sun Shards
      const nominal = [[120, -75], [-150, -70], [250, -190], [330, -70], [410, -285]]
      nominal.forEach((n, i) => { let best = null; for (let r = 0; r < 60 && !best; r += 6) for (let a = 0; a < 12 && !best; a++) { const x = n[0] + Math.cos(a * 0.52) * r, z = n[1] + Math.sin(a * 0.52) * r, h = H(x, z), nn = C.terrainN(x, z, 1.0); if (h > C.WORLD.water + 1.5 && nn[1] > 0.9 && h < 110) best = [x, z] } best = best || n; shards.push({ id: i, x: best[0], z: best[1], y: H(best[0], best[1]), got: save.shards.includes(i) }) })
      // altar + standing stones
      const ay = H(ALTAR[0], ALTAR[1]); altar = { x: ALTAR[0], z: ALTAR[1], y: ay }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, x = ALTAR[0] + Math.cos(a) * 15, z = ALTAR[1] + Math.sin(a) * 15, y = H(x, z); statics.push({ mesh: 'box', model: M.trs(x, y + 3.0, z, a + Math.PI / 2, 1.9, 6.4, 1.2, 0.04 * (i % 3 - 1), 0.05 * (i % 2 - 0.5)), mat: 1, tint: [0.2, 0.19, 0.18], em: [1.0, 0.5, 0.12, 1.0], p: [1, 0, 0, 0] }); mkSolid(x, z, 1.1) }
      statics.push({ mesh: 'box', model: M.trs(ALTAR[0], ay + 0.7, ALTAR[1], 0, 5, 1.4, 2.6), mat: 1, tint: [0.22, 0.21, 0.2], em: [1.0, 0.5, 0.12, 1.2], p: [1, 0, 0, 0] }); mkSolid(ALTAR[0], ALTAR[1], 3)
      statics.push({ mesh: 'cyl', model: M.trs(ALTAR[0], ay - 0.1, ALTAR[1], 0, 40, 0.3, 40), mat: 1, tint: [0.15, 0.145, 0.14], em: [1.0, 0.5, 0.12, 0.7], p: [1, 0, 0, 0] })
      S.px = 0.5; S.pz = 6.5; S.camYaw = 0.6; S.camPitch = 0.28; S.camDist = 6.4
      trees.update(S.px, S.pz, densityWorld, true)
      S.hp = 100; S.free = true
      refreshObjective()
    }
    S.py = H(S.px, S.pz); S.vy = 0; solids.push(...trees.solids())
    UI.showHUD(true); UI.prompt(''); UI.hideSay(); UI.setHP(S.hp / 100)
    if (name === 'world' && save.stage === 0) startIntro()
  }

  // ---------------------------------------------------------------- story
  const shardsLeft = () => shards.filter((s) => !s.got)
  function refreshObjective() {
    const left = shardsLeft().length
    if (save.stage <= 1) UI.setObjective('Collect the Sun Shards', (5 - left) + ' / 5 found')
    else if (save.stage === 2) UI.setObjective('Reach the Ancient Altar', 'Follow the marker to the stones on the far hill')
    else if (save.stage === 3) UI.setObjective('Defeat the Meadow Titan', 'Attack when its core glows')
    else UI.setObjective('Chapter 1 complete', 'Explore the meadow, or return to the hub')
  }
  const camOver = (x, z, dy) => [x, H(x, z) + dy, z]
  function cutscene(shots, onEnd) { S.cut = { shots, i: 0, t: 0, onEnd, said: false }; UI.showHUD(false); UI.prompt(''); UI.skipBtn(true); UI.hideSay() }
  function endCut() { const c = S.cut; S.cut = null; UI.skipBtn(false); UI.hideSay(); UI.title('', '', false); UI.showHUD(true); if (c && c.onEnd) c.onEnd() }
  function startIntro() {
    const pipP = [npc.x, npc.y + 1.2, npc.z], fire = [bonfire.x, bonfire.y + 1, bonfire.z]
    cutscene([
      { dur: 6.5, a: () => ({ p: [-70, H(-70, 50) + 38, 60], t: [0, H(0, 0) + 6, 0] }), b: () => ({ p: [-26, H(-26, 20) + 12, 20], t: [2, H(2, 0) + 2, 0] }), say: ['Narrator', 'Cedarvale Meadow. For a thousand years the grass has grown quiet and the wind has kept its secrets.'] },
      { dur: 5.0, a: () => ({ p: [bonfire.x + 3.4, bonfire.y + 1.5, bonfire.z + 5.2], t: pipP }), b: () => ({ p: [bonfire.x + 2.2, bonfire.y + 1.3, bonfire.z + 4.2], t: pipP }), say: ['Elder Pip', 'Ah, a traveler! Sit, sit. Do you feel that hum under your feet? That is the Meadow Titan, stirring in its sleep.'] },
      { dur: 6.0, a: () => ({ p: [bonfire.x - 4, bonfire.y + 1.6, bonfire.z + 4.5], t: pipP }), b: () => ({ p: [bonfire.x - 3, bonfire.y + 1.2, bonfire.z + 3.2], t: [bonfire.x + 1, bonfire.y + 1.1, bonfire.z] }), say: ['Elder Pip', 'Five Sun Shards lie scattered across the land. Gather them and carry their light to the Ancient Altar, and the Titan will sleep again. Or... wake, and be faced.'] },
      { dur: 4.2, a: () => ({ p: camOver(S.px + 4, S.pz + 7, 3), t: [S.px, S.py + 1, S.pz] }), b: () => ({ p: camOver(S.px + 1, S.pz + 6.4, 2.4), t: [S.px, S.py + 1.2, S.pz - 3] }), say: ['Elder Pip', 'Follow the old road east. Look for the beams of light. Go on, little one!'] },
    ], () => { save.stage = 1; persist(); refreshObjective(); UI.toast('Find the Sun Shards') })
  }
  function altarCutscene() {
    save.stage = 3; persist(); S.cloud = 0.7
    const ax = altar.x, az = altar.z, ay = altar.y
    titan = { x: ax, z: az, y: ay - 14, yaw: Math.PI * 0.25, hp: 900, max: 900, state: 'rise', t: 0, cd: 2.2, arm: 0, stun: 0, shock: null, rocks: [], windup: 0, atk: null, dead: 0, flash: 0 }
    let hoursTarget = 18.3
    cutscene([
      { dur: 5.5, a: () => ({ p: [ax + 34, ay + 9, az + 30], t: [ax, ay + 3, az] }), b: () => ({ p: [ax + 24, ay + 7, az + 20], t: [ax, ay + 4, az] }), say: ['Narrator', 'The shards lift from your pack and burn like tiny suns. The standing stones begin to glow.'], fx: () => { S.hours += (hoursTarget - S.hours) * 0.02 } },
      { dur: 6.5, a: () => ({ p: [ax + 20, ay + 3, az + 14], t: [ax, ay + 0, az] }), b: () => ({ p: [ax + 26, ay + 16, az + 22], t: [ax, ay + 10, az] }), fx: (k) => { S.shake = 0.9 * smooth(Math.min(1, k * 2)); titan.y = ay - 14 + 14 * smooth(clamp((k - 0.15) / 0.8, 0, 1)); if (Math.random() < 0.5) FX.push({ t: 0, org: [ax + (Math.random() - 0.5) * 8, ay + 0.3, az + (Math.random() - 0.5) * 8], col: [0.5, 0.4, 0.3], a: [3, 0.2, 0, 0], n: 20 }); S.hours += (hoursTarget - S.hours) * 0.02 }, say: ['Elder Pip', '(his voice, far away) It wakes! Little one, it wakes!'] },
      { dur: 4.5, a: () => ({ p: [ax + 12, ay + 2.5, az + 12], t: [ax, ay + 9, az] }), b: () => ({ p: [ax + 13, ay + 3.5, az + 9], t: [ax, ay + 10.5, az] }), fx: () => { titan.y = ay; S.shake = 0.35 }, title: ['MEADOW TITAN', 'GUARDIAN OF CEDARVALE'] },
    ], () => { S.shake = 0; titan.state = 'fight'; S.hp = 100; S.px = ax - 20; S.pz = az + 18; S.py = H(S.px, S.pz); S.camYaw = 2.4; UI.setBoss(1); refreshObjective(); UI.toast('Dodge the shockwaves, then strike!') })
  }
  function victoryCutscene() {
    const ax = altar.x, az = altar.z, ay = altar.y
    save.stage = 4; persist(); UI.setBoss(null)
    cutscene([
      { dur: 5.5, a: () => ({ p: [ax + 30, ay + 8, az + 26], t: [ax, ay + 5, az] }), b: () => ({ p: [ax + 20, ay + 12, az + 16], t: [ax, ay + 7, az] }), fx: (k) => { titan.dead = k; S.shake = 0.5 * (1 - k); if (Math.random() < 0.6) FX.push({ t: 0, org: [ax + (Math.random() - 0.5) * 9, ay + 1 + Math.random() * 9, az + (Math.random() - 0.5) * 9], col: [1.0, 0.6, 0.2], a: [2.5, 1, 0, 0], n: 30 }) }, say: ['Narrator', 'The Titan crumbles into glowing dust, and the wind carries the sparks across the meadow.'] },
      { dur: 5.0, a: () => ({ p: camOver(ax + 10, az + 12, 3), t: [ax, ay + 2, az] }), b: () => ({ p: camOver(ax + 8, az + 9, 2.4), t: [ax, ay + 3, az] }), say: ['Elder Pip', 'You did it! The meadow will sing your name tonight. Chapter one is done, little hero.'], fx: () => { S.hours += (7.5 - S.hours) * 0.01 } },
      { dur: 4.0, a: () => ({ p: camOver(ax + 8, az + 9, 2.4), t: [ax, ay + 3, az] }), b: () => ({ p: camOver(ax - 5, az + 28, 24), t: [ax, ay + 2, az - 20] }), title: ['CHAPTER 1 COMPLETE', 'THE AWAKENING'], fx: () => { S.hours += (7.5 - S.hours) * 0.01 } },
    ], () => { titan = null; S.hp = 100; S.cloud = 0.35; refreshObjective(); UI.toast('Chapter 1 complete') })
  }
  function collectShard(s) { s.got = true; if (!save.shards.includes(s.id)) save.shards.push(s.id); S.flash = 0.35; FX.push({ t: 0, org: [s.x, s.y + 1.6, s.z], col: [1.0, 0.75, 0.25], a: [1.6, 0.8, 0, 0], n: 160 }); UI.toast('Sun Shard ' + save.shards.length + ' / 5'); if (save.shards.length >= 5) { save.stage = 2; UI.toast('All shards found. Go to the Ancient Altar.') } else if (save.stage === 0) save.stage = 1; persist(); refreshObjective() }

  // ---------------------------------------------------------------- boss
  function bossUpdate(dt) {
    const T = titan; if (!T || T.state !== 'fight') return
    T.t += dt; T.flash = Math.max(0, T.flash - dt * 3); const dx = S.px - T.x, dz = S.pz - T.z, d = Math.hypot(dx, dz)
    if (T.stun > 0) { T.stun -= dt; T.arm = lerp(T.arm, 0, dt * 4); if (T.stun <= 0) T.cd = 1.4; return }
    const want = Math.atan2(dx, dz); let dy = want - T.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU; T.yaw += dy * Math.min(1, dt * (T.atk ? 0.8 : 2.2))
    if (!T.atk) { if (d > 9) { T.x += Math.sin(T.yaw) * 2.6 * dt; T.z += Math.cos(T.yaw) * 2.6 * dt } T.arm = lerp(T.arm, 0, dt * 5); T.cd -= dt
      if (T.cd <= 0) { const r = Math.random(), kind = d < 8 && r < 0.45 ? 'stomp' : r < 0.55 ? 'rocks' : 'slam'; T.atk = { kind, t: 0, dur: kind === 'rocks' ? 1.5 : kind === 'stomp' ? 1.1 : 1.5, hit: false } } }
    else { const a = T.atk; a.t += dt; const k = a.t / a.dur; T.arm = k < 0.65 ? smooth(k / 0.65) * 1.6 : lerp(1.6, -0.6, smooth((k - 0.65) / 0.2))
      if (!a.hit && k >= 0.68) { a.hit = true; S.shake = 0.9
        if (a.kind === 'slam') { T.shock = { r: 2, x: T.x + Math.sin(T.yaw) * 4, z: T.z + Math.cos(T.yaw) * 4, hit: false }; T.stun = 3.2; FX.push({ t: 0, org: [T.shock.x, H(T.shock.x, T.shock.z) + 0.3, T.shock.z], col: [1.0, 0.6, 0.25], a: [3, 1, 0, 0], n: 160 }) }
        else if (a.kind === 'stomp') { if (d < 7.5 && S.py < H(S.px, S.pz) + 0.8) hurt(22); FX.push({ t: 0, org: [T.x, H(T.x, T.z) + 0.3, T.z], col: [1.0, 0.7, 0.4], a: [2.5, 1, 0, 0], n: 120 }); T.cd = 1.6 }
        else { for (let i = 0; i < 3; i++) { const ox = (i - 1) * 3.2, tx = S.px + ox + (Math.random() - 0.5) * 2, tz = S.pz + (Math.random() - 0.5) * 3; T.rocks.push({ x0: T.x, y0: T.y + 12, z0: T.z, tx, tz, t: -i * 0.28, dur: 1.5 }) } T.cd = 2.2 } }
      if (k >= 1) { T.atk = null; if (T.cd < 0.8) T.cd = 1.2 } }
    if (T.shock) { const s = T.shock; s.r += 16 * dt; const pd = Math.hypot(S.px - s.x, S.pz - s.z); if (!s.hit && Math.abs(pd - s.r) < 1.6 && S.py < H(S.px, S.pz) + 0.9) { s.hit = true; hurt(25) } if (s.r > 46) T.shock = null }
    for (let i = T.rocks.length - 1; i >= 0; i--) { const r = T.rocks[i]; r.t += dt; if (r.t >= r.dur) { const gy = H(r.tx, r.tz); FX.push({ t: 0, org: [r.tx, gy + 0.3, r.tz], col: [0.9, 0.55, 0.3], a: [2, 1, 0, 0], n: 90 }); if (Math.hypot(S.px - r.tx, S.pz - r.tz) < 3.2) hurt(16); S.shake = Math.max(S.shake, 0.4); T.rocks.splice(i, 1) } }
    UI.setBoss(T.hp / T.max)
    if (T.hp <= 0) { T.state = 'dead'; T.rocks = []; T.shock = null; victoryCutscene() }
  }
  function hurt(n) { if (S.hurt > 0) return; S.hp = Math.max(0, S.hp - n); S.hurt = 0.7; S.flash = 0.18; S.shake = Math.max(S.shake, 0.5); UI.setHP(S.hp / 100)
    if (S.hp <= 0) { S.hp = 100; UI.setHP(1); if (titan) { S.px = titan.x - 22; S.pz = titan.z + 18; titan.hp = Math.min(titan.max, titan.hp + 120); titan.atk = null; titan.shock = null; titan.rocks = [] } else { S.px = 0.5; S.pz = 6.5 } S.py = H(S.px, S.pz); UI.toast('You were knocked out. Try again!') } }
  function playerAttack() {
    if (S.atkCd > 0) return; S.atk = 0.001; S.atkCd = 0.5; const fx = Math.sin(S.face), fz = Math.cos(S.face)
    FX.push({ t: 0, org: [S.px + fx * 1.2, S.py + 0.8, S.pz + fz * 1.2], col: [1.0, 0.8, 0.4], a: [1.2, 0.5, 0, 0], n: 50 })
    if (titan && titan.state === 'fight') { const dx = titan.x - S.px, dz = titan.z - S.pz, d = Math.hypot(dx, dz); if (d < 10.5 && (dx * fx + dz * fz) / (d || 1) > 0.2) { const dmg = titan.stun > 0 ? 60 : 18; titan.hp = Math.max(0, titan.hp - dmg); titan.flash = 1; S.shake = Math.max(S.shake, 0.25); FX.push({ t: 0, org: [titan.x - fx * 0.5 + dx * 0.4, S.py + 3, titan.z + dz * 0.4], col: titan.stun > 0 ? [0.6, 0.85, 1.0] : [1.0, 0.7, 0.3], a: [2.5, 1, 0, 0], n: 80 }); UI.toast(dmg > 20 ? 'Critical!' : '') } }
  }

  // ---------------------------------------------------------------- per-frame update
  const camState = { pos: [0, 5, 10], target: [0, 1, 0] }
  function update(dt, inp) {
    S.t += dt; S.hours = (S.hours + dt * 24 / (S.scene === 'hub' ? 1500 : 840)) % 24
    S.hurt = Math.max(0, S.hurt - dt); S.atkCd = Math.max(0, S.atkCd - dt); S.shake = Math.max(0, S.shake - dt * 0.9); S.flash = Math.max(0, S.flash - dt * 2.5)
    if (S.atk > 0) { S.atk += dt; if (S.atk > 0.4) S.atk = 0 }
    if (S.fade > 0) S.fade = Math.max(0, S.fade - dt * 1.1)
    if (S.trans) { const T = S.trans; T.t += dt; S.flash = Math.min(1, T.t / 0.8); if (!T.done && T.t >= 0.85) { T.done = true; T.go() } if (T.t > 0.85 + 0.01 && S.trans && T.after) { S.trans = null } }
    if (inp.exit && opts.onExit) { opts.onExit(); return }
    if (inp.hub && S.scene === 'world' && !S.trans) beginTransition(() => enterScene('hub'), 'Back to the hub')
    // cutscene
    if (S.cut) {
      const c = S.cut, sh = c.shots[c.i]; c.t += dt
      if (!c.said && sh.say) { c.said = true; UI.say(sh.say[0], sh.say[1]) } if (sh.title && c.t < 0.05) UI.title(sh.title[0], sh.title[1], true)
      const k = clamp(c.t / sh.dur, 0, 1), a = sh.a(), b = sh.b(), e = smooth(k); const sh2 = 0.05
      camState.pos = [lerp(a.p[0], b.p[0], e) + Math.sin(S.t * 1.3) * sh2, lerp(a.p[1], b.p[1], e) + Math.sin(S.t * 1.7) * sh2, lerp(a.p[2], b.p[2], e)]; camState.target = [lerp(a.t[0], b.t[0], e), lerp(a.t[1], b.t[1], e), lerp(a.t[2], b.t[2], e)]
      if (sh.fx) sh.fx(k)
      if (inp.use && UI.sayTyping()) UI.finishSay(); else if ((inp.use || inp.attack) && c.t > 0.6) c.t = sh.dur
      if (inp.skip) { UI.hideSay(); S.cut.i = c.shots.length }
      if (c.t >= sh.dur) { c.i++; c.t = 0; c.said = false; UI.hideSay(); UI.title('', '', false); if (c.i >= c.shots.length) { endCut() } }
      if (titan && titan.state === 'rise') { /* handled in fx */ }
      updateFX(dt); return
    }
    // free control
    S.camYaw -= inp.yawD; S.camPitch = clamp(S.camPitch + inp.pitchD, -0.15, 1.2); S.camDist = clamp(S.camDist + inp.zoom * 0.8, 3.5, 13)
    const fwd = [-Math.sin(S.camYaw), -Math.cos(S.camYaw)], rgt = [Math.cos(S.camYaw), -Math.sin(S.camYaw)]
    const mx = fwd[0] * inp.y + rgt[0] * inp.x, mz = fwd[1] * inp.y + rgt[1] * inp.x, ml = Math.hypot(mx, mz), sp = (inp.run ? 9.2 : 5.8) * (S.atk > 0 ? 0.6 : 1)
    const tvx = ml > 0.01 ? (mx / Math.max(ml, 1)) * sp : 0, tvz = ml > 0.01 ? (mz / Math.max(ml, 1)) * sp : 0
    const acc = S.onGround ? 14 : 5; S.vx += (tvx - S.vx) * Math.min(1, acc * dt); S.vz += (tvz - S.vz) * Math.min(1, acc * dt)
    if (ml > 0.1) { const want = Math.atan2(tvx, tvz); let d = want - S.face; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; S.face += d * Math.min(1, dt * 14) }
    S.moving = Math.hypot(S.vx, S.vz) / 6
    let nx = S.px + S.vx * dt, nz = S.pz + S.vz * dt
    for (const s of solids) { const dx = nx - s.x, dz = nz - s.z, r = s.r + 0.45, d2 = dx * dx + dz * dz; if (d2 < r * r) { const d = Math.sqrt(d2) || 0.001; nx = s.x + dx / d * r; nz = s.z + dz / d * r } }
    const gh = H(nx, nz), nrm = C.terrainN(nx, nz, 0.8)
    if ((S.scene === 'world' && gh < C.WORLD.water - 0.9) || nrm[1] < 0.52 || (S.scene === 'hub' && Math.hypot(nx, nz) > 62)) { S.vx = S.vz = 0 } else { S.px = nx; S.pz = nz }
    const g = H(S.px, S.pz)
    if (S.onGround && inp.jump) { S.vy = 7.6; S.onGround = false }
    S.vy -= 22 * dt; S.py += S.vy * dt; if (S.py <= g) { S.py = g; S.vy = 0; S.onGround = true } else if (S.py > g + 0.06) S.onGround = false
    if (inp.attack && S.scene === 'world') playerAttack()
    S.bob += dt * (4 + S.moving * 9)
    // scene logic
    if (S.scene === 'hub') hubLogic(dt, inp); else worldLogic(dt, inp)
    // trees streaming / solids
    if (S.t - S.lastTreeUpdate > 0.5) { S.lastTreeUpdate = S.t; const before = trees.counts(); trees.update(S.px, S.pz, S.scene === 'hub' ? densityHub : densityWorld); void before; solids = solids.filter((s) => !s.tree); trees.solids().forEach((s) => solids.push({ ...s, tree: true })) }
    updateFX(dt)
    // camera
    const tgt = [S.px, S.py + 1.0, S.pz], cp = Math.cos(S.camPitch), spch = Math.sin(S.camPitch)
    let cx = tgt[0] + Math.sin(S.camYaw) * cp * S.camDist, cy = tgt[1] + spch * S.camDist, cz = tgt[2] + Math.cos(S.camYaw) * cp * S.camDist
    const cg = H(cx, cz) + 0.7; if (cy < cg) cy = cg
    camState.pos = [cx, cy, cz]; camState.target = tgt
  }
  function updateFX(dt) { for (let i = FX.length - 1; i >= 0; i--) { FX[i].t += dt; if (FX[i].t > 1.1) FX.splice(i, 1) } if (titan && titan.state === 'rise') titan.t += dt }
  function beginTransition(go, msg) { if (S.trans) return; S.trans = { t: 0, go: () => { go(); S.fade = 1; S.trans = null; S.flash = 1 } }; if (msg) UI.toast(msg) }
  function hubLogic(dt, inp) {
    let near = null
    for (const p of portals) { const l = [S.px - p.x, S.pz - p.z], q = [Math.cos(p.yaw) * l[0] - Math.sin(p.yaw) * l[1], Math.sin(p.yaw) * l[0] + Math.cos(p.yaw) * l[1]]; if (Math.abs(q[0]) < 2.2 && q[1] > -0.9 && q[1] < 1.3 && S.py < p.y + 3.5) { if (!S.trans) { if (p.theme.name === 'story') beginTransition(() => enterScene('world'), 'Entering the open world...'); else beginTransition(() => { if (opts.onRaid) opts.onRaid() }, 'Opening the raid lobby...') } } const d = Math.hypot(S.px - p.x, S.pz - p.z); if (d < 9) near = p }
    UI.prompt(near && !S.trans ? 'Walk into the portal to travel' : '')
  }
  function worldLogic(dt, inp) {
    for (const s of shards) if (!s.got && Math.hypot(S.px - s.x, S.pz - s.z) < 2.2 && Math.abs(S.py - s.y) < 3) collectShard(s)
    if (save.stage === 2 && altar && Math.hypot(S.px - altar.x, S.pz - altar.z) < 36 && !S.cut) altarCutscene()
    bossUpdate(dt)
    // talk to Pip
    let canTalk = false
    if (npc && Math.hypot(S.px - npc.x, S.pz - npc.z) < 3.4 && !(titan && titan.state === 'fight')) { canTalk = true; const lines = ['Shards glow like little suns. Follow the beams of light, little one.', save.stage >= 4 ? 'The meadow is safe because of you. Wander as long as you like.' : 'The altar waits on the far hill, past the old road. Do not go before you have all five shards.', 'I tended this fire since before the grass grew tall. Mind the lake, it is deeper than it looks.']; if (inp.use) UI.say('Elder Pip', lines[(S.t | 0) % lines.length]); }
    UI.prompt(canTalk ? (UI.coarse ? 'Tap Use to talk' : 'Press E to talk') : ''); if (!canTalk && S.t % 1 < 0.02) { /* dialogue lingers briefly */ }
    if (npc) { const dx = S.px - npc.x, dz = S.pz - npc.z; if (Math.hypot(dx, dz) < 12) npc.yaw = Math.atan2(dx, dz) }
    if (!canTalk && UI._sayT == null) { /* hide talk text after leaving */ }
  }

  // ---------------------------------------------------------------- drawing
  const lightsList = () => {
    const out = []
    if (S.scene === 'hub') portals.forEach((p) => { const fl = 0.85 + 0.15 * Math.sin(S.t * 7 + p.x) * Math.sin(S.t * 3.1); out.push([p.light[0], p.light[1], p.light[2], 26, p.theme.light[0] * fl, p.theme.light[1] * fl, p.theme.light[2] * fl, Math.hypot(p.x - S.px, p.z - S.pz)]) })
    else { if (bonfire) { const fl = 0.8 + 0.2 * Math.sin(S.t * 13) * Math.sin(S.t * 5.3) + 0.1 * Math.sin(S.t * 31); out.push([bonfire.x, bonfire.y + 1.4, bonfire.z, 17, 3.0 * fl, 1.25 * fl, 0.35 * fl, Math.hypot(bonfire.x - S.px, bonfire.z - S.pz)]) }
      if (titan && titan.state !== 'rise' ) out.push([titan.x, titan.y + 6, titan.z, 38, 0.7 + 0.8 * titan.flash + (titan.stun > 0 ? 0.3 : 0), 0.3, 0.1 + (titan.stun > 0 ? 0.9 : 0), Math.hypot(titan.x - S.px, titan.z - S.pz) - 30])
      shards.forEach((s) => { if (!s.got) out.push([s.x, s.y + 1.6, s.z, 12, 1.4, 0.8, 0.2, Math.hypot(s.x - S.px, s.z - S.pz) + 4]) }) }
    return out.sort((a, b) => a[7] - b[7]).slice(0, 2)
  }
  function dynamicObjects() {
    const out = [], g = H(S.px, S.pz)
    // player
    const sq = 1 + (S.onGround ? Math.abs(Math.sin(S.bob)) * 0.05 * Math.min(1, S.moving) : 0), bobY = S.onGround ? Math.abs(Math.sin(S.bob)) * 0.1 * Math.min(1, S.moving) : 0
    const atk = S.atk > 0 ? Math.sin(Math.min(1, S.atk / 0.4) * Math.PI) : 0, spin = S.atk > 0 ? S.atk / 0.4 * TAU : 0
    if (!(S.cut && S.cut.hidePlayer)) out.push({ mesh: 'cube', model: M.trs(S.px, S.py + 0.5 + bobY, S.pz, S.face + spin, 0.95 / sq, 0.95 * sq, 0.95 / sq, -0.18 * Math.min(1, S.moving) - atk * 0.25, Math.sin(S.bob) * 0.05 * Math.min(1, S.moving)), mat: 0, tint: [0.9, 0.55, 0.2], tex: 'player', flash: S.hurt })
    if (npc) out.push({ mesh: 'cube', model: M.trs(npc.x, npc.y + 0.62 + Math.sin(S.t * 2) * 0.02, npc.z, npc.yaw, 1.15, 1.2, 1.15), mat: 0, tint: [0.7, 0.5, 0.25], tex: 'pip' })
    // titan
    if (titan && titan.state !== 'rise' || (titan && titan.state === 'rise')) out.push(...titanParts())
    return out
  }
  function titanParts() {
    const T = titan, out = [], breathe = Math.sin(S.t * 1.6) * 0.12, crumble = T.dead || 0, ys = 1 - crumble * 0.9, y0 = T.y - crumble * 2
    const mat = 2, tint = [0.17, 0.155, 0.14], lava = T.stun > 0 ? 0.0 : 1.0, em = [0, 0, 0, 0]
    const base = (lx, ly, lz) => { const c = Math.cos(T.yaw), s = Math.sin(T.yaw); return [T.x + c * lx + s * lz, y0 + ly * ys, T.z - s * lx + c * lz] }
    const P = (mesh, lx, ly, lz, sx, sy, sz, rx = 0, rz = 0, tn = tint, m = mat, p = [1, lava, 0, 0], e = em) => { const w = base(lx, ly, lz); out.push({ mesh, model: M.trs(w[0], w[1], w[2], T.yaw, sx, sy * ys, sz, rx, rz), mat: m, tint: tn, p, em: e }) }
    P('cube', -1.6, 2.4, 0, 2.6, 4.8, 2.6); P('cube', 1.6, 2.4, 0, 2.6, 4.8, 2.6) // legs
    P('cube', 0, 7.4 + breathe, 0, 6.6, 5.4, 4.2) // torso
    P('cube', 0, 11.2 + breathe, 0.4, 3.0, 2.6, 3.0) // head
    P('box', 0, 11.35 + breathe, 1.95, 2.0, 0.45, 0.2, 0, 0, [1, 0.5, 0.15], 3, [1, 1, 0, 0], [0, 0, 0, 5.0]) // eyes strip (emissive)
    const core = T.stun > 0 ? [0.5, 0.85, 1.0] : [1.0, 0.42, 0.1]; P('sphere', 0, 7.6 + breathe, 2.15, 1.7 + 0.2 * Math.sin(S.t * 6), 1.7, 0.7, 0, 0, core, 3, [1, 0, 0, 0], [0, 0, 0, T.stun > 0 ? 6.0 : 3.2]) // chest core
    for (const s of [-1, 1]) { const raise = T.arm * (s === 1 ? 1 : 0.9); P('cube', s * 4.4, 8.6, 0, 2.2, 2.2, 2.2); const ang = -raise * 1.2; const ex = s * 4.9, ey = 8.6 - Math.cos(ang) * 2.8 + (T.arm > 0 ? 0 : 0), ez = Math.sin(-ang) * 2.8 + 0.5; P('cube', ex, ey, ez, 2.0, 3.8, 2.0, ang * 0.5); const fx = ex, fy = 8.6 - Math.cos(ang) * 5.2, fz = Math.sin(-ang) * 5.2 + 0.8; P('cube', fx, fy, fz, 3.1, 3.1, 3.1) }
    return out
  }
  function projectTo(vp, x, y, z) { const r = M.proj(vp, x, y, z); if (r[2] <= 0.1) return null; return [(r[0] * 0.5 + 0.5) * root.clientWidth, (1 - (r[1] * 0.5 + 0.5)) * root.clientHeight, r[2]] }

  let atmo = null, fr = null, vpInfo = null
  function render() {
    const w = root.clientWidth, h = root.clientHeight; if (w < 4 || h < 4) return
    const asp = w / h; E.fov = 1.02
    atmo = A.atmosphere(S.hours, S.cloud)
    const pos = camState.pos.slice(), tgt = camState.target.slice(); if (S.shake > 0) { const k = S.shake * 0.12; pos[0] += (Math.random() - 0.5) * k; pos[1] += (Math.random() - 0.5) * k; pos[2] += (Math.random() - 0.5) * k }
    const lights = lightsList()
    const sv = A.shadowMatrix(E, atmo, [S.px, S.py, S.pz], 46)
    const wind = (0.85 + 0.4 * Math.sin(S.t * 0.13)) * (S.cloud > 0.6 ? 1.35 : 1)
    fr = { atmo, cam: { pos, target: tgt, fov: E.fov, aspect: asp }, shadowVP: sv, groundY: H(pos[0], pos[2]), fogDensity: S.scene === 'hub' ? 0.0017 : 0.0009 + 0.0005 * S.cloud, time: S.t, wind, lights, player: [S.px, S.py, S.pz], bendRadius: 1.5, flash: 0 }
    vpInfo = A.writeFrame(E, fr)
    ground.update(pos[0], pos[2], PATHF)
    const dyn = dynamicObjects(), all = statics
    const drawObjs = (shadow) => { for (const o of all) O.draw(o, shadow); for (const o of dyn) O.draw(o, shadow); if (!shadow) shardsDraw(); else shardsDraw(true) }
    const shardsDraw = (shadow) => { if (S.scene !== 'world') return; for (const s of shards) { if (s.got) continue; const bob = Math.sin(S.t * 2 + s.id) * 0.25; O.draw({ mesh: 'cube', model: M.trs(s.x, s.y + 1.6 + bob, s.z, S.t * 1.4, 0.55, 0.95, 0.55, 0.3, 0.2), mat: 3, tint: [1.0, 0.72, 0.22], em: [0, 0, 0, shadow ? 0 : 4.5] }, shadow) } }
    E.frame({
      exposure: atmo.exposure * (S.scene === 'world' && S.cloud > 0.6 ? 1.05 : 1), bloom: 0.55, flash: Math.max(S.flash, 0), fade: S.fade > 0 ? smooth(S.fade) * 0.0 + S.fade * 0.9 : 0, bars: S.cut ? 0.115 : 0, flashCol: S.scene === 'hub' && S.trans ? [1, 0.85, 0.6] : [1, 0.9, 0.75],
      shadow() { trees.draw(true); drawObjs(true) },
      opaque() { E.drawTerrain(pos[0], pos[2], PATHF); grass.draw(pos[0], pos[2]); trees.draw(false); drawObjs(false) },
      transparent() { if (S.scene === 'world') O.water(); if (S.scene === 'hub') portals.forEach((p) => O.drawPortal(M.trs(p.cx, p.cy, p.cz, p.yaw, 1.78 * 1.3, 2.75 * 1.3, 1), p.theme.c0, p.theme.c1, p.theme.c2, 1)) },
      additive() {
        E.gl.depthMask(false)
        O.particles(1, 600, [0, 0, 0], [1, 1, 1])
        if (atmo.night > 0.3) O.particles(3, 160, [0, 0, 0], [1, 1, 1])
        if (S.scene === 'hub') portals.forEach((p) => { O.particles(0, 300, [p.cx, p.cy, p.cz], p.theme.c1, [3.4, 0.72, 0, p.yaw]); const q = rotLocal(p.yaw, 0, 0, 0); void q; O.drawRing(M.trs(p.x, p.y + 0.6, p.z, 0, 4.4, 1, 4.4), p.theme.c1, 0.5 + 0.2 * Math.sin(S.t * 2), 0.55) })
        else {
          if (bonfire) { O.particles(2, 70, [bonfire.x, bonfire.y + 0.3, bonfire.z], [1, 0.6, 0.2], [2.4, 1.0, 0, 0]); O.particles(2, 22, [bonfire.x, bonfire.y + 1.2, bonfire.z], [1, 0.4, 0.1], [3.5, 0.25, 0, 0]) }
          for (const s of shards) if (!s.got) { O.draw({ mesh: 'cyl', model: M.trs(s.x, s.y, s.z, 0, 1.5, 70, 1.5), mat: 5, tint: [1.0, 0.65, 0.2], em: [0, 0, 0, 2.5], p: [1.0, 0, 0, 0] }); O.particles(2, 16, [s.x, s.y + 1.2, s.z], [1, 0.8, 0.3], [2.2, 0.35, 0, 0]) }
          if (save.stage === 2) O.draw({ mesh: 'cyl', model: M.trs(altar.x, altar.y, altar.z, 0, 3, 90, 3), mat: 5, tint: [1.0, 0.55, 0.2], em: [0, 0, 0, 2.0], p: [1.0, 0, 0, 0] })
          if (titan) {
            const T = titan
            if (T.shock) O.drawRing(M.trs(T.shock.x, H(T.shock.x, T.shock.z) + 0.6, T.shock.z, 0, T.shock.r, 1, T.shock.r), [1.0, 0.3, 0.12], 2.0, 0.85)
            if (T.atk && T.atk.kind === 'slam') O.drawRing(M.trs(T.x + Math.sin(T.yaw) * 4, H(T.x, T.z) + 0.5, T.z + Math.cos(T.yaw) * 4, 0, 6, 1, 6), [1.0, 0.2, 0.1], 1.2 + Math.sin(S.t * 14), 0.6)
            if (T.atk && T.atk.kind === 'stomp') O.drawRing(M.trs(T.x, H(T.x, T.z) + 0.5, T.z, 0, 7.5, 1, 7.5), [1.0, 0.2, 0.1], 1.2 + Math.sin(S.t * 14), 0.5)
            for (const r of T.rocks) { const k = clamp(r.t / r.dur, 0, 1); if (r.t < 0) continue; const x = lerp(r.x0, r.tx, k), z = lerp(r.z0, r.tz, k), gy = H(r.tx, r.tz), y = lerp(r.y0, gy, k) + Math.sin(k * Math.PI) * 9; O.draw({ mesh: 'sphere', model: M.trs(x, y, z, S.t * 3, 1.7, 1.7, 1.7), mat: 3, tint: [1.0, 0.45, 0.12], em: [0, 0, 0, 3.0] }); O.drawRing(M.trs(r.tx, gy + 0.4, r.tz, 0, 3.2, 1, 3.2), [1.0, 0.2, 0.1], 1.0 + k * 2, 0.5) }
            if (T.state === 'rise' || T.dead) O.particles(2, 60, [T.x, H(T.x, T.z), T.z], [0.7, 0.55, 0.4], [6, 3, 0, 0])
          }
        }
        for (const f of FX) O.particles(4, f.n, f.org, f.col, f.a, f.t)
        E.gl.depthMask(true)
      },
    })
    // overlays
    for (const p of portals) { const pr = projectTo(vpInfo.vp, p.x, p.y + 7.3, p.z); UI.tag('p' + p.theme.name, pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr && pr[2] < 38 && S.scene === 'hub' && !S.cut, `${p.theme.label}<small>${p.theme.sub}</small>`) }
    if (npc) { const pr = projectTo(vpInfo.vp, npc.x, npc.y + 2.5, npc.z); UI.tag('pip', pr ? pr[0] : 0, pr ? pr[1] : 0, !!pr && pr[2] < 22 && !S.cut, 'Elder Pip') } else UI.tag('pip', 0, 0, false)
    let target = null, label = ''
    if (S.scene === 'world' && !S.cut) { if (save.stage <= 1) { let best = 1e9; for (const s of shards) if (!s.got) { const d = Math.hypot(s.x - S.px, s.z - S.pz); if (d < best) { best = d; target = [s.x, s.y + 2.5, s.z]; label = Math.round(d) + ' m' } } } else if (save.stage === 2 && altar) { target = [altar.x, altar.y + 8, altar.z]; label = Math.round(Math.hypot(altar.x - S.px, altar.z - S.pz)) + ' m' } }
    let pr = target ? projectTo(vpInfo.vp, target[0], target[1], target[2]) : null, show = !!pr
    if (pr) { const mx = root.clientWidth, my = root.clientHeight; pr[0] = clamp(pr[0], 30, mx - 30); pr[1] = clamp(pr[1], 80, my - 90) }
    UI.mark('obj', '#ffb25a', pr ? pr[0] : 0, pr ? pr[1] : 0, show, label)
    if (S.scene === 'world' && !S.cut && target) { const d = Math.hypot(target[0] - S.px, target[2] - S.pz); void d }
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now(), scale = Math.min(window.devicePixelRatio || 1, UI.coarse ? 1.25 : 1.5), maxScale = scale, acc = 0, nF = 0
  function resize() { const w = root.clientWidth, h = root.clientHeight; const W = Math.max(2, Math.round(w * scale)), Hh = Math.max(2, Math.round(h * scale)); if (W !== E.w || Hh !== E.h) E.resize(W, Hh) }
  function frame(now, manualDt) {
    if (dead) return
    let dt = manualDt != null ? manualDt : Math.min(0.05, (now - last) / 1000); last = now
    const inp = UI.poll(); resize(); if (manualDt == null && now) { acc += dt; nF++; if (nF === 40) { const ft = acc / nF; if (ft > 0.027 && scale > 0.55) scale = Math.max(0.55, scale * 0.85); else if (ft < 0.014 && scale < maxScale) scale = Math.min(maxScale, scale * 1.1); acc = 0; nF = 0 } }
    try { update(dt, inp); render() } catch (e) { console.error(e); if (!frame.err) { frame.err = true; UI.toast('Render error: ' + String(e.message).slice(0, 80)) } }
    if (manualDt == null) raf = requestAnimationFrame(frame)
  }
  enterScene(opts.startScene || 'hub')
  if (!debug) raf = requestAnimationFrame(frame)
  const onVis = () => { last = performance.now() }; document.addEventListener('visibilitychange', onVis)
  const api = {
    dispose() { dead = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); UI.destroy(); root.remove() },
    // test hooks
    _S: S, _save: save, enterScene, logic(n = 1, dt = 1 / 30, inp) { for (let i = 0; i < n; i++) update(dt, Object.assign({ x: 0, y: 0, run: false, jump: false, attack: false, use: false, yawD: 0, pitchD: 0, skip: false, hub: false, exit: false, zoom: 0 }, inp || {})) }, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(0, dt) }, teleport(x, z) { S.px = x; S.pz = z; S.py = H(x, z) }, setHours(h) { S.hours = h }, camera: camState, UI, resetSave() { save.stage = 0; save.shards = []; persist() }, setStage(n) { save.stage = n; persist() }, titan: () => titan, collect: (i) => collectShard(shards[i]), shards: () => shards,
  }
  return api
}
function injectGuard() {}
window.OrangetRealm = { create }
})()
;
