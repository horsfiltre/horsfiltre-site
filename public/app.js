(function(d){var r=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(!r&&'WebGL2RenderingContext' in window)d.documentElement.classList.add('film-live')})(document);

/* ———————————————————————————— */

(function(){
  var d=document, root=d.documentElement; root.classList.add('js');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Menu mobile
  var top=d.getElementById('top'), mb=top.querySelector('.menu-btn');
  mb.addEventListener('click',function(){var o=top.classList.toggle('is-open');mb.setAttribute('aria-expanded',o);mb.setAttribute('aria-label',o?'Fermer le menu':'Ouvrir le menu');});
  top.querySelectorAll('.menu-panel a').forEach(function(a){a.addEventListener('click',function(){top.classList.remove('is-open');mb.setAttribute('aria-expanded','false');});});

  // Le seul moment animé au chargement : les cartes se déploient
  var st=d.getElementById('stack');
  requestAnimationFrame(function(){requestAnimationFrame(function(){st.classList.add('is-ready');});});

  // Cartes à retourner
  d.querySelectorAll('.flip button').forEach(function(b){b.addEventListener('click',function(){b.setAttribute('aria-pressed',b.getAttribute('aria-pressed')==='true'?'false':'true');});});

  // Simulateur de prix
  var s=d.getElementById('salaire'), fmt=new Intl.NumberFormat('fr-FR');
  function setSim(){var v=+s.value,t=Math.min(Math.round(v*.15),350);
    d.getElementById('sal-out').textContent=fmt.format(v)+'\u00a0€';
    d.getElementById('o-total').textContent=fmt.format(t)+'\u00a0€';
    d.getElementById('o-reste').textContent=fmt.format(Math.max(t-50,0))+'\u00a0€';}
  s.addEventListener('input',setSim);
})();

/* ———————————————————————————— */

/* ============================================================
   Le film du filtre : « La pile »
   Moteur 3D maison en WebGL2, sans bibliothèque.
   Tout l'état de la scène est une fonction de la progression p (0 → 1)
   calculée à partir du défilement : on peut avancer, s'arrêter, rembobiner.
   ============================================================ */
(() => {
  'use strict';
  const section = document.getElementById('filtre');
  if (!section) return;
  const html = document.documentElement;
  if (!html.classList.contains('film-live')) return; // la version fixe reste affichée

  const $ = s => section.querySelector(s), $$ = s => [...section.querySelectorAll(s)];
  const track = $('.film-track'), stage = $('.film-stage'), canvas = $('.film-canvas');
  const caps = $$('[data-cap]'), chips = $$('[data-chip]'), segs = $$('.film-bar i');
  const wordH = $('.film-word-h'), wordS = $('.film-word-s');
  const countEl = $('[data-count]'), cta = $('.cap-cta'), you = $('.film-you'), ui = $('.film-ui'), skip = $('.film-skip');

  /* ---------- Outils ---------- */
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const eio = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const eout = t => 1 - Math.pow(1 - t, 3);
  const eback = t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const RAD = Math.PI / 180;
  const rng = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- Le scénario (en fraction de défilement) ---------- */
  const SW0 = .228, SWW = .075;              // trois balayages : critères, mots-clés, 7 secondes
  const CAPS = [[0, 0, .085, .1], [.1, .12, .2, .215], [.225, .245, .44, .455], [.465, .48, .53, .545], [.565, .58, .62, .635], [.845, .87, 2, 3]];
  const SEGS = [[.1, .215], [.225, .455], [.465, .545], [.565, .635], [.645, .765], [.775, 1]];
  const COL = {
    bg: [.043, .051, .133], pool: [.12, .135, .32], craie: [.949, .953, .969], slate: [.2, .22, .4],
    deep: [.075, .085, .19], orange: [1, .357, .122], beam: [.5, .43, 1], glow: [1, .4, .14], warm: [.5, .17, .05]
  };
  const KEY = (() => { const v = [.55, 1, -.28], l = Math.hypot(...v); return v.map(x => x / l); })();

  /* ---------- La pile : 18 × 18 CV identiques, au pas du logo (22 + 8) ---------- */
  const G = 18, N = G * G, P = 30 / 22;
  const AX = [[1, 0], [0, -1], [-Math.SQRT1_2, Math.SQRT1_2]], LB = 14.5;
  const LOGO = [[-1.864, -.864], [-.5, -.864], [-1.864, .5], [-.5, .5], [.864, .5], [-1.864, 1.864], [-.5, 1.864], [.864, 1.864]];
  const ESC = [1.864, -1.864]; // le carré orange échappé, dans le repère du symbole
  const rnd = rng(20261029);
  const cubes = [];
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const x = (i - (G - 1) / 2) * P, z = (j - (G - 1) / 2) * P;
    const r = rnd();
    cubes.push({ x, z, d: Math.hypot(x, z), fate: r < .56 ? 1 : r < .824 ? 2 : r < .951 ? 3 : 0, role: 'pile', k: -1, slot: null });
  }
  // Pour chaque balayage, le moment où le faisceau passe sur le cube
  cubes.forEach(c => { c.uc = AX.map(a => (c.x * a[0] + c.z * a[1] + LB) / (2 * LB)); });
  // Le vôtre : un survivant tout près du centre, du côté où il s'échappera
  const near = (px, pz) => (a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz);
  const yours = [...cubes].sort(near(1.3, -1.3))[0];
  yours.fate = 0; yours.role = 'yours';
  let surv = cubes.filter(c => c.fate === 0 && c !== yours).sort(near(0, 0));
  for (const c of [...cubes].sort(near(0, 0))) { if (surv.length >= 8) break; if (c.fate && c.d > 2) { c.fate = 0; surv.push(c); } }
  surv = surv.sort(near(0, 0)).slice(0, 8);
  // Les 8 du logo : chacun prend la case du symbole la plus proche
  const freeLogo = LOGO.map((p, k) => k);
  surv.forEach(c => { c.role = 'logo'; let best = 0, bd = 1e9; freeLogo.forEach((k, idx) => { const d = Math.hypot(c.x - LOGO[k][0], c.z - LOGO[k][1]); if (d < bd) { bd = d; best = idx; } }); c.k = freeLogo.splice(best, 1)[0]; });

  /* ---------- La communauté : 112 accompagnés, 104 signés ---------- */
  let com = null;
  function buildCommunity(portrait) {
    const cols = portrait ? 8 : 16, rows = 112 / cols, slots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: (c - (cols - 1) / 2) * P, z: (r - (rows - 1) / 2) * P, lit: true, cube: null, dn: 0 });
    const extra = { x: .5 * P, z: -((rows - 1) / 2 + 1.15) * P };
    cubes.forEach(c => { if (c.role === 'com' || c.role === 'hidden') c.role = 'pile'; c.slot = null; });
    const take = (c, px, pz) => { let best = null, bd = 1e9; for (const s of slots) if (!s.cube) { const d = Math.hypot(s.x - px, s.z - pz); if (d < bd) { bd = d; best = s; } } best.cube = c; c.slot = best; };
    take(yours, ESC[0], ESC[1]);
    cubes.filter(c => c.role === 'logo').forEach(c => take(c, LOGO[c.k][0], LOGO[c.k][1]));
    const ys = yours.slot;
    slots.forEach(s => { s.dn = Math.hypot(s.x - ys.x, s.z - ys.z); });
    const dmax = Math.max(...slots.map(s => s.dn));
    slots.forEach(s => { s.dn /= dmax; });
    // Les autres remontent de la pile engloutie, au plus près de leur place
    const pool = cubes.filter(c => c.role === 'pile');
    [...slots].sort((a, b) => a.dn - b.dn).forEach(s => {
      if (s.cube) return;
      let best = -1, bd = 1e9;
      for (let i = 0; i < pool.length; i++) { const d = Math.hypot(pool[i].x - s.x, pool[i].z - s.z); if (d < bd) { bd = d; best = i; } }
      const c = pool.splice(best, 1)[0]; c.role = 'com'; s.cube = c; c.slot = s;
    });
    pool.forEach(c => { c.role = 'hidden'; });
    // Les 8 qui n'ont pas (encore) signé : on les montre, au hasard mais toujours les mêmes
    const r2 = rng(112), cand = slots.filter(s => s !== ys);
    for (let n = 0; n < 8; n++) cand.splice(Math.floor(r2() * cand.length), 1)[0].lit = false;
    return { cols, rows, slots, extra, hw: (cols - 1) / 2 * P + .6, hh: rows / 2 * P + .9 };
  }

  /* ---------- Géométrie : cube aux arêtes arrondies ---------- */
  function roundedCube(r, k) {
    const R = r * 2, inner = 1 - R, bev = [], cs = [];
    for (let j = 0; j <= k; j++) { const th = Math.PI / 2 - j * (Math.PI / 4) / k; bev.push(inner + R * Math.cos(th) / Math.sin(th)); }
    for (let j = bev.length - 1; j >= 0; j--) cs.push(-bev[j]);
    for (let j = 0; j < bev.length; j++) cs.push(bev[j]);
    const F = [[[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
    const pos = [], nor = [], uvf = [], idx = [], n = cs.length;
    F.forEach(([Nn, U, V], fi) => {
      const base = pos.length / 3;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = cs[i], b = cs[j], p = [0, 1, 2].map(q => Nn[q] + U[q] * a + V[q] * b);
        const qn = p.map(v => Math.max(-inner, Math.min(inner, v)));
        let d = p.map((v, q) => v - qn[q]), l = Math.hypot(...d);
        if (l < 1e-6) { d = Nn.slice(); l = 1; }
        d = d.map(v => v / l);
        pos.push(...qn.map((v, q) => (v + d[q] * R) * .5)); nor.push(...d); uvf.push((a + 1) / 2, (b + 1) / 2, fi);
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = base + j * n + i; idx.push(a, a + 1, a + n + 1, a, a + n + 1, a + n); }
    });
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), uvf: new Float32Array(uvf), idx: new Uint16Array(idx) };
  }

  /* ---------- Shaders ---------- */
  const VS_CUBE = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aUvf;
