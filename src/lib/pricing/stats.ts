// Statistical helpers used by all pricing models.

// Standard normal PDF
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF via Cody (1969) erfc — double-precision accurate
// (~1e-15). This is the same family of approximations used inside the
// libraries underlying Bloomberg analytics and Numerical Recipes.
function erfcCody(x: number): number {
  // Chebyshev rational approximations from W. J. Cody, "Rational Chebyshev
  // approximations for the error function", Math. Comp. 23 (1969).
  const ax = Math.abs(x);
  let r: number;
  if (ax < 0.46875) {
    // erf via region 1
    const a = [
      3.16112374387056560e0, 1.13864154151050156e2, 3.77485237685302021e2,
      3.20937758913846947e3, 1.85777706184603153e-1,
    ];
    const b = [
      2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3,
      2.84423683343917062e3,
    ];
    const y = ax * ax;
    let xnum = a[4] * y;
    let xden = y;
    for (let i = 0; i < 3; i++) {
      xnum = (xnum + a[i]) * y;
      xden = (xden + b[i]) * y;
    }
    const erf = (x * (xnum + a[3])) / (xden + b[3]);
    return 1 - erf;
  }
  if (ax < 4) {
    const c = [
      5.64188496988670089e-1, 8.88314979438837594e0, 6.61191906371416295e1,
      2.98635138197400131e2, 8.81952221241769090e2, 1.71204761263407058e3,
      2.05107837782607147e3, 1.23033935479799725e3, 2.15311535474403846e-8,
    ];
    const d = [
      1.57449261107098347e1, 1.17693950891312499e2, 5.37181101862009858e2,
      1.62138957456669019e3, 3.29079923573345963e3, 4.36261909014324716e3,
      3.43936767414372164e3, 1.23033935480374942e3,
    ];
    let xnum = c[8] * ax;
    let xden = ax;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + c[i]) * ax;
      xden = (xden + d[i]) * ax;
    }
    let result = (xnum + c[7]) / (xden + d[7]);
    const ysq = Math.floor(ax * 16) / 16;
    const del = (ax - ysq) * (ax + ysq);
    result = Math.exp(-ysq * ysq) * Math.exp(-del) * result;
    return x < 0 ? 2 - result : result;
  }
  // ax >= 4
  const p = [
    3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1,
    1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2,
  ];
  const q = [
    2.56852019228982242e0, 1.87295284992346047e0, 5.27905102951428413e-1,
    6.05183413124413191e-2, 2.33520497626869185e-3,
  ];
  const y = 1 / (ax * ax);
  let xnum = p[5] * y;
  let xden = y;
  for (let i = 0; i < 4; i++) {
    xnum = (xnum + p[i]) * y;
    xden = (xden + q[i]) * y;
  }
  let result = (y * (xnum + p[4])) / (xden + q[4]);
  result = (1 / Math.sqrt(Math.PI) - result) / ax;
  const ysq = Math.floor(ax * 16) / 16;
  const del = (ax - ysq) * (ax + ysq);
  result = Math.exp(-ysq * ysq) * Math.exp(-del) * result;
  return x < 0 ? 2 - result : result;
}

export function normCdf(x: number): number {
  return 0.5 * erfcCody(-x / Math.SQRT2);
}

// Mulberry32 seeded PRNG — deterministic uniforms in (0,1)
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller — version classique (cos seulement). Conservé pour compat
// éventuelle ; préférer boxMullerPair qui exploite cos ET sin.
export function boxMuller(u1: number, u2: number): number {
  const safe = Math.max(u1, 1e-12);
  return Math.sqrt(-2 * Math.log(safe)) * Math.cos(2 * Math.PI * u2);
}

// Box-Muller dual : retourne DEUX normales iid à partir de deux uniformes.
// Ne gaspille pas la moitié de l'entropie (le sin est utilisé aussi).
// Référence : Box & Muller (1958), Annals of Math. Statistics 29.
export function boxMullerPair(u1: number, u2: number): [number, number] {
  const safe = Math.max(u1, 1e-12);
  const r = Math.sqrt(-2 * Math.log(safe));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

export function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stddev(xs: number[], m?: number): number {
  const mu = m ?? mean(xs);
  let s = 0;
  for (const x of xs) {
    const d = x - mu;
    s += d * d;
  }
  return Math.sqrt(s / (xs.length - 1));
}
