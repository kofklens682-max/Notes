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
   solveMath(text) → { kind: 'value' | 'equation' | 'inequality' | 'check' | 'simplify', lines: [...], ok? } or null. */

const MATH_FUNCS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, lg: Math.log10,
  sin: (v) => Math.sin((v * Math.PI) / 180), cos: (v) => Math.cos((v * Math.PI) / 180), tan: (v) => Math.tan((v * Math.PI) / 180),
  asin: (v) => (Math.asin(v) * 180) / Math.PI, acos: (v) => (Math.acos(v) * 180) / Math.PI, atan: (v) => (Math.atan(v) * 180) / Math.PI,
};
const MATH_CONSTS = { pi: Math.PI, e: Math.E };
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
    if (t.c) return { n: MATH_CONSTS[t.c] };
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
  if (t.f) return MATH_FUNCS[t.f](mEval(t.a, env));
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
const SUP = ['', '', '²', '³', '⁴', '⁵', '⁶'];
const coefText = (a) => { const s = showNum(a); return s && !s.startsWith('≈') ? s : String(parseFloat(a.toFixed(4))); };
// 3x² − 5x + 2
function polyText(c, x) {
  let out = '';
  for (let k = c.length - 1; k >= 0; k--) {
    const v = c[k];
    if (v === 0) continue;
    const a = Math.abs(v), n = coefText(a);
    const num = k === 0 ? n : a === 1 ? '' : n.includes('/') ? `(${n})` : n;
    const term = k === 0 ? num : `${num}${x}${SUP[k]}`;
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
if (typeof module !== 'undefined') module.exports = { solveMath, solveSystem, unknownsIn, showNum };