layout(location=3) in vec4 iPos; layout(location=4) in vec4 iCol; layout(location=5) in vec4 iFx;
uniform mat4 uVP;
out vec3 vW; out vec3 vN; out vec3 vUvf; out vec4 vCol; out vec4 vFx; out float vLy; out vec3 vL;
void main(){
  float c=cos(iFx.x), s=sin(iFx.x); vL=aPos;
  vec3 p=aPos*iPos.w; p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
  vN=vec3(c*aNor.x+s*aNor.z,aNor.y,-s*aNor.x+c*aNor.z);
  vW=iPos.xyz+p; vUvf=aUvf; vCol=iCol; vFx=iFx; vLy=aPos.y+.5;
  gl_Position=uVP*vec4(vW,1.);
}`;
  const FS_CUBE = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec3 vUvf; in vec4 vCol; in vec4 vFx; in float vLy; in vec3 vL;
uniform vec3 uEye,uKey,uBg,uBeam,uFocus; uniform vec2 uFog; uniform float uTime;
out vec4 o;
float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float bar(vec2 q,vec2 c,vec2 h,float aa){return 1.-smoothstep(-aa,aa,box(q-c,h));}
void main(){
  vec2 uv=vUvf.xy;
  if(vFx.w>.5){ /* place libre : les 12 arêtes en pointillé, au même rythme sur chaque face */
    vec3 a=abs(vL);
    float mid=max(min(a.x,a.y),min(max(a.x,a.y),a.z));
    float t=(a.x<=a.y&&a.x<=a.z)?vL.x:((a.y<=a.z)?vL.y:vL.z);
    float e=smoothstep(.418,.44,mid)*step(.45,fract(t*3.2+uTime*.35));
    if(e<.5) discard;
    o=vec4(vCol.rgb*1.2,1.); return;
  }
  vec3 N=normalize(vN),V=normalize(uEye-vW),L=normalize(uKey),base=vCol.rgb;
  if(vUvf.z<.5&&vFx.y>.001){ /* le CV sur la face du dessus */
    vec2 q=uv-.5; float aa=fwidth(q.x)+fwidth(q.y);
    float m=bar(q,vec2(-.1,.22),vec2(.2,.045),aa);
    m=max(m,bar(q,vec2(-.02,.08),vec2(.28,.022),aa));
    m=max(m,bar(q,vec2(-.06,-.02),vec2(.24,.022),aa));
    m=max(m,bar(q,vec2(-.02,-.12),vec2(.28,.022),aa));
    m=max(m,bar(q,vec2(-.13,-.22),vec2(.17,.022),aa));
    vec3 ink=mix(base*.8,vec3(.07,.08,.19),step(.3,vCol.a));
    base=mix(base,ink,m*vFx.y*.75);
  }
  float ndl=max(dot(N,L),0.),hemi=N.y*.5+.5;
  vec3 amb=mix(vec3(.1,.11,.24),vec3(.56,.59,.8),hemi);
  vec3 H=normalize(L+V);
  float spec=pow(max(dot(N,H),0.),60.),fres=pow(1.-max(dot(N,V),0.),3.);
  float ao=mix(.52,1.,smoothstep(0.,.62,vLy));
  vec3 col=base*(amb*.72+ndl*vec3(1.,.96,.9)*.7)*ao;
  col+=spec*.2+fres*vec3(.42,.4,.95)*.2;
  col+=base*vCol.a*(1.-.45*ndl);
  col+=uBeam*vFx.z*(.3+.9*fres+.35*ndl);
  col=mix(col,uBg,smoothstep(uFog.x,uFog.y,length(vW.xz-uFocus.xz))*.94);
  o=vec4(col,1.);
}`;
  const VS_GROUND = `#version 300 es
layout(location=0) in vec2 aP; uniform mat4 uVP; out vec3 vW;
void main(){vW=vec3(aP.x*90.,0.,aP.y*90.);gl_Position=uVP*vec4(vW,1.);}`;
  const FS_GROUND = `#version 300 es
precision highp float;
in vec3 vW; uniform vec3 uBg,uPool,uFocus,uGlowPos,uGlowCol,uWarm,uBeam; uniform vec4 uPoolR,uBeamP; uniform float uGlow;
out vec4 o;
void main(){
  vec2 p=vW.xz; float d=length(p-uFocus.xz);
  vec3 col=mix(uPool,uBg,smoothstep(uPoolR.x,uPoolR.y,d));
  float g=length(p-uGlowPos.xz); col+=uGlowCol*uGlow*exp(-g*g*.14);
  col+=uWarm*uPoolR.w*exp(-pow(length(p)/uPoolR.z,2.));
  float bd=dot(p,uBeamP.xy)-uBeamP.z;
  vec2 gp=abs(fract(p/1.36364+.5)-.5)*1.36364; float w=fwidth(p.x)+fwidth(p.y);
  float grid=1.-smoothstep(0.,.03+w,min(gp.x,gp.y));
  col+=uBeam*uBeamP.w*(exp(-bd*bd*4.)*.8+step(bd,0.)*exp(bd*.5)*.07+grid*exp(-bd*bd*.35)*.5);
  o=vec4(col,1.);
}`;
  const VS_SHADOW = `#version 300 es
layout(location=0) in vec2 aP; layout(location=1) in vec4 iS; uniform mat4 uVP; out vec2 vUv; out float vA;
void main(){vUv=aP;vA=iS.w;gl_Position=uVP*vec4(iS.x+aP.x*iS.z*.5,.004,iS.y+aP.y*iS.z*.5,1.);}`;
  const FS_SHADOW = `#version 300 es
precision mediump float; in vec2 vUv; in float vA; out vec4 o;
void main(){vec2 q=abs(vUv);float d=length(max(q-.4,0.));o=vec4(0.,0.,0.,vA*(1.-smoothstep(0.,.6,d)));}`;
  const VS_BEAM = `#version 300 es
layout(location=0) in vec2 aP; uniform mat4 uVP; uniform vec4 uBeamP; uniform vec2 uBeamLH; out vec2 vUv;
void main(){vec2 ax=uBeamP.xy,pp=vec2(-ax.y,ax.x);vec2 c=ax*uBeamP.z+pp*aP.x*uBeamLH.x;vUv=vec2(aP.x,aP.y*.5+.5);gl_Position=uVP*vec4(c.x,vUv.y*uBeamLH.y,c.y,1.);}`;
  const FS_BEAM = `#version 300 es
precision highp float; in vec2 vUv; uniform vec3 uBeam; uniform vec4 uBeamP; out vec4 o;
void main(){float a=pow(1.-vUv.y,1.7)*(1.-pow(abs(vUv.x),6.))*uBeamP.w;o=vec4(uBeam*a*.5,1.);}`;
  const VS_GLOW = `#version 300 es
layout(location=0) in vec2 aP; layout(location=1) in vec4 iG; layout(location=2) in vec4 iC; uniform mat4 uV,uP; out vec2 vUv; out vec4 vC;
void main(){vUv=aP;vC=iC;vec4 v=uV*vec4(iG.xyz,1.);v.xy+=aP*iG.w;gl_Position=uP*v;}`;
  const FS_GLOW = `#version 300 es
precision mediump float; in vec2 vUv; in vec4 vC; out vec4 o;
void main(){float r=length(vUv);o=vec4(vC.rgb*vC.a*exp(-r*r*5.)*(1.-smoothstep(.7,1.,r)),1.);}`;

  /* ---------- Matrices ---------- */
  const mul = (o, a, b) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
  function persp(o, fy, asp, n, f, sx, sy) { const t = 1 / Math.tan(fy / 2); o.fill(0); o[0] = t / asp; o[5] = t; o[8] = -sx; o[9] = -sy; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
  function look(o, e, t) {
    let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2], l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
    let rx = -fz, rz = fx; l = Math.hypot(rx, rz) || 1; rx /= l; rz /= l;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    o[0] = rx; o[1] = ux; o[2] = -fx; o[3] = 0; o[4] = 0; o[5] = uy; o[6] = -fy; o[7] = 0; o[8] = rz; o[9] = uz; o[10] = -fz; o[11] = 0;
    o[12] = -(rx * e[0] + rz * e[2]); o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]); o[14] = fx * e[0] + fy * e[1] + fz * e[2]; o[15] = 1; return o;
  }

  /* ---------- Caméra : un plan par moment du film ---------- */
  let W = 1, H = 1, aspect = 1, portrait = false, fov = 28 * RAD, K = [], escape = null;
  function fit(hw, hh, el, fw, fh) { const ty = Math.tan(fov / 2), tx = ty * aspect; return Math.max(hw / (tx * fw), (hh * Math.sin(el) + .7 * Math.cos(el)) / (ty * fh)); }
  function buildKeys() {
    const pt = portrait, y = yours, lock = pt ? { off: 4.136, hw: 6.6 } : { off: 11.75, hw: 14.3 };
    const sx = pt ? 0 : .3, sy = pt ? .2 : 0;
    const k = (p, t, az, el, hw, hh, fw, fh, kx, ky, f0, f1, fo) => ({ p, t, az: az * RAD, el: el * RAD, d: fit(hw, hh, el * RAD, fw, fh), sx: kx, sy: ky, f0, f1, fo: fo || t });
    const fw = pt ? .95 : .62, fh = pt ? .62 : .9, lw = pt ? .9 : .66;
    K = [
      k(0, [0, 0, 0], 45, 47, pt ? 3.8 : 6.4, pt ? 3.8 : 4.6, fw, fh, sx, sy, 7, 15),
      k(.21, [0, 0, 0], 51, 53, pt ? 4.8 : 7.8, pt ? 4.8 : 5.6, fw, fh, sx, sy, 8.5, 16),
      k(.455, [0, 0, 0], 39, 63, pt ? 6.6 : 10.4, pt ? 6.6 : 7.5, fw, fh, sx, sy, 10.5, 17),
      k(.55, [y.x * .55, 0, y.z * .55], 33, 50, pt ? 3.6 : 5.4, pt ? 3.6 : 4.2, fw, fh, sx, sy, 6, 13),
      k(.635, [y.x, 1.7, y.z], 25, 32, pt ? 2.3 : 3.5, pt ? 2.3 : 2.6, fw, fh, pt ? 0 : .22, pt ? .14 : 0, 5, 11),
      k(.705, [0, 0, 0], 0, 89.3, pt ? 3.4 : 4.6, 3.4, fw, fh, 0, pt ? .12 : 0, 8, 16, [0, 0, 0]),
      k(.74, [0, 0, 0], 0, 89.3, lock.hw, 2.6, lw, .7, -lock.off * lw / lock.hw, pt ? .1 : 0, 9, 18, [0, 0, 0]),
      k(.765, [0, 0, 0], 0, 89.3, lock.hw, 2.6, lw, .7, -lock.off * lw / lock.hw, pt ? .1 : 0, 9, 18, [0, 0, 0]),
      k(.865, [0, 0, 0], 18, 57, com.hw, com.hh, pt ? .88 : .64, pt ? .42 : .86, sx, pt ? .47 : 0, 22, 40),
      k(1, [0, 0, 0], 27, 61, com.hw * 1.03, com.hh * 1.03, pt ? .88 : .64, pt ? .42 : .86, sx, pt ? .47 : 0, 22, 40)
    ];
    // Le carré échappé flotte au-dessus de la grille : on compense la perspective pour qu'à la verticale il se lise exactement comme le logo
    const k5 = K[6], E = k5.d * Math.sin(k5.el), yc = 2.1, so = (E - yc) / (E - .5);
    escape = { x: ESC[0] * so, z: ESC[1] * so, y: yc, s: so };
  }
  const cam = { t: [0, 0, 0], fo: [0, 0, 0], az: 0, el: 0, d: 1, sx: 0, sy: 0, f0: 0, f1: 1 };
  function camAt(p) {
    let i = 0; while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i], b = K[i + 1], t = eio(clamp((p - a.p) / (b.p - a.p)));
    for (let q = 0; q < 3; q++) { cam.t[q] = lerp(a.t[q], b.t[q], t); cam.fo[q] = lerp(a.fo[q], b.fo[q], t); }
    cam.az = lerp(a.az, b.az, t); cam.el = lerp(a.el, b.el, t); cam.d = Math.exp(lerp(Math.log(a.d), Math.log(b.d), t));
    cam.sx = lerp(a.sx, b.sx, t); cam.sy = lerp(a.sy, b.sy, t); cam.f0 = lerp(a.f0, b.f0, t); cam.f1 = lerp(a.f1, b.f1, t);
    return cam;
  }

  /* ---------- WebGL ---------- */
  let gl = null, prg = {}, vao = {}, buf = {}, nIdx = 0, ready = false;
  const NI = N, inst = new Float32Array(NI * 12), dash = new Float32Array(12), shad = new Float32Array((NI + 1) * 4), glow = new Float32Array((NI + 2) * 8);
  function compile(vs, fs, names) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; names.forEach(n => { u[n] = gl.getUniformLocation(p, n); }); return { p, u };
  }
  function arr(data, usage) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; }
  function attr(loc, b, size, stride, off, div) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride || 0, off || 0); if (div) gl.vertexAttribDivisor(loc, div); }
  function setup() {
    gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return false;
    prg.cube = compile(VS_CUBE, FS_CUBE, ['uVP', 'uEye', 'uKey', 'uBg', 'uBeam', 'uFocus', 'uFog', 'uTime']);
    prg.ground = compile(VS_GROUND, FS_GROUND, ['uVP', 'uBg', 'uPool', 'uFocus', 'uGlowPos', 'uGlowCol', 'uWarm', 'uBeam', 'uPoolR', 'uBeamP', 'uGlow']);
    prg.shadow = compile(VS_SHADOW, FS_SHADOW, ['uVP']);
    prg.beam = compile(VS_BEAM, FS_BEAM, ['uVP', 'uBeamP', 'uBeamLH', 'uBeam']);
    prg.glow = compile(VS_GLOW, FS_GLOW, ['uV', 'uP']);
    const geo = roundedCube(.11, 2); nIdx = geo.idx.length;
    const quad = arr(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    buf.inst = arr(inst, gl.DYNAMIC_DRAW); buf.dash = arr(dash, gl.DYNAMIC_DRAW); buf.shad = arr(shad, gl.DYNAMIC_DRAW); buf.glow = arr(glow, gl.DYNAMIC_DRAW);
    const gp = arr(geo.pos), gn = arr(geo.nor), gu = arr(geo.uvf), gi = gl.createBuffer();
    const cubeVao = ib => { const v = gl.createVertexArray(); gl.bindVertexArray(v); attr(0, gp, 3); attr(1, gn, 3); attr(2, gu, 3); attr(3, ib, 4, 48, 0, 1); attr(4, ib, 4, 48, 16, 1); attr(5, ib, 4, 48, 32, 1); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gi); return v; };
    vao.cube = cubeVao(buf.inst);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    vao.dash = cubeVao(buf.dash);
    vao.ground = gl.createVertexArray(); gl.bindVertexArray(vao.ground); attr(0, quad, 2);
    vao.shadow = gl.createVertexArray(); gl.bindVertexArray(vao.shadow); attr(0, quad, 2); attr(1, buf.shad, 4, 16, 0, 1);
    vao.beam = gl.createVertexArray(); gl.bindVertexArray(vao.beam); attr(0, quad, 2);
    vao.glow = gl.createVertexArray(); gl.bindVertexArray(vao.glow); attr(0, quad, 2); attr(1, buf.glow, 4, 32, 0, 1); attr(2, buf.glow, 4, 32, 16, 1);
    gl.bindVertexArray(null);
    return true;
  }

  /* ---------- L'état de chaque cube à l'instant p ---------- */
  const st = { beamA: 0, beamS: 0, beamK: 0, yGlow: 0, yPos: [0, 0, 0], lit: 0, nS: 0, nG: 0, dashS: 0, warm: 0 };
  function computeScene(p, time, arrive) {
    let beamK = -1, u = 0;
    for (let k = 0; k < 3; k++) { const v = (p - SW0 - k * SWW) / SWW; if (v >= 0 && v <= 1) { beamK = k; u = v; } }
    st.beamK = beamK < 0 ? 0 : beamK; st.beamS = beamK < 0 ? 0 : lerp(-LB, LB, u); st.beamA = beamK < 0 ? 0 : ss(0, .07, u) * (1 - ss(.9, 1, u));
    const silence = ss(.46, .52, p), dimOthers = ss(.56, .62, p);
    const riseT = clamp((p - .555) / .08), rise = eio(riseT);
    const logoT = eio(clamp((p - .645) / .065)), comT = eio(clamp((p - .765) / .045));
    const hideSunk = ss(.645, .69, p), toOrange = ss(.57, .615, p), symbolT = ss(.645, .68, p) * (1 - ss(.78, .83, p));
    let lit = 0, nS = 0, nG = 0, r = 0, g = 0, b = 0;
    const kx = KEY[0], kz = KEY[2], GC = COL.glow;
    // (fonctions créées une fois par image, pas une fois par cube)
    const mixc = (cc, t) => { r += (cc[0] - r) * t; g += (cc[1] - g) * t; b += (cc[2] - b) * t; };
    const halo = (x, y, z, size, k) => { const o = nG * 8; glow[o] = x; glow[o + 1] = y; glow[o + 2] = z; glow[o + 3] = size; glow[o + 4] = GC[0]; glow[o + 5] = GC[1]; glow[o + 6] = GC[2]; glow[o + 7] = k; nG++; };
    for (let i = 0; i < N; i++) {
      const c = cubes[i];
      let x = c.x, z = c.z, y = .5, s = 1, rot = 0, em = 0, lines = 1, hi = 0;
      r = COL.craie[0]; g = COL.craie[1]; b = COL.craie[2];
      // 1. Le tri : le faisceau passe, certains s'enfoncent et s'éteignent
      let sink = 0;
      if (c.fate) { const v = (p - SW0 - (c.fate - 1) * SWW) / SWW, uc = c.uc[c.fate - 1]; sink = eio(ss(uc + .02, uc + .2, v)); }
      if (beamK >= 0) { const cc = c.x * AX[beamK][0] + c.z * AX[beamK][1]; hi = Math.exp(-Math.pow((st.beamS - cc) / 1.15, 2)) * st.beamA * (1 - sink); }
      y = .5 - .72 * sink; mixc(COL.slate, sink); lines = 1 - .7 * sink;
      if (sink > 0) mixc(COL.deep, silence * sink * .65);
      const role = c.role;
      if (role === 'yours') {
        mixc(COL.orange, toOrange); em = .4 * ss(.575, .63, p);
        const fl = Math.sin(time * 1.6) * .05 * rise;
        y = .5 + 1.6 * rise + fl; rot = Math.PI / 2 * eout(riseT) * (1 - comT); lines = 1 - symbolT;
        if (logoT > 0) { x = lerp(c.x, escape.x, logoT); z = lerp(c.z, escape.z, logoT); y = lerp(2.1 + fl, escape.y + fl, logoT); s = lerp(1, escape.s, logoT); }
        if (comT > 0) { const sl = c.slot; x = lerp(escape.x, sl.x, comT); z = lerp(escape.z, sl.z, comT); y = lerp(escape.y, .66, comT) + fl * (1 - comT); s = lerp(escape.s, 1, comT); em = lerp(em, .24, comT); }
        st.yGlow = em; st.yPos[0] = x; st.yPos[1] = y; st.yPos[2] = z;
        if (comT >= .5) lit++;
        halo(x, y, z, lerp(5.2, 2.2, comT), em * (1.25 - .55 * comT));
      } else if (role === 'logo' || (c.fate === 0 && role !== 'yours')) {
        // les autres survivants s'effacent quand le vôtre s'élève
        mixc(COL.slate, dimOthers * .5);
        if (role === 'logo') {
          if (logoT > 0) { const L = LOGO[c.k]; x = lerp(c.x, L[0], logoT); z = lerp(c.z, L[1], logoT); y = .5 + Math.sin(Math.PI * logoT) * .7; rot = Math.PI / 2 * logoT * (1 - comT); lines = 1 - symbolT; r = lerp(r, COL.craie[0], logoT); g = lerp(g, COL.craie[1], logoT); b = lerp(b, COL.craie[2], logoT); }
          if (comT > 0) { const L = LOGO[c.k], sl = c.slot; x = lerp(L[0], sl.x, comT); z = lerp(L[1], sl.z, comT); y = .5 + Math.sin(Math.PI * comT) * .4; }
        } else if (logoT > 0) { y = .5 - 1.4 * logoT; mixc(COL.slate, logoT); }
      } else if (logoT > 0) {
        y = lerp(y, -.95, hideSunk);
      }
      // 2. La communauté remonte, puis s'allume
      if (comT > 0 && (role === 'com' || role === 'hidden')) {
        if (role === 'hidden') { y = -.95; }
        else {
          const sl = c.slot, tr = .775 + .07 * sl.dn, rr = clamp((p - tr) / .045);
          x = sl.x; z = sl.z; y = rr > 0 ? lerp(-.95, .5, eback(rr)) : -.95;
          r = COL.craie[0]; g = COL.craie[1]; b = COL.craie[2]; lines = 1;
        }
      }
      if (c.slot && (role === 'com' || role === 'logo') && comT > 0) {
        const sl = c.slot;
        if (sl.lit) {
          const tl = .855 + .075 * sl.dn, l = ss(tl, tl + .02, p);
          mixc(COL.orange, l); em = .22 * l; y += .16 * eback(clamp((p - tl) / .03)) * (l > 0 ? 1 : 0);
          if (l > .5) lit++;
          if (l > 0) halo(x, y, z, 2.1, .15 * l);
        } else mixc(COL.slate, .25 * ss(.86, .94, p));
      }
      // Arrivée : la pile tombe en place quand on la découvre
      if (arrive < 1) { const a = clamp((arrive * 1.6 - c.d * .045) / .6); y += (1 - eback(a)) * 3.2; s *= lerp(.55, 1, eout(a)); }
      const o = i * 12;
      inst[o] = x; inst[o + 1] = y; inst[o + 2] = z; inst[o + 3] = s;
      inst[o + 4] = r; inst[o + 5] = g; inst[o + 6] = b; inst[o + 7] = em;
      inst[o + 8] = rot; inst[o + 9] = lines; inst[o + 10] = hi; inst[o + 11] = 0;
      // Ombre portée douce
      const top = y + .5 * s, h = Math.max(0, y - .5 * s);
      if (top > .02 && s > .01) {
        const a = .5 * (1 - clamp(h / 3.6)) * clamp(top / .5), off = .06 + .22 * h;
        shad[nS * 4] = x - kx * off; shad[nS * 4 + 1] = z - kz * off; shad[nS * 4 + 2] = s * (1.45 + .55 * clamp(h / 2)); shad[nS * 4 + 3] = a; nS++;
      }
    }
    // La place libre, en pointillé : la vôtre peut-être
    const da = ss(.93, .965, p), ds = da > 0 ? eback(da) * (1 + .03 * Math.sin(time * 2.4)) : 0;
    dash[0] = com.extra.x; dash[1] = .5; dash[2] = com.extra.z; dash[3] = ds; dash[4] = COL.orange[0]; dash[5] = COL.orange[1]; dash[6] = COL.orange[2]; dash[11] = 1;
    st.dashS = ds; st.lit = Math.min(104, lit); st.nS = nS; st.nG = nG; st.warm = .2 * st.lit / 104;
  }

  /* ---------- Rendu ---------- */
  const Vm = new Float32Array(16), Pm = new Float32Array(16), VP = new Float32Array(16), eye = [0, 0, 0];
  let dAz = 0, dEl = 0;
  function render(p, time, arrive) {
    camAt(p);
    const breathe = (1 - ss(.66, .7, p) * (1 - ss(.78, .82, p))) * Math.sin(time * .23) * 1.4 * RAD;
    const az = cam.az + dAz + breathe, el = clamp(cam.el + dEl, 16 * RAD, 89.3 * RAD), d = cam.d, t = cam.t;
    eye[0] = t[0] + d * Math.cos(el) * Math.sin(az); eye[1] = t[1] + d * Math.sin(el); eye[2] = t[2] + d * Math.cos(el) * Math.cos(az);
    look(Vm, eye, t); persp(Pm, fov, aspect, Math.max(.1, d * .1), d * 3 + 60, cam.sx, cam.sy); mul(VP, Pm, Vm);
    computeScene(p, time, arrive);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(COL.bg[0], COL.bg[1], COL.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.depthMask(true);
    const ax = AX[st.beamK];
    // sol
    let u = prg.ground.u; gl.useProgram(prg.ground.p); gl.bindVertexArray(vao.ground);
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uBg, COL.bg); gl.uniform3fv(u.uPool, COL.pool); gl.uniform3fv(u.uFocus, cam.fo);
    gl.uniform3fv(u.uGlowPos, st.yPos); gl.uniform3fv(u.uGlowCol, COL.glow); gl.uniform1f(u.uGlow, st.yGlow * .9);
    gl.uniform3fv(u.uWarm, COL.warm); gl.uniform3fv(u.uBeam, COL.beam);
    gl.uniform4f(u.uPoolR, cam.f0 * .25, cam.f1 * 1.05, com.hw * .9, st.warm); gl.uniform4f(u.uBeamP, ax[0], ax[1], st.beamS, st.beamA);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // ombres
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(prg.shadow.p); gl.bindVertexArray(vao.shadow); gl.uniformMatrix4fv(prg.shadow.u.uVP, false, VP);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.shad); gl.bufferSubData(gl.ARRAY_BUFFER, 0, shad, 0, st.nS * 4);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, st.nS);
    // cubes
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    u = prg.cube.u; gl.useProgram(prg.cube.p);
    gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uKey, KEY); gl.uniform3fv(u.uBg, COL.bg);
    gl.uniform3fv(u.uBeam, COL.beam); gl.uniform3fv(u.uFocus, cam.fo); gl.uniform2f(u.uFog, cam.f0, cam.f1); gl.uniform1f(u.uTime, time);
    gl.bindVertexArray(vao.cube); gl.bindBuffer(gl.ARRAY_BUFFER, buf.inst); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst);
    gl.drawElementsInstanced(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0, NI);
    gl.disable(gl.CULL_FACE);
    if (st.dashS > 0) { gl.bindVertexArray(vao.dash); gl.bindBuffer(gl.ARRAY_BUFFER, buf.dash); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dash); gl.drawElementsInstanced(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0, 1); }
    // faisceau du tri
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    if (st.beamA > 0) {
      u = prg.beam.u; gl.useProgram(prg.beam.p); gl.bindVertexArray(vao.beam);
      gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform4f(u.uBeamP, ax[0], ax[1], st.beamS, st.beamA); gl.uniform2f(u.uBeamLH, LB + 2, 2.8); gl.uniform3fv(u.uBeam, COL.beam);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // halos
    if (st.nG) {
      gl.disable(gl.DEPTH_TEST); gl.useProgram(prg.glow.p); gl.bindVertexArray(vao.glow);
      gl.uniformMatrix4fv(prg.glow.u.uV, false, Vm); gl.uniformMatrix4fv(prg.glow.u.uP, false, Pm);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.glow); gl.bufferSubData(gl.ARRAY_BUFFER, 0, glow, 0, st.nG * 8);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, st.nG);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(null);
  }

  /* ---------- Textes, barre de progression, logo ---------- */
  // Un texte effacé reste dans le document (lecteurs d'écran) mais ses liens ne sont plus atteignables au clavier
  function setOff(el, off) {
    if (el._off === off) return; el._off = off;
    el.classList.toggle('is-off', off);
    el.querySelectorAll('a').forEach(a => {
      const box = a.closest('.cap-cta'); if (box && box !== el) return; // le bouton final a son propre rythme
      if (off) a.setAttribute('tabindex', '-1'); else a.removeAttribute('tabindex');
    });
  }
  const project = (x, y, z) => { const w = VP[3] * x + VP[7] * y + VP[11] * z + VP[15]; return [((VP[0] * x + VP[4] * y + VP[8] * z + VP[12]) / w * .5 + .5) * W, (.5 - (VP[1] * x + VP[5] * y + VP[9] * z + VP[13]) / w * .5) * H]; };
  let lastCount = -1, desk = false;
  function overlays(p) {
    caps.forEach((el, i) => {
      const [a, b, c, d] = CAPS[i], vin = a === b ? (p >= a ? 1 : 0) : ss(a, b, p), v = vin * (1 - ss(c, d, p));
      el.style.opacity = v.toFixed(3); setOff(el, v < .05);
      const dy = (1 - v) * (p < b ? 18 : -18);
      el.style.transform = desk ? `translate3d(0,calc(-50% + ${dy.toFixed(1)}px),0)` : `translate3d(0,${dy.toFixed(1)}px,0)`;
    });
    if (cta) { const v = ss(.93, .96, p); cta.style.opacity = v.toFixed(3); cta.style.transform = `translate3d(0,${((1 - v) * 10).toFixed(1)}px,0)`; setOff(cta, v < .05); }
    segs.forEach((el, i) => { el.style.transform = `scaleX(${clamp((p - SEGS[i][0]) / (SEGS[i][1] - SEGS[i][0])).toFixed(3)})`; });
    chips.forEach((el, k) => { const a = SW0 + k * SWW; el.classList.toggle('is-on', p >= a && p < a + SWW); el.classList.toggle('is-done', p >= a + SWW); });
    const n = p < .845 ? 104 : st.lit;
    if (n !== lastCount && countEl) { countEl.textContent = n; lastCount = n; }
    // l'étiquette de la place libre
    if (you) {
      const yv = ss(.95, .975, p) * (1 - clamp(Math.abs(dAz) / (10 * RAD)));
      if (yv > .002) { const q = project(com.extra.x, 1.35, com.extra.z); you.style.transform = `translate3d(${q[0].toFixed(1)}px,${q[1].toFixed(1)}px,0) translate(-50%,-100%)`; }
      you.style.opacity = yv.toFixed(3);
    }
    if (skip) { const sv = 1 - ss(.88, .92, p); skip.style.opacity = sv.toFixed(3); skip.style.visibility = sv > .01 ? 'visible' : 'hidden'; }
    // le voile sous les textes s'efface pendant que le logo se forme
    if (ui) ui.style.setProperty('--scrim', (1 - ss(.64, .68, p) * (1 - ss(.77, .8, p))).toFixed(3));
    // le nom « hors filtre » vient se poser à côté du symbole en 3D
    const wv = ss(.715, .745, p) * (1 - ss(.765, .785, p)) * (1 - clamp(Math.abs(dAz) / (7 * RAD))) * (1 - clamp(Math.abs(dEl) / (5 * RAD)));
    const on = portrait ? wordS : wordH, off = portrait ? wordH : wordS;
    off.style.opacity = '0';
    if (wv > .002) {
      const a = project(-2.364, 1, -2.364), b = project(2.364, 1, 2.364), k = (b[0] - a[0]) / 104;
      on.style.transform = `translate3d(${(a[0] - 22 * k).toFixed(1)}px,${(a[1] - 22 * k).toFixed(1)}px,0) scale(${k.toFixed(4)})`;
      on.style.opacity = wv.toFixed(3);
    } else on.style.opacity = '0';
  }

  /* ---------- Taille, défilement, interactions, boucle ---------- */
  let dpr = 1, slowFrames = 0, frames = 0;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    W = w; H = h; aspect = w / h; desk = matchMedia('(min-width:960px),(min-width:600px) and (min-aspect-ratio:5/4)').matches;
    const pt = aspect < 1;
    fov = (pt ? 34 : 28) * RAD;
    if (!com || pt !== portrait) { portrait = pt; com = buildCommunity(pt); }
    buildKeys();
    if (!dpr || dpr === 1) dpr = Math.min(window.devicePixelRatio || 1, w < 700 ? 1.75 : 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const headOffset = () => parseFloat(getComputedStyle(stage).top) || 0;
  let head = 68;
  function progress() { const r = track.getBoundingClientRect(), span = r.height - stage.offsetHeight; return span > 0 ? clamp((head - r.top) / span) : 0; }

  let drag = false, lx = 0, ly = 0, vAz = 0, lastMove = 0;
  canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; vAz = 0; lastMove = performance.now(); canvas.classList.add('is-drag'); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    vAz = -dx * .32 * RAD; dAz = clamp(dAz + vAz, -75 * RAD, 75 * RAD);
    if (e.pointerType === 'mouse') dEl = clamp(dEl + dy * .18 * RAD, -30 * RAD, 25 * RAD);
    lastMove = performance.now();
  });
  const endDrag = () => { drag = false; canvas.classList.remove('is-drag'); };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);

  let running = false, raf = 0, last = 0, ps = -1, t0 = performance.now(), enter = -1;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    const pt = progress();
    ps = ps < 0 ? pt : ps + (pt - ps) * (1 - Math.exp(-dt * 7));
    if (Math.abs(pt - ps) < 1e-4) ps = pt;
    if (!drag) {
      dAz = clamp(dAz + vAz, -75 * RAD, 75 * RAD); vAz *= Math.pow(.02, dt);
      if (now - lastMove > 1400) { const k = 1 - Math.pow(.15, dt); dAz -= dAz * k; dEl -= dEl * k; }
    }
    if (enter < 0) enter = now;
    const arrive = clamp((now - enter) / 1600);
    render(ps, (now - t0) / 1000, arrive);
    overlays(ps);
    // si l'appareil peine, on allège la résolution une fois
    frames++; if (dt > .026) slowFrames++;
    if (frames === 90) { if (slowFrames > 40 && dpr > 1) { dpr = Math.max(1, dpr * .72); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); } frames = slowFrames = 0; }
  }
  function start() { if (running || !ready) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Si la 3D ne peut pas démarrer, on revient à la version fixe, lisible
  function fallback() {
    html.classList.remove('film-live');
    [...caps, cta].forEach(el => { if (el) { el.style.opacity = ''; el.style.transform = ''; setOff(el, false); } });
  }
  function init() {
    try { if (!setup()) throw new Error('WebGL2 indisponible'); }
    catch (err) { fallback(); console.warn('[film]', err); return; }
    head = headOffset(); resize(); ready = true;
    new ResizeObserver(() => { head = headOffset(); resize(); }).observe(stage);
    // départ : si on arrive au milieu du film (lien, rechargement), la pile est déjà en place
    if (progress() > .02) enter = performance.now() - 5000;
    new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? start() : stop())), { rootMargin: '0px' }).observe(track);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); ready = false; });
    canvas.addEventListener('webglcontextrestored', () => { prg = {}; vao = {}; buf = {}; if (setup()) { ready = true; start(); } });
  }
  // Le moteur ne se charge qu'à l'approche de la section
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1));
  // … et seulement après un premier défilement réel : un visiteur qui ne descend pas jusqu'ici n'en paie jamais le coût.
  const lazy = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { lazy.disconnect(); idle(init, { timeout: 1200 }); } }, { rootMargin: '0px 0px 60% 0px' });
  const arm = () => { removeEventListener('scroll', arm); lazy.observe(track); };
  if (scrollY > 0 || location.hash) arm(); else addEventListener('scroll', arm, { passive: true });
  // état initial des textes (avant le chargement du moteur)
  caps.forEach((el, i) => { if (i) { el.style.opacity = '0'; setOff(el, true); } });
  if (cta) { cta.style.opacity = '0'; setOff(cta, true); }
})();

