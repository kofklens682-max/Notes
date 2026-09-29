'use strict';
/* The drawing's calculator. Works sums, equations and inequalities out exactly — no guessing and
   no eval: the text read from the handwriting is taken apart into numbers, letters and signs,
   and every answer is checked by putting it back into the equation before it's shown.
   - A sum: 12 ÷ 4 + 3 × 7, √81, 5², 2^10, 15%, 5!, sin 30 (degrees), log 100, ln e, π …
   - One unknown (any letter): x + 2 = 15 → x = 13 · 3(x − 1) = x + 7 → x = 5
     quadratics with the discriminant: x² + 5x + 6 = 0 → D = 1, x₁ = −2, x₂ = −3
     anything else (√x = 3, 2^x = 32, x³ = 27, sin x = 0.5 …) is found numerically, and checked.
   - Inequalities: 2x + 3 > 7 → x > 2 · x² < 9 → −3 < x < 3
   - Numbers on both sides (2 + 2 = 5): ✓ if right, otherwise the right value.
   - An expression with one letter and no "=": brackets are multiplied out ((x + 2)(x + 3) →
     x² + 5x + 6), otherwise it's factorised (x² − 9 → (x − 3)(x + 3)) or tidied (2x + 3x → 5x).
   - Two equations with two letters (x + y = 10 and x − y = 2): solveSystem() → x = 6, y = 4.
   solveMath(text) → { kind: 'value' | 'equation' | 'inequality' | 'check' | 'simplify', lines: [...], ok? } or null.
   solveQuestion(text) (further down) does all of that plus Σ sums, derivatives, integrals and statistics,
   typed the way people write them, and gives a few short steps with every answer. */

const MATH_FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, lg: Math.log10,
  sin: (v) => Math.sin((v * Math.PI) / 180), cos: (v) => Math.cos((v * Math.PI) / 180), tan: (v) => Math.tan((v * Math.PI) / 180),
  asin: (v) => (Math.asin(v) * 180) / Math.PI, acos: (v) => (Math.acos(v) * 180) / Math.PI, atan: (v) => (Math.atan(v) * 180) / Math.PI,
};
const MATH_CONSTS = { pi: Math.PI, e: Math.E };
// Calculus works in radians (d/dx sin x = cos x); plain sums keep degrees (sin 30 = 0.5).
const RAD_FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan };
const MATH_WORDS = Object.keys(MATH_FUNCS).concat(Object.keys(MATH_CONSTS)).sort((a, b) => b.length - a.length);
const RELATIONS = ['=', '<', '>', '≤', '≥', '≠'];

function mTokens(src) {
  const s = String(src).toLowerCase()
    .replace(/[×·∙⋅]/g, '*').replace(/[÷:]/g, '/').replace(/[−–—]/g, '-').replace(/,/g, '.')
    .replace(/<=|=</g, '≤').replace(/>=|=>/g, '≥').replace(/!=/g, '≠')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt')
    .replace(/[[{]/g, '(').replace(/[\]}]/g, ')').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const num = s.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (num) { out.push({ n: parseFloat(num[0]) }); i += num[0].length; continue; }
    if (/[a-z]/.test(c)) {
      const w = MATH_WORDS.find((k) => s.startsWith(k, i));
      if (w) { out.push(MATH_FUNCS[w] ? { f: w } : { c: w }); i += w.length; continue; }
      out.push({ v: c }); // a single letter is an unknown (x, y, a …)
      i++;
      continue;
    }
    if ('+-*/^()%!'.includes(c) || RELATIONS.includes(c)) { out.push({ o: c }); i++; continue; }
    throw new Error('unknown sign ' + c);
  }
  // Written-out multiplication: 2x, 3(x+1), (x+1)(x−1), 2√3, x², 5π …
  const res = [];
  for (const t of out) {
    const p = res[res.length - 1];
    const endsValue = p && (p.n !== undefined || p.v || p.c || p.o === ')' || p.o === '%' || p.o === '!');
    const startsValue = t.n !== undefined || t.v || t.c || t.f || t.o === '(';
    if (endsValue && startsValue) res.push({ o: '*' });
    res.push(t);
  }
  return res;
}
// Tokens → a tree that can be worked out again and again quickly (for finding unknowns).
function mParse(tokens) {
  let i = 0;
  const peek = () => tokens[i], take = () => tokens[i++];
  const isO = (t, o) => t && t.o === o;
  function primary() {
    const t = take();
    if (!t) throw new Error('ends too soon');
    if (t.n !== undefined) return { n: t.n };
    if (t.c) return { n: MATH_CONSTS[t.c], c: t.c }; // (the name is kept for writing answers: 2π, e^x)
    if (t.v) return { v: t.v };
    if (t.f) {
      if (isO(peek(), '(')) { take(); const a = expr(); if (!isO(take(), ')')) throw new Error(')'); return { f: t.f, a }; }
      return { f: t.f, a: power() }; // √16, sin 30, √2x …
    }
    if (t.o === '(') { const a = expr(); if (!isO(take(), ')')) throw new Error(')'); return a; }
    throw new Error('unexpected ' + (t.o || ''));
  }
  function postfix() {
    let a = primary();
    for (;;) {
      if (isO(peek(), '%')) { take(); a = { op: '/', a, b: { n: 100 } }; } else if (isO(peek(), '!')) { take(); a = { fact: a }; } else return a;
    }
  }
  function power() { const b = postfix(); if (isO(peek(), '^')) { take(); return { op: '^', a: b, b: unary() }; } return b; }
  function unary() { if (isO(peek(), '-')) { take(); return { neg: unary() }; } if (isO(peek(), '+')) { take(); return unary(); } return power(); }
  function term() { let a = unary(); for (;;) { if (isO(peek(), '*')) { take(); a = { op: '*', a, b: unary() }; } else if (isO(peek(), '/')) { take(); a = { op: '/', a, b: unary() }; } else return a; } }
  function expr() { let a = term(); for (;;) { if (isO(peek(), '+')) { take(); a = { op: '+', a, b: term() }; } else if (isO(peek(), '-')) { take(); a = { op: '-', a, b: term() }; } else return a; } }
  const tree = expr();
  if (i !== tokens.length) throw new Error('left over');
  return tree;
}
function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}
function mEval(t, env) {
  if (t.n !== undefined) return t.n;
  if (t.v) { const x = env[t.v]; if (x === undefined) throw new Error('unknown ' + t.v); return x; }
  if (t.f) return ((env.$rad && RAD_FUNCS[t.f]) || MATH_FUNCS[t.f])(mEval(t.a, env));
  if (t.neg) return -mEval(t.neg, env);
  if (t.fact) return factorial(mEval(t.fact, env));
  const a = mEval(t.a, env), b = mEval(t.b, env);
  switch (t.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    default: return a ** b;
  }
}
const varsOf = (tokens) => [...new Set(tokens.filter((t) => t.v).map((t) => t.v))];

// ---------- Showing numbers ----------
const minus = (s) => s.replace(/-/g, '−');
// 13 · 3.5 · 1/3 · ≈ 0.6180 — whole numbers and short decimals as they are, simple fractions as
// fractions, anything else rounded (marked ≈).
function showNum(v) {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) < 1e-10) return '0';
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v)) && Math.abs(r) < 1e15) return minus(String(r));
  for (const d of [10, 100, 1000]) { const k = Math.round(v * d); if (Math.abs(v * d - k) < 1e-7) return minus(String(k / d)); }
  for (let q = 2; q <= 60; q++) { const p = Math.round(v * q); if (Math.abs(v * q - p) < 1e-8) return minus(`${p}/${q}`); }
  const s = Math.abs(v) >= 1e6 || Math.abs(v) < 1e-4 ? v.toPrecision(6) : String(parseFloat(v.toFixed(4)));
  return '≈ ' + minus(s);
}
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const eqLine = (x, v) => { const s = showNum(v); return s.startsWith('≈') ? `${x} ${s}` : `${x} = ${s}`; };

// ---------- One unknown ----------
// f(t) = left − right. A quadratic (or simpler) is recognised exactly; anything else is searched.
function polyOf(f) {
  const fm = f(-1), f0 = f(0), f1 = f(1);
  if (![fm, f0, f1].every(Number.isFinite)) return null;
  const a = (f1 + fm) / 2 - f0, b = (f1 - fm) / 2, c = f0;
  const p = (x) => a * x * x + b * x + c;
  for (const x of [2, 3, -2, -3, 0.37, 5.5, -7.25, 12]) {
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(p(x) - y) > 1e-7 * (1 + Math.abs(y))) return null;
  }
  const tidy = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);
  return { a: tidy(a), b: tidy(b), c: tidy(c) };
}
// Every real root in a wide range: look for sign changes on a fine grid near 0 and a coarser one
// further out, narrow each down, and keep only what really makes f zero.
function rootsOf(f) {
  const xs = [];
  for (let x = -60; x <= 60; x += 0.02) xs.push(Math.round(x * 100) / 100);
  for (let x = -10000; x <= 10000; x += 5) if (x < -60 || x > 60) xs.push(x);
  xs.sort((a, b) => a - b);
  const roots = [];
  const add = (r) => {
    if (!Number.isFinite(r)) return;
    const y = f(r);
    if (!Number.isFinite(y) || Math.abs(y) > 1e-7 * (1 + Math.abs(r))) return;
    const rr = Math.abs(r - Math.round(r)) < 1e-7 ? Math.round(r) : r;
    if (!roots.some((q) => Math.abs(q - rr) < 1e-6 * (1 + Math.abs(rr)))) roots.push(rr);
  };
  let px = xs[0], py = f(px);
  for (let k = 1; k < xs.length && roots.length < 8; k++) {
    const x = xs[k], y = f(x);
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (py === 0) add(px);
      else if (py * y < 0) {
        let lo = px, hi = x, flo = py;
        for (let n = 0; n < 80; n++) { const m = (lo + hi) / 2, fm = f(m); if (!Number.isFinite(fm)) break; if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } }
        add((lo + hi) / 2);
      } else if (Math.abs(y) < Math.abs(py) && k + 1 < xs.length) {
        // touching zero without crossing (like (x − 2)²): polish a low point
        const nx = xs[k + 1], ny = f(nx);
        if (Number.isFinite(ny) && Math.abs(ny) > Math.abs(y)) {
          let a = px, b = nx;
          for (let n = 0; n < 100; n++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (Math.abs(f(m1)) < Math.abs(f(m2))) b = m2; else a = m1; }
          add((a + b) / 2);
        }
      }
    }
    px = x;
    py = y;
  }
  return roots.sort((a, b) => a - b);
}
function solveEquation(f, x) {
  const p = polyOf(f);
  if (p) {
    const { a, b, c } = p;
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) < 1e-12) return Math.abs(c) < 1e-9 ? [`true for every ${x}`] : ['no solution'];
      return [eqLine(x, -c / b)];
    }
    const D = b * b - 4 * a * c, Ds = showNum(D);
    if (D < -1e-12) return [`D = ${Ds} < 0`, 'no real roots'];
    if (Math.abs(D) <= 1e-12) return ['D = 0', eqLine(x, -b / (2 * a))];
    const r1 = (-b + Math.sqrt(D)) / (2 * a), r2 = (-b - Math.sqrt(D)) / (2 * a);
    const [lo, hi] = r1 < r2 ? [r1, r2] : [r2, r1];
    return [`D = ${Ds}`, eqLine(x + SUB[1], hi), eqLine(x + SUB[2], lo)];
  }
  const roots = rootsOf(f);
  if (!roots.length) return ['no real solution'];
  if (roots.length === 1) return [eqLine(x, roots[0])];
  return roots.slice(0, 6).map((r, k) => eqLine(x + (SUB[k + 1] || ''), r));
}
function solveInequality(f, rel, x) {
  const p = polyOf(f);
  let roots;
  if (p && Math.abs(p.a) < 1e-12 && Math.abs(p.b) < 1e-12) roots = [];
  else if (p && Math.abs(p.a) < 1e-12) roots = [-p.c / p.b];
  else if (p) { const D = p.b * p.b - 4 * p.a * p.c; roots = D < -1e-12 ? [] : Math.abs(D) <= 1e-12 ? [-p.b / (2 * p.a)] : [(-p.b - Math.sqrt(D)) / (2 * p.a), (-p.b + Math.sqrt(D)) / (2 * p.a)].sort((a, b) => a - b); }
  else roots = rootsOf(f);
  const holds = (v) => { const y = f(v); if (!Number.isFinite(y)) return false; return rel === '<' ? y < 0 : rel === '>' ? y > 0 : rel === '≤' ? y <= 1e-12 : y >= -1e-12; };
  const strict = rel === '<' || rel === '>';
  const pts = [-Infinity, ...roots, Infinity];
  const parts = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const mid = a === -Infinity ? (b === Infinity ? 0 : b - 1) : b === Infinity ? a + 1 : (a + b) / 2;
    if (holds(mid)) parts.push([a, b]);
  }
  if (!parts.length) {
    const eqPts = roots.filter(holds);
    return eqPts.length ? [eqLine(x, eqPts[0])] : ['no solution'];
  }
  if (parts.length === 1 && parts[0][0] === -Infinity && parts[0][1] === Infinity) return [`every ${x}`];
  const lt = strict ? '<' : '≤', gt = strict ? '>' : '≥';
  const txt = parts.map(([a, b]) => {
    const sa = a === -Infinity ? null : showNum(a).replace('≈ ', ''), sb = b === Infinity ? null : showNum(b).replace('≈ ', '');
    if (sa === null) return `${x} ${lt} ${sb}`;
    if (sb === null) return `${x} ${gt} ${sa}`;
    return `${sa} ${lt} ${x} ${lt} ${sb}`;
  });
  return [txt.join(' or ')];
}