/* ———————————————————————————— */

/* ============================================================
   Vision rayons X : une loupe qui grossit le CV et montre, en dessous,
   ce qu'en retient un recruteur pressé. Les chiffres du tableau de bord
   sont lus dans le CV lui-même (mots-clés <mark>, résultats .x-num) :
   remplacer le CV d'exemple par le vrai suffit à les mettre à jour.
   ============================================================ */
(() => {
  'use strict';
  const root = document.getElementById('xr');
  if (!root) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sheet = root.querySelector('.xr-sheet'), scaler = root.querySelector('.xr-scaler');
  const lens = root.querySelector('.xr-lens'), tag = root.querySelector('.xr-tag'), scan = root.querySelector('.xr-scan');
  const btns = [...root.querySelectorAll('.xr-toggle button')];
  const docs = { avant: scaler.querySelector('[data-v="avant"]'), apres: scaler.querySelector('[data-v="apres"]') };
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const KW = (root.dataset.keywords || '').split('|').map(norm).filter(Boolean);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const eio = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Le calque « rayons X » : une copie exacte du CV, au même gabarit, stylée autrement
  const rays = {};
  Object.keys(docs).forEach(v => { const r = docs[v].cloneNode(true); r.classList.add('is-ray'); r.removeAttribute('data-v'); scaler.appendChild(r); rays[v] = r; });

  let cur = 'avant', s = 1, R = 80, m = 1.8, busy = false;
  let lx = 300, ly = 200, tx = 300, ty = 200, hots = [], tourI = 1, userUntil = 0, visible = false, raf = 0;

  // Le tableau de bord se calcule à partir du CV affiché
  function stats(v) {
    const d = docs[v], seen = new Set();
    d.querySelectorAll('mark').forEach(mk => { const k = norm(mk.textContent); if (KW.includes(k)) seen.add(k); });
    return { kw: seen.size, total: KW.length, res: d.querySelectorAll('.x-num').length, poste: d.dataset.poste, posteOk: d.dataset.posteOk === '1', lec: d.dataset.lecture, lecOk: d.dataset.lectureOk === '1', verdict: d.dataset.verdict };
  }
  const tile = k => root.querySelector(`.xr-tile[data-k="${k}"] dd`);
  function countTo(el, to) {
    const from = +el.textContent || 0; if (reduce || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), D = 900;
    const step = now => { const t = clamp((now - t0) / D, 0, 1); el.textContent = Math.round(from + (to - from) * eio(t)); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function hud(v) {
    const S = stats(v);
    const set = (k, text, ok) => { const dd = tile(k); dd.textContent = text; dd.classList.toggle('is-ok', ok); dd.classList.toggle('is-ko', !ok); };
    set('poste', S.poste, S.posteOk); set('lec', S.lec, S.lecOk);
    const mots = tile('mots'); countTo(mots.querySelector('.xr-num'), S.kw); mots.querySelector('small').textContent = ` / ${S.total}`;
    mots.querySelector('.xr-bar i').style.width = `${Math.round(S.kw / Math.max(1, S.total) * 100)}%`;
    countTo(tile('res').querySelector('.xr-num'), S.res);
    root.querySelector('.xr-vtext').textContent = S.verdict;
    root.classList.toggle('is-apres', v === 'apres');
  }

  // Points d'intérêt : lus dans la mise en page du CV (indépendants de l'inclinaison 3D)
  function measure() {
    const w = sheet.clientWidth; if (!w) return;
    s = w / 600; sheet.style.setProperty('--s', s);
    R = clamp(w * .17, 54, 92); m = w < 460 ? 2 : 1.65; sheet.style.setProperty('--R', `${R}px`);
    const d = docs[cur];
    hots = [...d.querySelectorAll('[data-hot]')].map(el => {
      let x = 0, y = 0, n = el;
      while (n && n !== d) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2, o: +el.dataset.o || 9, text: el.dataset.x, ok: el.hasAttribute('data-ok') };
    }).sort((a, b) => a.o - b.o);
  }
  function apply() {
    const ray = rays[cur];
    ray.style.transformOrigin = `${lx.toFixed(1)}px ${ly.toFixed(1)}px`;
    ray.style.transform = `scale(${m})`;
    ray.style.clipPath = `circle(${(R / (s * m)).toFixed(2)}px at ${lx.toFixed(1)}px ${ly.toFixed(1)}px)`;
    lens.style.transform = `translate3d(${(lx * s - R).toFixed(1)}px,${(ly * s - R).toFixed(1)}px,0)`;
    // l'étiquette du point le plus proche
    let best = null, bd = 1e9;
    hots.forEach(h => { const dd = Math.hypot(h.x - lx, h.y - ly); if (dd < bd) { bd = dd; best = h; } });
    if (best && bd < R / s * .95 && !busy) {
      if (tag.dataset.t !== best.text) { tag.textContent = best.text; tag.dataset.t = best.text; }
      tag.classList.toggle('is-ok', best.ok); tag.classList.toggle('is-ko', !best.ok); tag.classList.add('is-on');
      const W = sheet.clientWidth, H = sheet.clientHeight, tw = tag.offsetWidth, th = tag.offsetHeight;
      let px = clamp(lx * s - tw / 2, 8, W - tw - 8), py = ly * s + R + 12;
      if (py + th > H - 8) py = ly * s - R - th - 18;
      tag.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
    } else tag.classList.remove('is-on');
  }
  // La loupe glisse vers sa cible, puis s'arrête : rien ne tourne pour rien
  function tick() {
    raf = 0;
    const k = reduce ? 1 : .16;
    lx += (tx - lx) * k; ly += (ty - ly) * k;
    if (Math.abs(tx - lx) < .25 && Math.abs(ty - ly) < .25) { lx = tx; ly = ty; apply(); return; }
    apply(); raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  // Visite guidée : la loupe passe d'un point à l'autre tant que personne ne la dirige
  let tourTimer = 0;
  function tour() {
    clearTimeout(tourTimer);
    if (!visible || reduce) return; // « réduire les animations » : la loupe ne bouge que si on la guide
    const now = performance.now();
    if (!busy && now > userUntil && hots.length) { const h = hots[tourI++ % hots.length]; tx = h.x; ty = h.y; kick(); }
    tourTimer = setTimeout(tour, now > userUntil ? 2700 : userUntil - now + 400);
  }

  // La souris guide la loupe ; au doigt, on touche l'endroit à examiner
  const toDoc = e => { const r = sheet.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width * 600, 0, 600), clamp((e.clientY - r.top) / r.height * 848, 0, 848)]; };
  sheet.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; [tx, ty] = toDoc(e); userUntil = performance.now() + 2600; kick(); });
  sheet.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') userUntil = performance.now() + 600; });
  sheet.addEventListener('click', e => { [tx, ty] = toDoc(e); userUntil = performance.now() + 6000; kick(); });

  // Avant / Après : un balayage réimprime la page
  function show(v) {
    if (v === cur || busy) return;
    const from = cur, inc = docs[v], out = docs[from];
    busy = true; cur = v;
    btns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    rays[from].classList.remove('is-on'); lens.classList.remove('is-on'); tag.classList.remove('is-on');
    inc.style.visibility = 'visible'; inc.style.zIndex = 2; out.style.zIndex = 1;
    sheet.classList.add('is-scanning'); hud(v);
    const H = sheet.clientHeight, t0 = performance.now(), D = reduce ? 0 : 1150;
    const step = now => {
      const t = D ? clamp((now - t0) / D, 0, 1) : 1, e = eio(t);
      inc.style.clipPath = `inset(0 0 ${((1 - e) * 100).toFixed(2)}% 0)`;
      scan.style.opacity = t < 1 ? '1' : '0'; scan.style.transform = `translate3d(0,${(e * H).toFixed(1)}px,0)`;
      if (t < 1) { requestAnimationFrame(step); return; }
      out.style.visibility = 'hidden'; inc.style.clipPath = 'none'; sheet.classList.remove('is-scanning');
      busy = false; measure(); tourI = 0; userUntil = 0;
      rays[v].classList.add('is-on'); lens.classList.add('is-on'); tour();
    };
    requestAnimationFrame(step);
  }
  btns.forEach(b => b.addEventListener('click', () => show(b.dataset.v)));

  measure(); hud('avant');
  const first = hots[0]; if (first) { lx = tx = first.x; ly = ty = first.y; }
  rays.avant.classList.add('is-on'); lens.classList.add('is-on'); apply();
  new ResizeObserver(() => { measure(); apply(); }).observe(sheet);
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; clearTimeout(tourTimer); if (visible) tourTimer = setTimeout(tour, 900); }), { threshold: .25 }).observe(sheet);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); apply(); });
})();