// ---------- Expressions with one letter ----------
const polyMul = (a, b) => { const o = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { o[i + j] += x * y; })); return o; };
const polyAt = (c, x) => c.reduceRight((s, k) => s * x + k, 0);
function tidyCoef(v) {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-7 * Math.max(1, Math.abs(v))) return r;
  for (let q = 2; q <= 60; q++) { const p = Math.round(v * q); if (Math.abs(v * q - p) < 1e-6) return p / q; }
  return v;
}
// f as a polynomial (coefficients from the constant up, degree ≤ 6), or null when it isn't one.
function polyCoeffs(f, maxDeg = 6) {
  const xs = Array.from({ length: maxDeg + 1 }, (_, i) => i - Math.floor(maxDeg / 2)), ys = xs.map(f);
  if (!ys.every(Number.isFinite)) return null;
  let c = new Array(xs.length).fill(0);
  xs.forEach((xi, i) => {
    let basis = [1], den = 1;
    xs.forEach((xj, j) => { if (j !== i) { basis = polyMul(basis, [-xj, 1]); den *= xi - xj; } });
    basis.forEach((b, k) => { c[k] += (ys[i] * b) / den; });
  });
  c = c.map(tidyCoef);
  for (const x of [0.37, -2.45, 5.5, -7.1, 11.3]) {
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(polyAt(c, x) - y) > 1e-6 * (1 + Math.abs(y))) return null;
  }
  while (c.length > 1 && c[c.length - 1] === 0) c.pop();
  return c;
}
const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const supNum = (n) => String(n).split('').map((c) => SUPS[c] || c).join('');
const SUP = ['', '', '²', '³', '⁴', '⁵', '⁶'];
const pw = (k) => (k === 1 ? '' : supNum(k)); // x, x², x¹⁰
const coefText = (a) => { const s = showNum(a); return s && !s.startsWith('≈') ? s : String(parseFloat(a.toFixed(4))); };
// A number as p/q when it's a simple fraction (q ≤ 12) — [p, q] — or null.
function fracParts(v) {
  if (Number.isInteger(v)) return [v, 1];
  for (let q = 2; q <= 12; q++) { const p = Math.round(v * q); if (Math.abs(v * q - p) < 1e-9) return [p, q]; }
  return null;
}
// 3x² − 5x + 2 · x²/2 · 5x/6
function polyText(c, x) {
  let out = '';
  for (let k = c.length - 1; k >= 0; k--) {
    const v = c[k];
    if (v === 0) continue;
    const a = Math.abs(v), fr = Number.isInteger(a) ? null : fracParts(a);
    let term;
    if (k === 0) term = coefText(a);
    else if (fr) term = `${fr[0] === 1 ? '' : fr[0]}${x}${pw(k)}/${fr[1]}`;
    else term = `${a === 1 ? '' : coefText(a)}${x}${pw(k)}`;
    out += out ? ` ${v < 0 ? '−' : '+'} ${term}` : `${v < 0 ? '−' : ''}${term}`;
  }
  return out || '0';
}
const gcdInt = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const divisors = (n) => { const o = []; for (let d = 1; d <= Math.abs(n) && d <= 1000; d++) if (n % d === 0) o.push(d); return o; };
// Whole-number polynomial → its factors: 2(x − 1)(x + 3), x(x + 4), (2x + 1)(x − 3) … or null.
function factorText(c, x) {
  if (c.length < 2 || !c.every(Number.isInteger)) return null;
  let k = c.reduce((g, v) => gcdInt(g, v), 0);
  if (c[c.length - 1] < 0) k = -k;
  let q = c.map((v) => v / k), low = 0;
  while (low < q.length - 1 && q[low] === 0) low++;
  q = q.slice(low);
  const lins = []; // [p, s] for (s·x − p)
  for (let guard = 0; q.length > 2 && guard < 6; guard++) {
    let found = null;
    for (const p of divisors(q[0])) {
      for (const s of divisors(q[q.length - 1])) {
        if (gcdInt(p, s) !== 1) continue;
        for (const pp of [p, -p]) if (Math.abs(polyAt(q, pp / s)) < 1e-9) { found = [pp, s]; break; }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) break;
    // divide q by (s·x − p)
    const [p, s] = found, n = q.length - 1, out = new Array(n).fill(0);
    let carry = 0;
    for (let i = n; i >= 1; i--) { out[i - 1] = (q[i] + carry) / s; carry = out[i - 1] * p; }
    q = out.map(tidyCoef);
    lins.push(found);
  }
  if (Math.abs(k) === 1 && !low && !lins.length) return null;
  const linText = ([p, s]) => `(${s === 1 ? '' : s}${x} ${p > 0 ? '−' : '+'} ${Math.abs(p)})`;
  // what's left is the same bracket again: (n + 1)(n + 1) → (n + 1)²
  if (q.length === 2 && q[1] > 0 && Number.isInteger(q[0]) && Number.isInteger(q[1]) && lins.some((l) => linText(l) === linText([-q[0], q[1]]))) { lins.push([-q[0], q[1]]); q = [1]; }
  const parts = [];
  if (low) parts.push(low === 1 ? x : x + SUP[low]);
  const seen = new Map();
  lins.sort((a, b) => a[0] / a[1] - b[0] / b[1]).forEach((l) => { const t = linText(l); seen.set(t, (seen.get(t) || 0) + 1); });
  for (const [t, n] of seen) parts.push(n > 1 ? t + SUP[n] : t);
  if (q.length > 1 || q[0] !== 1) parts.push(q.length > 1 ? `(${polyText(q, x)})` : coefText(q[0]));
  if (parts.length === 1 && Math.abs(k) === 1 && !low) return null;
  const lead = k === 1 ? '' : k === -1 ? '−' : coefText(k).replace('-', '−');
  return lead + parts.join('');
}
const plainMath = (s) => String(s).toLowerCase().replace(/[\s*·×]/g, '').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/^=/, '');
// An expression with one letter: multiply out, factorise or tidy — whichever changes it.
function simplifyExpr(tree, x, src) {
  const c = polyCoeffs((t) => mEval(tree, { [x]: t }));
  if (!c) return null;
  const E = polyText(c, x), F = factorText(c, x), inp = plainMath(src);
  if (/\(/.test(src) && plainMath(E) !== inp) return { kind: 'simplify', lines: [`= ${E}`] };
  if (F && plainMath(F) !== inp) return { kind: 'simplify', lines: [`= ${F}`] };
  if (plainMath(E) !== inp) return { kind: 'simplify', lines: [`= ${E}`] };
  return null;
}
// "7x8" is a times sign, not an unknown.
const prepMath = (src) => String(src).replace(/(\d)\s*[x×]\s*(?=\d)/gi, '$1*');
// The letters in a sum ("x + y = 10" → ['x', 'y']).
function unknownsIn(src) { try { return varsOf(mTokens(prepMath(src))); } catch (e) { return []; } }

// ---------- Two equations, two letters ----------
// x + y = 10 and x − y = 2 → x = 6, y = 4 (straight-line equations; the answer is checked in both).
function solveSystem(srcA, srcB) {
  try {
    const eqs = [srcA, srcB].map((s) => {
      const toks = mTokens(prepMath(s)), rels = toks.filter((t) => RELATIONS.includes(t.o));
      const k = toks.findIndex((t) => t.o === '=');
      if (rels.length !== 1 || k < 1 || k === toks.length - 1) throw new Error('not an equation');
      return { L: mParse(toks.slice(0, k)), R: mParse(toks.slice(k + 1)), vars: varsOf(toks) };
    });
    const vars = [...new Set(eqs.flatMap((e) => e.vars))].sort();
    if (vars.length !== 2) return null;
    const [u, v] = vars;
    const lin = eqs.map((e) => {
      const f = (a, b) => mEval(e.L, { [u]: a, [v]: b }) - mEval(e.R, { [u]: a, [v]: b });
      const r = f(0, 0), p = f(1, 0) - r, q = f(0, 1) - r;
      for (const [a, b] of [[2, 3], [-1.5, 4.25], [7, -2], [0.3, 0.9]]) {
        const y = f(a, b);
        if (!Number.isFinite(y) || Math.abs(p * a + q * b + r - y) > 1e-7 * (1 + Math.abs(y))) throw new Error('not straight');
      }
      return { p, q, r, f };
    });
    const [A, B] = lin, det = A.p * B.q - A.q * B.p;
    if (Math.abs(det) < 1e-12) {
      const same = Math.abs(A.p * B.r - B.p * A.r) < 1e-9 && Math.abs(A.q * B.r - B.q * A.r) < 1e-9;
      return { kind: 'system', lines: [same ? 'infinitely many solutions' : 'no solution'] };
    }
    const a = (A.q * B.r - A.r * B.q) / det, b = (A.r * B.p - A.p * B.r) / det;
    if (lin.some((e) => Math.abs(e.f(a, b)) > 1e-7 * (1 + Math.abs(a) + Math.abs(b)))) return null;
    return { kind: 'system', lines: [eqLine(u, a), eqLine(v, b)] };
  } catch (e) { return null; }
}

function solveMath(src) {
  try {
    src = prepMath(src);
    const toks = mTokens(src);
    const rels = toks.map((t, k) => (RELATIONS.includes(t.o) ? k : -1)).filter((k) => k >= 0);
    if (rels.length > 1) return null;
    const vars = varsOf(toks);
    if (!rels.length) {
      if (vars.length === 1) return simplifyExpr(mParse(toks), vars[0], src);
      if (vars.length) return null;
      const v = showNum(mEval(mParse(toks), {}));
      return v ? { kind: 'value', lines: [v] } : null;
    }
    const k = rels[0], rel = toks[k].o, L = toks.slice(0, k), R = toks.slice(k + 1);
    if (!L.length) return null;
    const left = mParse(L);
    if (!R.length) { // a sum ending in "=": its value
      if (vars.length === 1 && rel === '=') return simplifyExpr(left, vars[0], src.replace(/=\s*$/, ''));
      if (vars.length) return null;
      const v = showNum(mEval(left, {}));
      return v ? { kind: 'value', lines: [v] } : null;
    }
    const right = mParse(R);
    if (!vars.length) {
      const a = mEval(left, {}), b = mEval(right, {});
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      const ok = rel === '=' ? Math.abs(a - b) < 1e-9 * (1 + Math.abs(a))
        : rel === '<' ? a < b : rel === '>' ? a > b : rel === '≤' ? a <= b : rel === '≥' ? a >= b : Math.abs(a - b) > 1e-9;
      return { kind: 'check', ok, lines: [ok ? '✓' : rel === '=' ? `✗ = ${showNum(a)}` : '✗'] };
    }
    if (vars.length > 1) return null; // two unknowns need two equations
    const x = vars[0];
    const f = (t) => { const env = { [x]: t }; return mEval(left, env) - mEval(right, env); };
    if (rel === '≠') return null;
    if (rel === '=') return { kind: 'equation', lines: solveEquation(f, x) };
    return { kind: 'inequality', lines: solveInequality(f, rel, x) };
  } catch (e) { return null; }
}

// =====================================================================================
// solveQuestion: sums (Σ), derivatives, integrals and statistics as well, with short steps.
//   Σ k² for k = 1 to 10 · sum of k^2 from 1 to 10 · sum(k^2, k, 1, 10) · Σ k for k = 1 to n → n(n + 1)/2
//   d/dx (x³ + 2x) · derivative of sin(x²) · d²/dx² x⁴ · diff(x^3, x) at x = 2 · f(x) = x³, f'(2)
//   ∫ x² dx · ∫ from 0 to 1 x² dx · integral of sin x from 0 to pi · int(x^2, x, 0, 1)
//   standard deviation of 4, 8, 15, 16 (σ and the sample s) · mean, median and mode of … · quartiles,
//   IQR, quartile deviation ((n + 1)/4 rule) · sd(4, 8, 15)
//   C(10, 3) · 10C3 · P(10, 3) · gcd/lcm · 15% of 240 · "5 plus 3 times 2" — and everything solveMath does.
// → { kind, main, sub, steps: [...], lines: [...] } or null. main/sub are shown under a typed question;
//   lines are written under a handwritten one (a 'value' gets "= " in front there).
// =====================================================================================
const SUPER_IN = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
function normQ(src) {
  let s = String(src || '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => { const d = [...m].map((c) => SUPER_IN[c]).join(''); return d.length > 1 ? `^(${d})` : `^${d}`; });
  s = s.replace(/∑/g, 'Σ').replace(/∏/g, 'Π').replace(/[−–—]/g, '-').replace(/[×∙⋅·]/g, '*').replace(/÷/g, '/').replace(/[’′]/g, "'").replace(/″/g, "''")
    .replace(/<=/g, '≤').replace(/>=/g, '≥');
  s = s.replace(/^\s*(?:q\s*)?\d{1,2}[.)]\s+(?=[a-z])/i, ''); // "5. Find …" (a question's number)
  s = s.replace(/\s*(?:=\s*\?|=|\?)\s*$/, '').replace(/\s*\.\s*$/, '').trim();
  return s;
}
const tree = (s) => mParse(mTokens(prepMath(s)));
function varsIn(t, out = new Set()) {
  if (!t) return out;
  if (t.v) out.add(t.v);
  ['a', 'b', 'neg', 'fact'].forEach((k) => { if (t[k] && typeof t[k] === 'object') varsIn(t[k], out); });
  return out;
}
const letters = (t) => [...varsIn(t)];
const has = (t, x) => varsIn(t).has(x);
const isNum = (t) => !!t && t.n !== undefined && !t.c;
const Nn = (n) => ({ n });
const add = (a, b) => ({ op: '+', a, b }), sub = (a, b) => ({ op: '-', a, b }), mul = (a, b) => ({ op: '*', a, b });
const dvd = (a, b) => ({ op: '/', a, b }), pow = (a, b) => ({ op: '^', a, b }), fn = (f, a) => ({ f, a }), neg = (a) => ({ neg: a });
const tidyNum = (v) => (Math.abs(v - Math.round(v)) < 1e-10 * Math.max(1, Math.abs(v)) ? Math.round(v) : v);
const numOf = (s) => { const t = tree(String(s)); if (letters(t).length) throw new Error('not a number'); const v = mEval(t, { $rad: true }); if (!Number.isFinite(v)) throw new Error('not a number'); return tidyNum(v); };
// A value with π when it's a simple multiple of it (π/2, 2π/3), else as showNum writes it.
function valText(v) {
  const s = showNum(v);
  if (s === null || !s.startsWith('≈')) return s;
  const r = v / Math.PI;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(r * q);
    if (p && Math.abs(r * q - p) < 1e-9) { const g = gcdInt(p, q), P = p / g, Q = q / g; return `${P === 1 ? '' : P === -1 ? '−' : minus(String(P))}π${Q === 1 ? '' : '/' + Q}`; }
  }
  return s;
}
const lab = (name, v) => { const s = valText(v); return s.startsWith('≈') ? `${name} ${s}` : `${name} = ${s}`; };
const nth = (n) => { const k = n % 100; return n + (k > 10 && k < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
const answer = (kind, main, o = {}) => ({ kind, main, sub: o.sub || '', steps: (o.steps || []).filter(Boolean).slice(0, 7), lines: o.lines || [main, o.sub].filter(Boolean) });

// ---------- Tidying and writing formulas ----------
function coefRest(t) {
  if (isNum(t)) return { k: t.n, rest: null };
  if (t.neg) { const r = coefRest(t.neg); return { k: -r.k, rest: r.rest }; }
  if (t.op === '*' && isNum(t.a)) return { k: t.a.n, rest: t.b };
  return { k: 1, rest: t };
}
function terms(t, s = 1, out = []) {
  if (t.op === '+') { terms(t.a, s, out); terms(t.b, s, out); } else if (t.op === '-') { terms(t.a, s, out); terms(t.b, -s, out); } else if (t.neg) terms(t.neg, -s, out);
  else { const u = simp(t); if (u.op === '+' || u.op === '-' || u.neg) terms(u, s, out); else out.push({ s, t: u }); }
  return out;
}
const scale = (k, rest) => (k === 1 ? rest : prodOf(factors(mul(Nn(k), rest))));
const negative = (u) => !!u.neg || (isNum(u) && u.n < 0) || (u.op === '*' && isNum(u.a) && u.a.n < 0);
const flip = (u) => (u.neg ? u.neg : isNum(u) ? Nn(-u.n) : u.op === '*' && isNum(u.a) ? (u.a.n === -1 ? u.b : mul(Nn(-u.a.n), u.b)) : neg(u));
function sumOf(list) {
  let c = 0;
  const map = new Map(), order = [];
  for (const { s, t } of list) {
    const { k, rest } = coefRest(t);
    if (!rest) { c += s * k; continue; }
    const key = pr(rest);
    if (!map.has(key)) { map.set(key, { k: 0, rest }); order.push(key); }
    map.get(key).k += s * k;
  }
  const out = [];
  for (const key of order) { const { k, rest } = map.get(key); if (Math.abs(k) > 1e-12) out.push(scale(tidyNum(k), rest)); }
  if (Math.abs(c) > 1e-12 || !out.length) out.push(Nn(tidyNum(c)));
  let r = out[0];
  for (let i = 1; i < out.length; i++) r = negative(out[i]) ? sub(r, flip(out[i])) : add(r, out[i]);
  return r;
}
function factors(t, out = { k: 1, num: [], den: [] }, inv = false) {
  if (t.op === '*') { factors(t.a, out, inv); factors(t.b, out, inv); return out; }
  if (t.op === '/') { factors(t.a, out, inv); factors(t.b, out, !inv); return out; }
  if (t.neg) { out.k = -out.k; factors(t.neg, out, inv); return out; }
  const u = simp(t);
  if (u.op === '*' || u.op === '/' || u.neg) return factors(u, out, inv);
  if (isNum(u)) { out.k = inv ? out.k / u.n : out.k * u.n; return out; }
  (inv ? out.den : out.num).push(u);
  return out;
}
const rank = (u) => (u.c ? -1 : u.v || (u.op === '^' && u.a.v) ? 0 : 1);
function prodOf(f) {
  if (!Number.isFinite(f.k)) throw new Error('not finite');
  if (f.k === 0) return Nn(0);
  // the same thing multiplied together becomes a power: x·x² → x³, x²/x → x
  const pws = new Map(), order = [];
  const put = (u, sg) => {
    const numE = u.op === '^' && isNum(u.b), base = numE ? u.a : u, e = numE ? u.b.n : 1, key = pr(base);
    if (!pws.has(key)) { pws.set(key, { base, e: 0 }); order.push(key); }
    pws.get(key).e += sg * e;
  };
  f.num.forEach((u) => put(u, 1));
  f.den.forEach((u) => put(u, -1));
  const num = [], den = [];
  for (const key of order) {
    const { base, e } = pws.get(key), E = tidyNum(e);
    if (Math.abs(E) < 1e-12) continue;
    const p = (m) => (m === 1 ? base : simp(pow(base, Nn(m))));
    (E > 0 ? num : den).push(p(Math.abs(E)));
  }
  num.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? pr(a).localeCompare(pr(b)) : 0));
  let rest = num.length ? num.reduce((a, b) => mul(a, b)) : null;
  if (den.length) rest = dvd(rest || Nn(1), den.reduce((a, b) => mul(a, b)));
  const k = tidyNum(f.k);
  if (!rest) return Nn(k);
  return k === 1 ? rest : mul(Nn(k), rest);
}
function simp(t) {
  if (t.n !== undefined || t.v) return t;
  if (t.fact) return { fact: simp(t.fact) };
  if (t.f) {
    const a = simp(t.a);
    if (t.f === 'ln' && a.c === 'e') return Nn(1);
    if ((t.f === 'ln' || t.f === 'log' || t.f === 'lg') && isNum(a) && a.n === 1) return Nn(0);
    if (t.f === 'exp' && isNum(a) && a.n === 0) return Nn(1);
    if (t.f === 'sqrt' && isNum(a) && a.n >= 0 && Number.isInteger(Math.sqrt(a.n))) return Nn(Math.sqrt(a.n));
    if ((t.f === 'sin' || t.f === 'tan') && isNum(a) && a.n === 0) return Nn(0);
    if (t.f === 'cos' && isNum(a) && a.n === 0) return Nn(1);
    return fn(t.f, a);
  }
  if (t.neg || t.op === '+' || t.op === '-') return sumOf(terms(t));
  if (t.op === '*' || t.op === '/') return prodOf(factors(t));
  const a = simp(t.a), b = simp(t.b);
  if (isNum(b) && b.n === 0) return Nn(1);
  if (isNum(b) && b.n === 1) return a;
  if (isNum(a) && isNum(b)) { const v = a.n ** b.n; if (Number.isFinite(v) && fracParts(v)) return Nn(tidyNum(v)); }
  if (isNum(a) && a.n === 1) return Nn(1);
  if (a.op === '^' && isNum(a.b) && isNum(b)) return simp(pow(a.a, Nn(a.b.n * b.n)));
  if (a.f === 'sqrt' && isNum(b) && b.n === 2) return a.a;
  if (isNum(b) && b.n < 0) return prodOf({ k: 1, num: [], den: [simp(pow(a, Nn(-b.n)))] });
  return pow(a, b);
}
const numText = (v) => { const s = showNum(v); return s === null ? String(v) : s.startsWith('≈') ? minus(String(parseFloat(v.toFixed(4)))) : s; };
const PREC = (t) => (t.n !== undefined ? (t.n < 0 ? 2 : 9) : t.v || t.f ? 9 : t.fact ? 8 : t.neg ? 2 : t.op === '^' ? 7 : t.op === '*' || t.op === '/' ? 3 : 1);
const wrapP = (t, p) => { const s = pr(t); return PREC(t) < p ? `(${s})` : s; };
function expText(b) {
  if (isNum(b)) {
    if (Number.isInteger(b.n) && Math.abs(b.n) < 1000) return supNum(b.n);
    const fr = fracParts(b.n);
    if (fr) return `^(${minus(String(fr[0]))}/${fr[1]})`;
  }
  return '^' + (b.v || (isNum(b) && b.n >= 0) || b.c ? pr(b) : `(${pr(b)})`);
}
function pr(t) {
  if (t.n !== undefined) return t.c === 'pi' ? 'π' : t.c === 'e' ? 'e' : numText(t.n);
  if (t.v) return t.v;
  if (t.neg) return '−' + wrapP(t.neg, 3);
  if (t.fact) return wrapP(t.fact, 9) + '!';
  if (t.f) {
    if (t.f === 'abs') return `|${pr(t.a)}|`;
    if (t.f === 'exp') return 'e' + expText(t.a);
    if (t.f === 'sqrt' || t.f === 'cbrt') return (t.f === 'sqrt' ? '√' : '∛') + (t.a.v || (isNum(t.a) && t.a.n >= 0) ? pr(t.a) : `(${pr(t.a)})`);
    if (t.f === 'ln' && t.a.f === 'abs') return `ln|${pr(t.a.a)}|`;
    return `${t.f}(${pr(t.a)})`;
  }
  if (t.op === '+') return `${pr(t.a)} + ${wrapP(t.b, 2)}`;
  if (t.op === '-') return `${pr(t.a)} − ${wrapP(t.b, 2)}`;
  if (t.op === '^') return wrapP(t.a, 8) + expText(t.b);
  return prodText(t);
}
// 3x², 2x·cos(x²), x³/3, 1/(2√x), −sin(x)
function prodText(t) {
  const f = { k: 1, num: [], den: [] };
  (function walk(u, inv) {
    if (u.op === '*') { walk(u.a, inv); walk(u.b, inv); } else if (u.op === '/') { walk(u.a, inv); walk(u.b, !inv); } else if (u.neg) { f.k = -f.k; walk(u.neg, inv); } else if (isNum(u)) f.k = inv ? f.k / u.n : f.k * u.n;
    else (inv ? f.den : f.num).push(u);
  })(t, false);
  const sign = f.k < 0 ? '−' : '', k = Math.abs(f.k), fr = fracParts(k) || [k, 1];
  const join = (list) => list.map((u) => wrapP(u, 4)).reduce((acc, s) => acc + (acc && (/^\d/.test(s) || /^[a-z]{2,}[(|]/.test(s)) ? '·' : '') + s, '');
  const withNum = (n, s) => { const ns = n === 1 && s ? '' : numText(n); return ns + (ns && s && /^\d/.test(s) ? '·' : '') + s; };
  const top = withNum(fr[0], join(f.num));
  const bot = fr[1] === 1 && !f.den.length ? '' : (fr[1] === 1 ? '' : numText(fr[1])) + ((fr[1] !== 1 && f.den.length && /^\d/.test(join(f.den))) ? '·' : '') + join(f.den);
  if (!bot) return sign + top;
  const many = f.den.length + (fr[1] !== 1 ? 1 : 0) > 1;
  return `${sign}${top}/${many ? `(${bot})` : bot}`;
}
// A formula written the usual way: a polynomial in x as 3x² − 5x + 2, anything else tidied.
// (whichever way is shortest: 15(3x + 1)⁴ rather than all of it multiplied out; a fraction's top
// multiplied out: (x² − 2x − 1)/(x − 1)²)
function pretty(t, x) {
  const s = simp(t), out = [pr(s)];
  const poly = (u) => {
    if (!x || !letters(u).every((v) => v === x)) return null;
    try { const c = polyCoeffs((v) => mEval(u, { [x]: v, $rad: true })); return c ? polyText(c, x) : null; } catch (e) { return null; }
  };
  const p = poly(s);
  if (p) out.push(p);
  if (s.op === '/') { const n = poly(s.a); if (n) out.push(`${/[+−]/.test(n.replace(/^−/, '')) ? `(${n})` : n}/${wrapP(s.b, 7)}`); }
  return out.reduce((a, b) => (b.length < a.length ? b : a));
}

// ---------- Derivatives ----------
const lnOf = (a) => (a.c === 'e' ? Nn(1) : fn('ln', a));
function deriv(t, x) {
  if (t.n !== undefined) return Nn(0);
  if (t.v) return Nn(t.v === x ? 1 : 0);
  if (t.neg) return neg(deriv(t.neg, x));
  if (t.fact) { if (has(t.fact, x)) throw new Error('no derivative'); return Nn(0); }
  if (t.f) {
    const u = t.a;
    if (!has(u, x)) return Nn(0);
    const outer = {
      sqrt: () => dvd(Nn(1), mul(Nn(2), fn('sqrt', u))),
      cbrt: () => dvd(Nn(1), mul(Nn(3), pow(fn('cbrt', u), Nn(2)))),
      sin: () => fn('cos', u),
      cos: () => neg(fn('sin', u)),
      tan: () => dvd(Nn(1), pow(fn('cos', u), Nn(2))),
      exp: () => fn('exp', u),
      ln: () => dvd(Nn(1), u),
      log: () => dvd(Nn(1), mul(u, fn('ln', Nn(10)))),
      lg: () => dvd(Nn(1), mul(u, fn('ln', Nn(10)))),
      asin: () => dvd(Nn(1), fn('sqrt', sub(Nn(1), pow(u, Nn(2))))),
      acos: () => neg(dvd(Nn(1), fn('sqrt', sub(Nn(1), pow(u, Nn(2)))))),
      atan: () => dvd(Nn(1), add(Nn(1), pow(u, Nn(2)))),
      abs: () => dvd(u, fn('abs', u)),
    }[t.f];
    if (!outer) throw new Error('no derivative');
    return mul(outer(), deriv(u, x));
  }
  const { a, b } = t, ha = has(a, x), hb = has(b, x);
  if (t.op === '+') return add(deriv(a, x), deriv(b, x));
  if (t.op === '-') return sub(deriv(a, x), deriv(b, x));
  if (t.op === '*') return !ha ? mul(a, deriv(b, x)) : !hb ? mul(deriv(a, x), b) : add(mul(deriv(a, x), b), mul(a, deriv(b, x)));
  if (t.op === '/') return !hb ? dvd(deriv(a, x), b) : !ha ? neg(dvd(mul(a, deriv(b, x)), pow(b, Nn(2)))) : dvd(sub(mul(deriv(a, x), b), mul(a, deriv(b, x))), pow(b, Nn(2)));
  if (!hb) return mul(mul(b, pow(a, sub(b, Nn(1)))), deriv(a, x)); // n·uⁿ⁻¹·u′
  if (!ha) return mul(mul(pow(a, b), lnOf(a)), deriv(b, x)); // aᵛ·ln a·v′
  return mul(pow(a, b), add(mul(deriv(b, x), fn('ln', a)), dvd(mul(b, deriv(a, x)), a)));
}
// The derivative is checked against the slope of the original, worked out numerically.
function derivOk(T, D, x) {
  if (letters(T).some((v) => v !== x)) return true;
  let seen = 0;
  for (const v of [0.37, 1.23, 2.71, -0.83, 4.4, -2.2]) {
    const f = (u) => mEval(T, { [x]: u, $rad: true }), h = 1e-5 * Math.max(1, Math.abs(v));
    const num = (f(v + h) - f(v - h)) / (2 * h), got = mEval(D, { [x]: v, $rad: true });
    if (!Number.isFinite(num) || !Number.isFinite(got)) continue;
    if (Math.abs(num - got) > 1e-4 * (1 + Math.abs(got))) return false;
    seen++;
  }
  return seen > 0;
}
const PRIMES = ['', '′', '″', '‴'];
function topTerms(t, s = 1, out = []) {
  if (t.op === '+') { topTerms(t.a, s, out); topTerms(t.b, s, out); } else if (t.op === '-') { topTerms(t.a, s, out); topTerms(t.b, -s, out); } else out.push({ s, t });
  return out;
}
function diffSteps(T, x, dText) {
  const d = (u) => pretty(deriv(u, x), x), D = `d/d${x}`;
  const parts = topTerms(T);
  if (parts.length > 1 && parts.length <= 5) {
    return parts.map(({ s, t }) => `${D} ${s < 0 ? '−' : ''}${wrapP(simp(t), s < 0 ? 3 : 1)} = ${s < 0 ? pretty(neg(deriv(t, x)), x) : d(t)}`).concat(`Together: ${dText}`);
  }
  const t = T.neg ? T.neg : T;
  if (t.op === '*' && has(t.a, x) && has(t.b, x)) return [`Product rule: (uv)′ = u′v + uv′`, `u = ${pr(simp(t.a))}, v = ${pr(simp(t.b))} → u′ = ${d(t.a)}, v′ = ${d(t.b)}`, `Result: ${dText}`];
  if (t.op === '/' && has(t.b, x)) return [`Quotient rule: (u/v)′ = (u′v − uv′)/v²`, `u = ${pr(simp(t.a))}, v = ${pr(simp(t.b))} → u′ = ${d(t.a)}, v′ = ${d(t.b)}`, `Result: ${dText}`];
  if (t.f && has(t.a, x) && !t.a.v) return [`Chain rule: the derivative of ${t.f === 'sqrt' ? '√' : t.f}(…) times the derivative of the inside`, `Inside: ${pr(simp(t.a))} → ${d(t.a)}`, `Result: ${dText}`];
  if (t.op === '^' && !has(t.b, x) && has(t.a, x) && !t.a.v) return [`Chain rule: n·(inside)ⁿ⁻¹ · (inside)′`, `Inside: ${pr(simp(t.a))} → ${d(t.a)}`, `Result: ${dText}`];
  if (t.op === '^' && !has(t.b, x) && t.a.v === x) return [`Power rule: ${x}ⁿ → n·${x}ⁿ⁻¹`, `Result: ${dText}`];
  if (t.op === '^' && !has(t.a, x)) return [t.a.c === 'e' ? 'Chain rule: e^u → e^u · u′' : `Chain rule: ${pr(simp(t.a))}^u → ${pr(simp(t.a))}^u · ln ${pr(simp(t.a))} · u′`, `u = ${pr(simp(t.b))} → u′ = ${d(t.b)}`, `Result: ${dText}`];
  return [];
}
// "… at x = 2" / "…, when x = 2" at the end of a question → [rest, letter, value text]
function atPoint(s) {
  const m = s.match(/\s*(?:,\s*|\s+)(?:at|when|for|where|if|with)\s+([a-z])\s*=\s*([^=,;]+?)\s*$/i) || s.match(/\s*[,;|]\s*([a-z])\s*=\s*([^=,;]+?)\s*$/i);
  return m ? [s.slice(0, m.index).trim(), m[1].toLowerCase(), m[2]] : [s, null, null];
}
function qDiff(q) {
  let expr = null, x = null, order = 1, at = null, m;
  const [s0, atX, atV] = atPoint(q);
  const c = callOf(s0, ['diff', 'derivative', 'deriv', 'differentiate']);
  if (c && !c.rest && c.args.length >= 1 && c.args.length <= 3) {
    expr = c.args[0];
    if (c.args[1]) { if (!/^[a-z]$/i.test(c.args[1])) return null; x = c.args[1].toLowerCase(); }
    if (c.args[2]) { order = +c.args[2]; if (![1, 2, 3].includes(order)) return null; }
  } else if ((m = s0.match(/^(?:find\s+|work out\s+|the\s+)*(?:(second|2nd|third|3rd)\s+)?(?:derivative|differentiate|derive|производная)\s*(?:of\s+)?(.+?)(?:\s+(?:with respect to|w\.?r\.?t\.?|by)\s+([a-z]))?$/i))) {
    order = m[1] ? (/^(second|2nd)$/i.test(m[1]) ? 2 : 3) : 1;
    expr = m[2];
    x = m[3] ? m[3].toLowerCase() : null;
  } else if ((m = s0.match(/^d\s*(?:\^\s*\(?([23])\)?)?\s*(?:y|f)?\s*\/\s*d\s*([a-z])\s*(?:\^\s*\(?[23]\)?)?\s*(?:of\s+)?(.+)$/i)) || (m = s0.match(/^d([23])\s*\/\s*d([a-z])[23]\s+(.+)$/i))) {
    order = m[1] ? +m[1] : 1;
    x = m[2].toLowerCase();
    expr = m[3];
  } else if ((m = s0.match(/^(?:y|[fg]\s*\(\s*([a-z])\s*\))\s*=\s*(.+?)\s*[,;.]?\s*(?:find\s+|what is\s+|work out\s+)?(?:dy\s*\/\s*d([a-z])|y('{1,3})|[fg]('{1,3})\s*\(\s*([a-z])\s*\)|the derivative)$/i))) {
    x = (m[1] || m[3] || m[6] || '').toLowerCase() || null;
    expr = m[2];
    order = (m[4] || m[5] || "'").length;
  } else if ((m = s0.match(/^[fg]\s*\(\s*([a-z])\s*\)\s*=\s*(.+?)\s*[,;.]?\s*(?:find\s+|what is\s+)?[fg]('{1,3})\s*\(\s*([^()]+)\s*\)$/i))) {
    x = m[1].toLowerCase();
    expr = m[2];
    order = m[3].length;
    at = m[4];
  } else if ((m = s0.match(/^\((.+)\)\s*('{1,3})$/))) {
    expr = m[1];
    order = m[2].length;
  } else return null;
  const T = tree(expr);
  const ls = letters(T);
  x = x || (ls.length === 1 ? ls[0] : ls.includes('x') ? 'x' : ls[0] || 'x');
  if (atX && atX !== x) return null;
  if (atV !== null && atV !== undefined) at = atV;
  let D = T;
  const chain = [];
  for (let i = 0; i < order; i++) { D = simp(deriv(D, x)); chain.push(D); }
  if (!derivOk(T, chain[0], x)) return null;
  const dText = pretty(D, x), name = `f${PRIMES[order]}(${x})`;
  let steps = order === 1 ? diffSteps(T, x, dText) : chain.map((d, i) => `f${PRIMES[i + 1]}(${x}) = ${pretty(d, x)}`);
  if (at !== null) {
    const a = numOf(at), v = mEval(D, { [x]: a, $rad: true });
    if (!Number.isFinite(v)) return null;
    steps = steps.concat(`Put ${x} = ${valText(a)}: ${lab(`f${PRIMES[order]}(${valText(a)})`, v)}`);
    return answer('derivative', lab('', v).trim(), { sub: `${name} = ${dText}`, steps, lines: [lab('', v).trim()] });
  }
  return answer('derivative', `= ${dText}`, { steps: steps.length ? steps : [`${name} = ${dText}`], lines: [`= ${dText}`] });
}

// ---------- Integrals ----------
// t = k·x + c exactly → { k, c } (k ≠ 0), else null.
function linOf(t, x) {
  if (letters(t).some((v) => v !== x)) return null;
  const f = (v) => mEval(t, { [x]: v, $rad: true }), c = f(0), k = f(1) - c;
  if (!Number.isFinite(k) || Math.abs(k) < 1e-12) return null;
  for (const v of [2, -3.5, 7.25]) if (Math.abs(f(v) - (k * v + c)) > 1e-9 * (1 + Math.abs(f(v)))) return null;
  return { k: tidyCoef(k), c: tidyCoef(c) };
}
function integ(t, x) {
  if (!has(t, x)) return mul(t, { v: x });
  if (t.v === x) return dvd(pow({ v: x }, Nn(2)), Nn(2));
  if (t.neg) { const r = integ(t.neg, x); return r && neg(r); }
  if (t.op === '+' || t.op === '-') { const a = integ(t.a, x), b = a && integ(t.b, x); return b ? { op: t.op, a, b } : null; }
  if (t.op === '*') {
    if (!has(t.a, x)) { const r = integ(t.b, x); return r && mul(t.a, r); }
    if (!has(t.b, x)) { const r = integ(t.a, x); return r && mul(r, t.b); }
    return null;
  }
  if (t.op === '/') {
    if (!has(t.b, x)) { const r = integ(t.a, x); return r && dvd(r, t.b); }
    if (!has(t.a, x)) {
      const L = linOf(t.b, x);
      if (L) return mul(dvd(t.a, Nn(L.k)), fn('ln', fn('abs', t.b)));
      if (t.b.op === '^' && !has(t.b.b, x)) return integ(mul(t.a, pow(t.b.a, neg(t.b.b))), x);
      if (t.b.f === 'sqrt') return integ(mul(t.a, pow(t.b.a, Nn(-0.5))), x);
    }
    return null;
  }
  if (t.op === '^') {
    if (!has(t.b, x)) {
      const L = linOf(t.a, x), n = mEval(t.b, {});
      if (!L || !Number.isFinite(n)) return null;
      if (Math.abs(n + 1) < 1e-12) return dvd(fn('ln', fn('abs', t.a)), Nn(L.k));
      return dvd(pow(t.a, Nn(tidyNum(n + 1))), Nn(tidyNum((n + 1) * L.k)));
    }
    if (!has(t.a, x)) { const L = linOf(t.b, x); return L ? dvd(pow(t.a, t.b), mul(Nn(L.k), lnOf(t.a))) : null; }
    return null;
  }
  if (t.f) {
    const L = linOf(t.a, x);
    if (!L) return null;
    const u = t.a, k = Nn(L.k);
    switch (t.f) {
      case 'sin': return neg(dvd(fn('cos', u), k));
      case 'cos': return dvd(fn('sin', u), k);
      case 'tan': return neg(dvd(fn('ln', fn('abs', fn('cos', u))), k));
      case 'exp': return dvd(fn('exp', u), k);
      case 'sqrt': return dvd(mul(Nn(2), pow(u, Nn(1.5))), Nn(3 * L.k));
      case 'cbrt': return dvd(mul(Nn(3), pow(u, Nn(4 / 3))), Nn(4 * L.k));
      case 'ln': return dvd(sub(mul(u, fn('ln', u)), u), k);
      default: return null;
    }
  }
  return null;
}
// An antiderivative (checked by differentiating it back), or null.
function antider(T, x) {
  const only = letters(T).every((v) => v === x);
  if (only) {
    try {
      const c = polyCoeffs((v) => mEval(T, { [x]: v, $rad: true }));
      if (c) { const ci = [0, ...c.map((k, i) => tidyCoef(k / (i + 1)))]; return { text: polyText(ci, x), F: (v) => polyAt(ci, v), poly: true }; }
    } catch (e) { /* not a polynomial */ }
  }
  const R = integ(T, x);
  if (!R) return null;
  const S = simp(R);
  if (only) {
    let seen = 0;
    for (const v of [0.37, 1.3, 2.9, -0.8, 4.2, 0.9]) {
      const F = (u) => mEval(S, { [x]: u, $rad: true }), h = 1e-5, d = (F(v + h) - F(v - h)) / (2 * h), y = mEval(T, { [x]: v, $rad: true });
      if (!Number.isFinite(d) || !Number.isFinite(y)) continue;
      if (Math.abs(d - y) > 1e-4 * (1 + Math.abs(y))) return null;
      seen++;
    }
    if (!seen) return null;
  }
  return { text: pretty(S, x), F: (v) => mEval(S, { [x]: v, $rad: true }) };
}
function integrateNum(f, a, b) {
  if (a === b) return 0;
  for (let i = 0; i <= 400; i++) if (!Number.isFinite(f(a + ((b - a) * i) / 400))) return NaN; // (a gap in the curve)
  const simpson = (lo, hi, flo, fm, fhi) => ((hi - lo) / 6) * (flo + 4 * fm + fhi);
  let calls = 0;
  const rec = (lo, hi, flo, fm, fhi, whole, eps, depth) => {
    const m = (lo + hi) / 2, lm = (lo + m) / 2, rm = (m + hi) / 2, flm = f(lm), frm = f(rm);
    calls += 2;
    if (!Number.isFinite(flm) || !Number.isFinite(frm) || calls > 150000) return NaN;
    const left = simpson(lo, m, flo, flm, fm), right = simpson(m, hi, fm, frm, fhi);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
    return rec(lo, m, flo, flm, fm, left, eps / 2, depth - 1) + rec(m, hi, fm, frm, fhi, right, eps / 2, depth - 1);
  };
  const fa = f(a), fb = f(b), fm = f((a + b) / 2);
  return rec(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 1e-11, 45);
}
function qInt(q) {
  let s = q.trim(), a = null, b = null, x = null, expr, L;
  const c = callOf(s, ['int', 'integral', 'integrate']);
  if (c && !c.rest) {
    expr = c.args[0];
    const r = c.args[1] || '';
    if ((L = r.match(/^([a-z])\s*=\s*(.+?)\s*(?:\.\.|…|to)\s*(.+)$/i))) { x = L[1].toLowerCase(); a = L[2]; b = L[3]; } else if (r) { if (!/^[a-z]$/i.test(r)) return null; x = r.toLowerCase(); }
    if (c.args.length === 4) { a = c.args[2]; b = c.args[3]; } else if (c.args.length > 2) return null;
  } else {
    const m = s.match(/^(?:find\s+|work out\s+|the\s+)*(?:∫|(?:definite\s+|indefinite\s+)?integral(?:\s+of)?|integrate|интеграл)\s*/i);
    if (!m) return null;
    s = s.slice(m[0].length);
    L = s.match(/^_\s*\{?\s*([^{}^\s]+?)\s*\}?\s*\^\s*\{?\s*([^{}\s]+?)\s*\}?\s+/) || s.match(/^_\s*\(?([^()^\s]+?)\)?\s*\^\s*\(?([^()\s]+?)\)?\s+/)
      || s.match(/^\(\s*([^,()]+?)\s*(?:,|to|\.\.|…)\s*([^,()]+?)\s*\)\s*(?=\S)/i) || s.match(/^\[\s*([^,[\]]+?)\s*[,;]\s*([^,[\]]+?)\s*\]\s*/) || s.match(/^from\s+(\S+?)\s+to\s+(\S+?)\s+/i) || s.match(/^(-?[\d.]+|pi|π)\s*\^\s*\(?(-?[\d.]+|pi|π)\)?\s+(?=\S)/i);
    if (L) { a = L[1]; b = L[2]; s = s.slice(L[0].length); }
    if (a === null) {
      L = s.match(/\s+(?:from|between)\s+(?:([a-z])\s*=\s*)?(\S+?)\s+(?:to|and)\s+(\S+?)$/i) || s.match(/\s*,\s*([a-z])\s*=\s*(\S+?)\s*(?:to|\.\.|…)\s*(\S+?)$/i);
      if (L) { if (L[1]) x = L[1].toLowerCase(); a = L[2]; b = L[3]; s = s.slice(0, L.index); }
    }
    const D = s.match(/\s*\bd([a-z])\s*$/i) || s.match(/(?<=[\d)a-z²³])\s*d([a-z])\s*$/i);
    if (D) { x = x || D[1].toLowerCase(); s = s.slice(0, D.index); }
    if (a === null) {
      L = s.match(/\s+(?:from|between)\s+(\S+?)\s+(?:to|and)\s+(\S+?)$/i);
      if (L) { a = L[1]; b = L[2]; s = s.slice(0, L.index); }
    }
    expr = s.trim();
  }
  if (!expr) return null;
  const T = tree(expr), ls = letters(T);
  x = x || (ls.length === 1 ? ls[0] : ls.includes('x') ? 'x' : ls[0] || 'x');
  const P = antider(T, x);
  if (a === null) {
    if (!P) return null;
    const steps = P.poly ? [`Raise each power by one and divide by the new power: ${x}ⁿ → ${x}ⁿ⁺¹/(n + 1)`] : [];
    return answer('integral', `= ${P.text} + C`, { steps: steps.concat(`∫ ${pretty(T, x)} d${x} = ${P.text} + C`), lines: [`= ${P.text} + C`] });
  }
  if (letters(T).some((v) => v !== x)) return null;
  const A = numOf(a), B = numOf(b), f = (v) => mEval(T, { [x]: v, $rad: true });
  const num = integrateNum(f, A, B);
  if (P) {
    const Fa = P.F(A), Fb = P.F(B), v = tidyNum(Fb - Fa);
    if (Number.isFinite(v) && Number.isFinite(num) && Math.abs(v - num) < 1e-6 * (1 + Math.abs(v))) {
      const ta = valText(A), tb = valText(B);
      return answer('integral', lab('', v).trim(), { steps: [`F(${x}) = ${P.text}`, `F(${tb}) − F(${ta}) = ${valText(tidyNum(Fb))} − ${Fa < 0 ? `(${valText(tidyNum(Fa))})` : valText(tidyNum(Fa))} = ${valText(v)}`], lines: [lab('', v).trim()] });
    }
  }
  if (!Number.isFinite(num)) return null;
  return answer('integral', lab('', tidyNum(num)).trim(), { steps: ["There's no neat formula for this one, so it's worked out numerically"], lines: [lab('', tidyNum(num)).trim()] });
}

// ---------- Σ sums and Π products ----------
// Lagrange through (x, y) points → coefficients from the constant up (tidied), or null.
function interp(xs, ys) {
  let c = new Array(xs.length).fill(0);
  xs.forEach((xi, i) => {
    let basis = [1], den = 1;
    xs.forEach((xj, j) => { if (j !== i) { basis = polyMul(basis, [-xj, 1]); den *= xi - xj; } });
    basis.forEach((b, k) => { c[k] += (ys[i] * b) / den; });
  });
  c = c.map(tidyCoef);
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-9) c.pop();
  return c;
}
const lcmInt = (a, b) => (a / gcdInt(a, b)) * b;
function qSum(q) {
  let m, body, k, a, b, prod = false;
  const c = callOf(q, ['sum', 'prod', 'product']);
  if (c && !c.rest && (c.args.length === 4 || c.args.length === 2) && !(c.args.length === 4 && !/^[a-z]$/i.test(c.args[1]))) {
    prod = c.name !== 'sum';
    body = c.args[0];
    if (c.args.length === 4) [k, a, b] = c.args.slice(1);
    else { const r = c.args[1].match(/^([a-z])\s*=\s*(.+?)\s*(?:\.\.|…|to)\s*(.+)$/i); if (!r) return null; [, k, a, b] = r; }
  } else {
    const W = /^(?:find\s+|work out\s+|the\s+)*(Σ|σ|Π|sum|product|сумма)\s*(?:of\s+)?/i;
    const w = q.match(W);
    if (!w) return null;
    prod = w[1] === 'Π' || /^product$/i.test(w[1]);
    const s = q.slice(w[0].length), TO = '(?:to|\\.\\.|…|->|→|until|till)';
    if ((m = s.match(/^_\s*\{?\s*\(?\s*([a-z])\s*=\s*([^{}^\s)]+?)\s*\)?\s*\}?\s*\^\s*\{?\s*\(?([^{}\s)]+?)\)?\s*\}?\s+(.+)$/i))) [, k, a, b, body] = m;
    else if ((m = s.match(new RegExp(`^\\(?\\s*([a-z])\\s*=\\s*(\\S+?)\\s*(?:${TO}|,)\\s*(\\S+?)\\s*\\)?\\s+(?:of\\s+)?(.+)$`, 'i')))) [, k, a, b, body] = m;
    else if ((m = s.match(new RegExp(`^(.+?)\\s*(?:,|\\bfor\\b|\\bwhere\\b|\\bwith\\b|\\bover\\b)?\\s*\\b([a-z])\\s*=\\s*(\\S+?)\\s*${TO}\\s*(\\S+?)$`, 'i')))) [, body, k, a, b] = m;
    else if ((m = s.match(/^(.+?)\s+from\s+(?:([a-z])\s*=\s*)?(\S+?)\s+to\s+(\S+?)$/i))) [, body, k, a, b] = m;
    else return null;
  }
  const T = tree(body.trim().replace(/[,;]$/, ''));
  const ls = letters(T);
  k = (k || (ls.length === 1 ? ls[0] : ls.find((v) => 'kijnr'.includes(v)) || '')).toLowerCase();
  if (!k || ls.some((v) => v !== k)) return null;
  const A = numOf(a);
  if (!Number.isInteger(A)) return null;
  const symb = /^[a-z]$/i.test(String(b).trim()) && String(b).trim().toLowerCase() !== k ? String(b).trim().toLowerCase() : null;
  const term = (i) => mEval(T, { [k]: i });
  if (symb) {
    if (prod) return null;
    // Σ … for k = 1 to n: add up the first few totals and find the formula they follow
    const xs = [], ys = [];
    let tot = 0;
    for (let n = A - 1; n <= A + 8; n++) { if (n >= A) tot += term(n); if (!Number.isFinite(tot)) return null; xs.push(n); ys.push(tot); }
    const cf = interp(xs.slice(0, 8), ys.slice(0, 8));
    if (cf.length > 7 || xs.slice(8).some((n, i) => Math.abs(polyAt(cf, n) - ys[8 + i]) > 1e-6 * (1 + Math.abs(ys[8 + i])))) return null;
    let L = 1;
    for (const v of cf) { const fr = fracParts(Math.abs(v)); if (!fr) return null; L = lcmInt(L, fr[1]); }
    const ci = cf.map((v) => Math.round(v * L)), ft = factorText(ci, symb) || polyText(ci, symb);
    const text = L === 1 ? ft : /^[^()]*\(.*\)$|^[a-z]$/.test(ft) || !/[+−]/.test(ft.replace(/\(.*?\)/g, '')) ? `${ft}/${L}` : `(${ft})/${L}`;
    const first = ys.slice(1, 5).map(numText).join(', ');
    return answer('sum', `= ${text}`, { steps: [`Totals for ${symb} = ${A}, ${A + 1}, ${A + 2}, ${A + 3}: ${first}, …`, `The formula that gives every one of these totals: ${text}`], lines: [`= ${text}`] });
  }
  const B = numOf(b);
  if (!Number.isInteger(B) || B - A > 2e5) return null;
  let tot = prod ? 1 : 0;
  const shown = [];
  for (let i = A; i <= B; i++) {
    const v = term(i);
    if (!Number.isFinite(v)) return null;
    tot = prod ? tot * v : tot + v;
    if (i - A < 3 || i === B || B - A < 6) shown.push(numText(v));
  }
  if (!Number.isFinite(tot)) return null;
  const sign = prod ? ' × ' : ' + ', n = B - A + 1;
  const list = n <= 6 ? shown.join(sign) : shown.slice(0, 3).join(sign) + sign + '…' + sign + shown[shown.length - 1];
  const res = valText(tidyNum(tot));
  const main = res.startsWith('≈') ? res : `= ${res}`;
  return answer('sum', main, { steps: n < 1 ? ['There are no terms, so the total is ' + (prod ? '1' : '0')] : [`${k} = ${A}${n > 2 ? `, ${A + 1}, …` : ''}${n > 1 ? `, ${B}` : ''} gives ${list}`, `${prod ? 'Product' : 'Total'}: ${res.replace(/^≈ /, '≈ ')}`], lines: [main] });
}

// ---------- Statistics ----------
const STAT_NAMES = [
  ['mean', /^(?:arithmetic\s+)?(?:mean|average|avg|среднее(?:\s+арифметическое)?|x̄)$/],
  ['median', /^(?:median|медиана|q2|second quartile|2nd quartile)$/],
  ['mode', /^(?:modes?|мода)$/],
  ['range', /^(?:range|размах)$/],
  ['var', /^(?:(?:sample\s+|population\s+)?variance|var|дисперсия|σ\^2|σ²)$/],
  ['sd', /^(?:(?:sample\s+|population\s+)?(?:standard\s+deviation|std\.?\s*dev\.?|std|s\.?d\.?|σ)|(?:стандартное|среднеквадратичное|среднее\s+квадратичное)\s+отклонение)$/],
  ['quartiles', /^quartiles$/],
  ['q1', /^(?:(?:lower|first|1st)\s+quartile|q1)$/],
  ['q3', /^(?:(?:upper|third|3rd)\s+quartile|q3)$/],
  ['iqr', /^(?:iqr|inter-?\s*quartile\s+range)$/],
  ['qd', /^(?:quartile\s+deviation|semi-?\s*inter-?\s*quartile\s+range|qd|q\.d\.?)$/],
  ['total', /^(?:sum|total)$/],
  ['min', /^(?:min|minimum|smallest(?:\s+value)?|lowest)$/],
  ['max', /^(?:max|maximum|largest(?:\s+value)?|highest)$/],
  ['summary', /^(?:summary|stats|statistics|five[-\s]number\s+summary|all)$/],
];
function statName(w) {
  w = w.trim().toLowerCase().replace(/^(?:the|a)\s+/, '').replace(/\s+/g, ' ');
  for (const [id, re] of STAT_NAMES) if (re.test(w)) return id;
  return null;
}
function numList(s) {
  s = s.trim().replace(/^[([{]\s*|\s*[)\]}]$/g, '').replace(/\s+and\s+|&/gi, ',');
  const semi = s.includes(';');
  const parts = (semi ? s.split(';') : s.split(/\s*,\s*|\s+/)).map((p) => p.trim()).filter(Boolean);
  const nums = parts.map((p) => (semi ? p.replace(',', '.') : p)).map((p) => (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(p) ? parseFloat(p) : NaN));
  return nums.length && nums.every(Number.isFinite) ? nums : null;
}
// 2 decimal places at most, marked ≈ when rounded; lists use up to 4 places.
const st2 = (v) => { const r = Math.round(v * 100) / 100; return Math.abs(v - r) < 1e-9 ? minus(String(r)) : '≈ ' + minus(String(r)); };
const eqOr = (v) => { const s = st2(v); return s.startsWith('≈') ? s : '= ' + s; };
const stL = (name, v) => { const s = st2(v); return s.startsWith('≈') ? `${name} ${s}` : `${name} = ${s}`; };
const plain4 = (v) => minus(String(parseFloat(v.toFixed(4))));
const listText = (a) => (a.length <= 10 ? a.map(plain4).join(', ') : a.slice(0, 5).map(plain4).join(', ') + ', …, ' + a.slice(-2).map(plain4).join(', '));
function qStats(q) {
  // (each number and each separator can be read only one way, so a long list can't make it slow)
  const m = q.match(/[\s:([{]*((?:[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*[,;&]\s*|\s+and\s+|\s+))*[-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*[)\]}]?\s*$/i);
  if (!m) return null;
  const xs = numList(m[1]);
  if (!xs || xs.length > 5000) return null;
  let pre = q.slice(0, m.index).trim().replace(/[:([{]\s*$/, '').trim();
  pre = pre.replace(/^(?:please\s+)?(?:find|calculate|compute|work out|determine|what(?:'s| is| are)|give|get)\s+/i, '');
  pre = pre.replace(/\s+(?:of|for|in)(?:\s+(?:the|these|this))?(?:\s+(?:following|given))?(?:\s+(?:numbers|data(?:\s+set)?|values|set|list|marks|scores|observations|results))?\s*$/i, '').trim();
  if (!pre) return null;
  const names = pre.split(/\s*(?:,|\band\b|&|\+)\s*/i).filter(Boolean).map(statName);
  if (!names.length || names.some((n) => !n)) return null;
  const n = xs.length, sorted = xs.slice().sort((a, b) => a - b), total = xs.reduce((a, b) => a + b, 0), mean = total / n;
  const ordered = `In order: ${listText(sorted)}`;
  const qAt = (p) => { const pos = p * (n + 1); if (pos <= 1) return sorted[0]; if (pos >= n) return sorted[n - 1]; const i = Math.floor(pos), f = pos - i; return sorted[i - 1] + f * (sorted[i] - sorted[i - 1]); };
  const qStep = (label, p) => {
    const pos = p * (n + 1), v = qAt(p), frac = pos - Math.floor(pos);
    const where = p === 0.25 ? '(n + 1)/4' : '3(n + 1)/4';
    if (Math.abs(frac) < 1e-9 || pos <= 1 || pos >= n) return `${label}: ${where} = ${plain4(pos)} → the ${nth(Math.min(n, Math.max(1, Math.round(pos))))} value = ${plain4(v)}`;
    const i = Math.floor(pos), part = Math.abs(frac - 0.5) < 1e-9 ? 'halfway' : Math.abs(frac - 0.25) < 1e-9 ? 'a quarter of the way' : Math.abs(frac - 0.75) < 1e-9 ? 'three quarters of the way' : `${plain4(frac)} of the way`;
    return `${label}: ${where} = ${plain4(pos)} → ${part} from ${plain4(sorted[i - 1])} to ${plain4(sorted[i])} = ${plain4(v)}`;
  };
  const med = qAt(0.5), q1 = qAt(0.25), q3 = qAt(0.75);
  const ss = xs.reduce((s, v) => s + (v - mean) ** 2, 0);
  const meanStep = `Mean = ${plain4(total)} ÷ ${n} ${eqOr(mean)}`;
  const medStep = n % 2 ? `The middle (${nth((n + 1) / 2)}) value is ${plain4(med)}` : `Middle two: ${plain4(sorted[n / 2 - 1])} and ${plain4(sorted[n / 2])} → their average is ${plain4(med)}`;
  const devStep = `Distance from the mean, squared: ${listText(xs.map((v) => (v - mean) ** 2))} → total ${plain4(ss)}`;
  const out = [];
  for (const id of names) {
    if (id === 'mean') out.push({ main: stL('mean', mean), steps: [`Add them: ${plain4(total)}`, meanStep] });
    if (id === 'median') out.push({ main: `median = ${plain4(med)}`, steps: [ordered, medStep] });
    if (id === 'mode') {
      const cnt = new Map();
      xs.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
      const top = Math.max(...cnt.values()), modes = [...cnt].filter(([, c]) => c === top).map(([v]) => v).sort((a, b) => a - b);
      if (top === 1) out.push({ main: 'no mode', steps: ['Every value appears only once'] });
      else out.push({ main: `mode = ${modes.map(plain4).join(' and ')}`, steps: [`${modes.map(plain4).join(' and ')} ${modes.length > 1 ? 'appear' : 'appears'} most often (${top} times)`] });
    }
    if (id === 'range') out.push({ main: `range = ${plain4(sorted[n - 1] - sorted[0])}`, steps: [`Largest − smallest = ${plain4(sorted[n - 1])} − ${plain4(sorted[0])} = ${plain4(sorted[n - 1] - sorted[0])}`] });
    if (id === 'total') out.push({ main: `total = ${plain4(total)}`, steps: [`${listText(xs).replace(/, /g, ' + ')} = ${plain4(total)}`] });
    if (id === 'min') out.push({ main: `min = ${plain4(sorted[0])}`, steps: [ordered] });
    if (id === 'max') out.push({ main: `max = ${plain4(sorted[n - 1])}`, steps: [ordered] });
    if (id === 'var') {
      out.push({ main: stL('σ²', ss / n), sub: n > 1 ? stL('sample s²', ss / (n - 1)) : '', steps: [meanStep, devStep, `σ² = ${plain4(ss)} ÷ ${n} ${eqOr(ss / n)}${n > 1 ? ` · s² = ${plain4(ss)} ÷ ${n - 1} ${eqOr(ss / (n - 1))}` : ''}`] });
    }
    if (id === 'sd') {
      const sp = Math.sqrt(ss / n), s = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;
      out.push({ main: stL('σ', sp), sub: n > 1 ? stL('sample s', s) : '', steps: [meanStep, devStep, `σ = √(${plain4(ss)} ÷ ${n}) ${eqOr(sp)}${n > 1 ? ` · s = √(${plain4(ss)} ÷ ${n - 1}) ${eqOr(s)}` : ''}`] });
    }
    if (id === 'quartiles') out.push({ main: `Q1 = ${plain4(q1)} · Q3 = ${plain4(q3)}`, sub: `median = ${plain4(med)}`, steps: [ordered, qStep('Q1', 0.25), qStep('Q3', 0.75)] });
    if (id === 'q1') out.push({ main: `Q1 = ${plain4(q1)}`, steps: [ordered, qStep('Q1', 0.25)] });
    if (id === 'q3') out.push({ main: `Q3 = ${plain4(q3)}`, steps: [ordered, qStep('Q3', 0.75)] });
    if (id === 'iqr') out.push({ main: `IQR = ${plain4(q3 - q1)}`, sub: `Q1 = ${plain4(q1)} · Q3 = ${plain4(q3)}`, steps: [ordered, qStep('Q1', 0.25), qStep('Q3', 0.75), `IQR = Q3 − Q1 = ${plain4(q3)} − ${plain4(q1)} = ${plain4(q3 - q1)}`] });
    if (id === 'qd') out.push({ main: `QD = ${plain4((q3 - q1) / 2)}`, sub: `Q1 = ${plain4(q1)} · Q3 = ${plain4(q3)}`, steps: [ordered, qStep('Q1', 0.25), qStep('Q3', 0.75), `QD = (Q3 − Q1) ÷ 2 = (${plain4(q3)} − ${plain4(q1)}) ÷ 2 = ${plain4((q3 - q1) / 2)}`] });
    if (id === 'summary') {
      out.push({ main: `min ${plain4(sorted[0])} · Q1 ${plain4(q1)} · median ${plain4(med)} · Q3 ${plain4(q3)} · max ${plain4(sorted[n - 1])}`, sub: `${stL('mean', mean)} · ${stL('σ', Math.sqrt(ss / n))}`, steps: [ordered, qStep('Q1', 0.25), medStep, qStep('Q3', 0.75), meanStep] });
    }
  }
  const main = out.map((o) => o.main).join(' · '), sub = out.map((o) => o.sub).filter(Boolean).join(' · ');
  const steps = [];
  out.forEach((o) => o.steps.forEach((s) => { if (!steps.includes(s)) steps.push(s); }));
  return answer('stats', main, { sub, steps, lines: out.flatMap((o) => [o.main, o.sub]).filter(Boolean) });
}

// ---------- Everything else: sums, equations … (solveMath), with steps ----------
// A call like name(a, b, …) at the start: { name, args, rest } or null.
function callOf(q, names) {
  const m = q.match(/^\s*([a-z]+)\s*\(/i);
  if (!m || !names.includes(m[1].toLowerCase())) return null;
  let d = 0;
  for (let i = m[0].length - 1; i < q.length; i++) {
    if (q[i] === '(') d++;
    else if (q[i] === ')' && !--d) {
      const inner = q.slice(m[0].length, i), args = [];
      let depth = 0, cur = '';
      for (const ch of inner) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { args.push(cur.trim()); cur = ''; } else cur += ch; }
      args.push(cur.trim());
      return { name: m[1].toLowerCase(), args, rest: q.slice(i + 1).trim() };
    }
  }
  return null;
}
const nCr = (n, r) => { let v = 1; for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i; return Math.round(v); };
const nPr = (n, r) => { let v = 1; for (let i = 0; i < r; i++) v *= n - i; return v; };
// C(10, 3), 10C3, P(10, 3), gcd/lcm, and a few words (plus, times, 15% of …) → plain sums.
function wordsAndCounts(s, steps) {
  const ok = (n, r) => n <= 170 && r <= n;
  const C = (n, r) => { n = +n; r = +r; if (!ok(n, r)) throw new Error('too big'); const v = nCr(n, r); steps.push(`C(${n}, ${r}) = ${n}! ÷ (${r}! · ${n - r}!) = ${v}`); return `(${v})`; };
  const P = (n, r) => { n = +n; r = +r; if (!ok(n, r)) throw new Error('too big'); const v = nPr(n, r); steps.push(`P(${n}, ${r}) = ${n}! ÷ ${n - r}! = ${v}`); return `(${v})`; };
  s = s.replace(/\b(?:C|nCr|ncr|binom|comb)\s*\(\s*(\d+)\s*[,;]\s*(\d+)\s*\)/g, (m, n, r) => C(n, r))
    .replace(/\b(\d+)\s*C\s*(\d+)\b/g, (m, n, r) => C(n, r)).replace(/\b(\d+)\s+choose\s+(\d+)\b/gi, (m, n, r) => C(n, r))
    .replace(/\b(?:P|nPr|npr|perm)\s*\(\s*(\d+)\s*[,;]\s*(\d+)\s*\)/g, (m, n, r) => P(n, r)).replace(/\b(\d+)\s*P\s*(\d+)\b/g, (m, n, r) => P(n, r));
  s = s.replace(/\b(gcd|hcf|gcf|lcm)\s*(?:of\s+)?\(?\s*(\d+(?:\s*(?:,|and|&)\s*\d+)+)\s*\)?/gi, (m, f, list) => {
    const ns = list.split(/\s*(?:,|and|&)\s*/i).map(Number), lcm = /lcm/i.test(f);
    const v = ns.reduce((a, b) => (lcm ? lcmInt(a, b) : gcdInt(a, b)));
    steps.push(`${lcm ? 'Lowest common multiple' : 'Highest common factor'} of ${ns.join(', ')} = ${v}`);
    return `(${v})`;
  });
  return s.replace(/(\d)\s*%\s*of\s+/gi, '$1%*').replace(/\bsquare root of\s+/gi, 'sqrt ').replace(/\bcube root of\s+/gi, 'cbrt ')
    .replace(/\bplus\b/gi, '+').replace(/\bminus\b/gi, '-').replace(/\b(?:times|multiplied by)\b/gi, '*').replace(/\bdivided by\b/gi, '/')
    .replace(/\bsquared\b/gi, '^2').replace(/\bcubed\b/gi, '^3').replace(/\bto the power(?: of)?\b/gi, '^');
}
function eqSteps(src) {
  try {
    const toks = mTokens(prepMath(src)), k = toks.findIndex((t) => t.o === '=');
    const vs = varsOf(toks);
    if (k < 1 || vs.length !== 1) return [];
    const x = vs[0], L = mParse(toks.slice(0, k)), R = mParse(toks.slice(k + 1));
    const f = (t) => mEval(L, { [x]: t }) - mEval(R, { [x]: t }), p = polyOf(f);
    if (!p) return [];
    const { a, b, c } = p, n = (v) => coefText(Math.abs(v)).replace(/^/, v < 0 ? '−' : ''), par = (v) => (v < 0 ? `(${n(v)})` : n(v));
    if (Math.abs(a) < 1e-12 && Math.abs(b) > 1e-12) {
      const st = [`${x} on one side, numbers on the other: ${polyText([0, b], x)} = ${n(-c)}`];
      if (Math.abs(b - 1) > 1e-12) st.push(`Divide by ${n(b)}: ${eqLine(x, -c / b)}`);
      return st;
    }
    if (Math.abs(a) > 1e-12) {
      const D = b * b - 4 * a * c, rt = Math.sqrt(Math.abs(D)), sq = Number.isInteger(rt) ? String(rt) : `√${n(D)}`;
      const st = [isNum(R) && R.n === 0 ? '' : `Everything on one side: ${polyText([c, b, a], x)} = 0`, `a = ${n(a)}, b = ${n(b)}, c = ${n(c)}`, `D = b² − 4ac = ${par(b)}² − 4·${par(a)}·${par(c)} = ${n(D)}`];
      if (D > 1e-12) st.push(`${x} = (−b ± √D) ÷ 2a = (${n(-b)} ± ${sq}) ÷ ${n(2 * a)}`);
      else if (Math.abs(D) <= 1e-12) st.push(`D = 0, so one root: ${x} = −b ÷ 2a`);
      else st.push('D is below 0, so there are no real roots');
      return st.filter(Boolean);
    }
  } catch (e) { /* no steps */ }
  return [];
}
function qPlain(q) {
  const steps = [];
  let s = q.replace(/^(?:please\s+)?(?:find|calculate|compute|work out|evaluate|solve|what(?:'s| is)|how much is)\s+/i, '');
  let mode = null;
  const mm = s.match(/^(expand|multiply out|factori[sz]e|factor|simplify)\s+/i);
  if (mm) { mode = /fact/i.test(mm[1]) ? 'factor' : /simplify/i.test(mm[1]) ? null : 'expand'; s = s.slice(mm[0].length); }
  s = wordsAndCounts(s, steps).trim();
  if (!s) return null;
  // two equations with two letters: "x + y = 10, x − y = 2" · "…; …" · "… and …"
  if ((s.match(/=/g) || []).length === 2) {
    const parts = s.split(/\s*(?:;|\band\b|,\s+)\s*/i).filter((p) => /=/.test(p));
    if (parts.length === 2) {
      const r = solveSystem(parts[0], parts[1]);
      if (r) return answer('system', r.lines.join(' · '), { steps: ['Two equations with two unknowns, solved together (the answer fits both)'], lines: r.lines });
    }
  }
  if (mode) {
    const toks = mTokens(prepMath(s)), vs = varsOf(toks);
    if (vs.length === 1 && !toks.some((t) => RELATIONS.includes(t.o))) {
      const T = mParse(toks), x = vs[0], c = polyCoeffs((t) => mEval(T, { [x]: t }));
      if (c) {
        const out = mode === 'factor' ? factorText(c, x) : polyText(c, x);
        if (!out) return answer('simplify', "can't be factorised", { steps: ['No whole-number factors'], lines: ["can't be factorised"] });
        return answer('simplify', `= ${out}`, { lines: [`= ${out}`] });
      }
    }
  }
  const r = solveMath(s);
  if (!r) return null;
  if (r.kind === 'value') return { ...answer('value', r.lines[0].startsWith('≈') ? r.lines[0] : `= ${r.lines[0]}`, { steps }), lines: r.lines };
  if (r.kind === 'equation') {
    const shown = r.lines.filter((l) => !/^D = /.test(l));
    return answer('equation', shown.join(' · '), { sub: /no real/.test(r.lines.join()) ? r.lines[0] : '', steps: steps.concat(eqSteps(s)), lines: r.lines });
  }
  if (r.kind === 'check') return { ...answer('check', r.ok ? '✓ correct' : `✗ it's ${r.lines[0].replace(/^✗ = /, '')}`), ok: r.ok, lines: r.lines };
  return answer(r.kind, r.kind === 'simplify' ? r.lines[0] : r.lines.join(' · '), { steps, lines: r.lines });
}

function solveQuestion(src) {
  try {
    const q = normQ(src);
    if (!q || q.length > 1500) return null;
    return qStats(q) || qSum(q) || qDiff(q) || qInt(q) || qPlain(q);
  } catch (e) { return null; }
}
if (typeof module !== 'undefined') module.exports = { solveMath, solveSystem, solveQuestion, unknownsIn, showNum };
