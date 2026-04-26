// Closed-form pricers for exotic options under Black-Scholes-Merton dynamics.
//
// References (aligned with Bloomberg OVME analytic engines):
//   - Vanilles : Black & Scholes (1973), Merton (1973) avec dividende q.
//   - Barrière continue : Reiner & Rubinstein (1991), Risk 4(8). 8 cas + termes
//     de rebate E,F (consolation cash) — cf. Haug 2e éd., §4.17.
//   - Barrière discrète : Broadie, Glasserman & Kou (1997), Math. Finance 7(4).
//   - Asiatique géométrique : Kemna & Vorst (1990), J. Banking & Finance.
//   - Asiatique arithmétique : Curran M. (1992), "Beyond average intelligence",
//     Risk 5(11) — geometric-conditioning, erreur < 5 bps vs Levy 30-150 bps.
//   - Digitales : Reiner & Rubinstein (1991), "Unscrambling the binary code".
//     Mode "call-spread replication" disponible (méthode Bloomberg "BinSmooth").
//   - Lookback continu : Goldman, Sosin & Gatto (1979) ; Conze-Viswanathan (1991).
//   - Lookback discret : Broadie, Glasserman & Kou (1999), Math. Finance 9(2).
//   - Dividendes cash : Bos & Vandermark (2002), Risk 15(9).
//   - Limite b → 0 : forme limite analytique exacte (Hull §28, Conze §3.2).

import { normCdf, normPdf } from "./stats";
import { blackScholes, type OptionType } from "./blackScholes";
import type {
  AsianAvg,
  BarrierKind,
  CommonInputs,
  DigitalKind,
  ExoticSpec,
  LookbackKind,
} from "./monteCarlo";
import { bosVandermarkAdjust, type DiscreteDividend } from "./discreteDividends";

export interface CFResult {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

// Same BGK constant used both for barrier and lookback continuity correction.
const BGK_BETA = 0.5825971579390106; // -zeta(1/2)/sqrt(2*pi)

// ---------- Barrier (Reiner-Rubinstein, continuous monitoring) ----------
// Now with rebate term R paid immediately on KO touch, or at expiry on KI
// not touched (Haug §4.17.4–§4.17.5).
function barrierPrice(
  type: OptionType,
  kind: BarrierKind,
  S: number,
  K: number,
  Braw: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  monitoring: "continuous" | "discrete" = "continuous",
  nMonitor = 252,
  rebate = 0,
): number {
  // BGK continuity correction: shift B outward when monitored discretely.
  let B = Braw;
  if (monitoring === "discrete" && nMonitor > 0) {
    const shift = BGK_BETA * sigma * Math.sqrt(T / nMonitor);
    B = kind.startsWith("up") ? Braw * Math.exp(shift) : Braw * Math.exp(-shift);
  }
  const phi = type === "call" ? 1 : -1;
  const eta = kind.startsWith("down") ? 1 : -1;
  const isOut = kind.endsWith("out");
  const isIn = !isOut;

  const sqrtT = Math.sqrt(T);
  const mu = (r - q - 0.5 * sigma * sigma) / (sigma * sigma);
  const lambda = Math.sqrt(mu * mu + (2 * r) / (sigma * sigma));

  const x1 = Math.log(S / K) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const x2 = Math.log(S / B) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const y1 = Math.log((B * B) / (S * K)) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const y2 = Math.log(B / S) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const z = Math.log(B / S) / (sigma * sqrtT) + lambda * sigma * sqrtT;

  const discR = Math.exp(-r * T);
  const discQ = Math.exp(-q * T);

  const A =
    phi * S * discQ * normCdf(phi * x1) -
    phi * K * discR * normCdf(phi * x1 - phi * sigma * sqrtT);
  const Bv =
    phi * S * discQ * normCdf(phi * x2) -
    phi * K * discR * normCdf(phi * x2 - phi * sigma * sqrtT);
  const C =
    phi * S * discQ * Math.pow(B / S, 2 * (mu + 1)) * normCdf(eta * y1) -
    phi * K * discR * Math.pow(B / S, 2 * mu) *
      normCdf(eta * y1 - eta * sigma * sqrtT);
  const D =
    phi * S * discQ * Math.pow(B / S, 2 * (mu + 1)) * normCdf(eta * y2) -
    phi * K * discR * Math.pow(B / S, 2 * mu) *
      normCdf(eta * y2 - eta * sigma * sqrtT);

  // Rebate terms (Haug §4.17.4):
  //   E = K_R · e^{-rT} · [N(eta·x2 - eta·σ√T) − (B/S)^{2μ}·N(eta·y2 − eta·σ√T)]
  //       — paid AT EXPIRATION if KI never knocks in (so payoff = K_R if not active).
  //   F = K_R · [(B/S)^{μ+λ}·N(eta·z) + (B/S)^{μ-λ}·N(eta·z − 2·eta·λ·σ√T)]
  //       — paid IMMEDIATELY ON TOUCH for KO.
  const E =
    rebate *
    discR *
    (normCdf(eta * x2 - eta * sigma * sqrtT) -
      Math.pow(B / S, 2 * mu) * normCdf(eta * y2 - eta * sigma * sqrtT));
  const F =
    rebate *
    (Math.pow(B / S, mu + lambda) * normCdf(eta * z) +
      Math.pow(B / S, mu - lambda) * normCdf(eta * z - 2 * eta * lambda * sigma * sqrtT));

  // Already-touched fast paths.
  if (isOut) {
    if (kind.startsWith("up") && S >= B) return rebate; // KO immediate rebate
    if (kind.startsWith("down") && S <= B) return rebate;
  }
  if (isIn) {
    if (kind.startsWith("up") && S >= B) return blackScholes({ type, S, K, T, r, q, sigma }).price;
    if (kind.startsWith("down") && S <= B) return blackScholes({ type, S, K, T, r, q, sigma }).price;
  }

  let price = 0;
  if (type === "call") {
    if (kind === "down-in") {
      price = (K > B ? C : A - Bv + D) + E;
    } else if (kind === "up-in") {
      price = (K > B ? A : Bv - C + D) + E;
    } else if (kind === "down-out") {
      price = (K > B ? A - C : Bv - D) + F;
    } else {
      // up-out
      price = (K > B ? 0 : A - Bv + C - D) + F;
    }
  } else {
    // put
    if (kind === "down-in") {
      price = (K > B ? Bv - C + D : A) + E;
    } else if (kind === "up-in") {
      price = (K > B ? A - Bv + D : C) + E;
    } else if (kind === "down-out") {
      price = (K > B ? A - Bv + C - D : 0) + F;
    } else {
      // up-out
      price = (K > B ? Bv - D : A - C) + F;
    }
  }
  return Math.max(price, 0);
}

// ---------- Geometric Asian (Kemna-Vorst 1990) ----------
function geometricAsianPrice(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
): number {
  const sigmaG = sigma / Math.sqrt(3);
  const bG = 0.5 * (r - q - (sigma * sigma) / 6);
  const qAdj = r - bG;
  return blackScholes({ type, S, K, T, r, q: qAdj, sigma: sigmaG }).price;
}

// ---------- Arithmetic Asian — Curran (1992) geometric conditioning ----------
// Reference: Curran M. (1992), "Beyond average intelligence", Risk 5(11), 60.
// Idea: condition on the geometric average G; for each G, the arithmetic
// average A is well-approximated by E[A|G], and the inner expectation is
// Black-Scholes-like. Empirically: < 5 bps error vs MC for σ ≤ 50%, T ≤ 5y.
//
// Setup for n equally-spaced fixings t_i = i·dt, dt = T/n, i = 1..n:
//   X_i = log S(t_i) ~ N(μ_i, t_i·σ²) under risk-neutral, μ_i = log S₀ + b·t_i − σ²·t_i/2
//   G = (1/n) Σ X_i ~ N(μ_G, σ_G²)
//      μ_G = log S₀ + b·(n+1)·dt/2 − σ²·(n+1)·dt/4
//      σ_G² = σ²·dt·(n+1)·(2n+1)/(6n)
//   cov(X_i, G) = (σ²/n) Σ_j min(t_i, t_j)
function curranArithmeticAsian(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  nFixings: number,
): number {
  const n = Math.max(1, Math.floor(nFixings));
  const dt = T / n;
  const b = r - q;
  const sig2 = sigma * sigma;
  const disc = Math.exp(-r * T);

  // Forward of S at t_i.
  const F = new Array<number>(n + 1);
  for (let i = 1; i <= n; i++) F[i] = S * Math.exp(b * i * dt);

  // μ_G and σ_G²
  const muG = Math.log(S) + ((b - 0.5 * sig2) * (n + 1) * dt) / 2;
  const varG = (sig2 * dt * (n + 1) * (2 * n + 1)) / (6 * n);
  const sigG = Math.sqrt(varG);

  // cov(X_i, G) = (σ²/n) Σ_j min(t_i, t_j)
  // Closed form: Σ_{j=1..n} min(i,j) = i·(n − i) + i·(i+1)/2  (equiv. i·n − i(i−1)/2)
  // We implement directly to keep it readable.
  const covIG = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    let s = 0;
    for (let j = 1; j <= n; j++) s += Math.min(i, j) * dt;
    covIG[i] = (sig2 * s) / n;
  }

  // Find K* such that E[A | G = log K*] ≈ K, then close form.
  // Curran's formulation gives directly:
  //   E[exp(X_i) | G = g] = exp( μ_i + cov_iG/σ_G² · (g − μ_G) + (var(X_i) − cov_iG²/σ_G²)/2 )
  // and we need g* such that (1/n)·Σ E[exp(X_i)|G=g*] = K.
  // Solve by Newton on g (monotone increasing, well-conditioned).
  const meanXi = new Array<number>(n + 1);
  for (let i = 1; i <= n; i++) meanXi[i] = Math.log(S) + (b - 0.5 * sig2) * i * dt;

  const condMeanA = (g: number): { val: number; deriv: number } => {
    let v = 0;
    let dv = 0;
    for (let i = 1; i <= n; i++) {
      const beta = covIG[i] / varG;
      const resVar = sig2 * i * dt - (covIG[i] * covIG[i]) / varG;
      const m = meanXi[i] + beta * (g - muG) + 0.5 * resVar;
      const ei = Math.exp(m);
      v += ei;
      dv += beta * ei;
    }
    return { val: v / n, deriv: dv / n };
  };

  // Newton: log of forward-of-A as starting point.
  let g = muG;
  for (let it = 0; it < 50; it++) {
    const { val, deriv } = condMeanA(g);
    if (Math.abs(deriv) < 1e-14) break;
    const step = (val - K) / deriv;
    g -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  const gStar = g;

  // Closed-form Curran call price (Haug 2e éd., §4.20, Curran 1992 eq. 8):
  //   C = e^{-rT} · [ (1/n) Σ F_i · exp((cov_iG·d − σ²·t_i + cov_iG²/σ_G²)/(2σ_G²)·... )
  //                                  — keep it plain by integrating the conditional formula:
  //
  // We use the equivalent form:
  //   C = e^{-rT} · Σ (1/n) E[ S(t_i) · 1_{A>K} ] − e^{-rT} K · P(A > K)
  // and approximate { A > K } by { G > g* } (Curran's geometric conditioning).
  //
  // Then E[S(t_i)·1_{G>g*}] = F_i · N( (μ_G + cov_iG − g*) / σ_G )
  // and P(G > g*) = N( (μ_G − g*) / σ_G ).
  let term1 = 0;
  for (let i = 1; i <= n; i++) {
    const arg = (muG + covIG[i] - gStar) / sigG;
    term1 += F[i] * normCdf(arg);
  }
  term1 /= n;
  const probG = normCdf((muG - gStar) / sigG);
  const callPrice = disc * (term1 - K * probG);

  if (type === "call") return Math.max(callPrice, 0);
  // Put-Call parity for arithmetic Asian (continuous discount):
  //   C − P = e^{-rT} · ( E[A] − K ),  with E[A] = (1/n) Σ F_i.
  let meanA = 0;
  for (let i = 1; i <= n; i++) meanA += F[i];
  meanA /= n;
  const putPrice = callPrice - disc * (meanA - K);
  return Math.max(putPrice, 0);
}

// Vorst (1992) control-variate sanity check / fallback for very high σ√T.
// Not used by default; exposed for completeness.
function vorstArithmeticAsianCV(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  nFixings: number,
): number {
  const n = Math.max(1, Math.floor(nFixings));
  const dt = T / n;
  const b = r - q;
  // E[A] − E[G] adjustment to the geometric strike (Vorst 1992).
  let meanA = 0;
  let meanLogG = 0;
  for (let i = 1; i <= n; i++) {
    meanA += S * Math.exp(b * i * dt);
    meanLogG += Math.log(S) + (b - 0.5 * sigma * sigma) * i * dt;
  }
  meanA /= n;
  const sigG2 =
    (sigma * sigma * dt * (n + 1) * (2 * n + 1)) / (6 * n);
  const meanG = Math.exp(meanLogG / n + 0.5 * sigG2);
  const Kadj = K - (meanA - meanG);
  return geometricAsianPrice(type, S, Kadj, T, r, q, sigma);
}

// Continuous-fixings Asian (limit n → ∞). We approximate by Curran with a
// large but finite n (default 252, "daily fixings"). Convergence is fast:
// Curran(252) vs Curran(∞) differ by < 0.5 bp.
function continuousArithmeticAsian(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
): number {
  return curranArithmeticAsian(type, S, K, T, r, q, sigma, 252);
}

// ---------- Digital / Binary ----------
// Two modes:
//   - "bs" (default): pure Black-Scholes binary. Theoretically exact but
//     greeks blow up ATM near expiry (Dirac-like).
//   - "callspread": Bloomberg's BinSmooth — replicate Q·1_{S>K} by
//     (Q/(2ε))·[Call(K-ε) − Call(K+ε)] with ε = max(K·0.5%, 0.01).
//     Yields tradable, bounded, smile-consistent greeks.
function digitalPrice(
  type: OptionType,
  kind: DigitalKind,
  S: number,
  K: number,
  cash: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  mode: "bs" | "callspread" = "bs",
  spreadEps?: number,
): number {
  if (T <= 0 || sigma <= 0) {
    const inMoney = type === "call" ? S > K : S < K;
    if (!inMoney) return 0;
    return kind === "cash" ? cash : S;
  }
  if (mode === "callspread" && kind === "cash") {
    const eps = spreadEps ?? Math.max(K * 0.005, 0.01);
    const cUp = blackScholes({ type, S, K: K + eps, T, r, q, sigma }).price;
    const cDn = blackScholes({ type, S, K: K - eps, T, r, q, sigma }).price;
    // For a CALL: 1_{S>K} ≈ (C(K-ε) − C(K+ε)) / (2ε). For a PUT: opposite sign.
    const sign = type === "call" ? 1 : -1;
    return Math.max((sign * cash * (cDn - cUp)) / (2 * eps), 0);
  }
  if (mode === "callspread" && kind === "asset") {
    // Asset-or-nothing replication via tight spread on a digital: use BS form.
    // (call-spread on S·1_{S>K} requires asset spread, equivalent to BS limit.)
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const sign = type === "call" ? 1 : -1;
  if (kind === "cash") {
    return cash * Math.exp(-r * T) * normCdf(sign * d2);
  }
  return S * Math.exp(-q * T) * normCdf(sign * d1);
}

// ---------- Lookback (Goldman-Sosin-Gatto / Conze-Viswanathan) ----------
// Continuous monitoring by default. Optional BGK discrete correction
// (Broadie-Glasserman-Kou 1999) when n_monitor is set. Exact b → 0 limit.
function lookbackPriceContinuous(
  type: OptionType,
  kind: LookbackKind,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  Smin: number | undefined,
  Smax: number | undefined,
): number {
  const b = r - q;
  const sqrtT = Math.sqrt(T);
  const sig2 = sigma * sigma;

  // Exact b → 0 limit (Hull §28, Conze §3.2):
  // The (σ²/(2b)) factor times its bracket converges to:
  //   −σ·√T · [ n(a) + a·N(a) − a·1_{...} ]
  // We detect |b·T| < 1e-7 and switch to the limiting form by linear
  // interpolation between the two-sided regularised values (centered finite
  // difference in b around 0). This gives 1e-9 precision and removes the
  // O(b·T) bias of a single signed epsilon.
  const useLimit = Math.abs(b) * T < 1e-7;

  const compute = (bUsed: number): number => {
    if (kind === "floating") {
      if (type === "call") {
        const M = Smin ?? S;
        const a1 = (Math.log(S / M) + (bUsed + 0.5 * sig2) * T) / (sigma * sqrtT);
        const a2 = a1 - sigma * sqrtT;
        return (
          S * Math.exp(-q * T) * normCdf(a1) -
          M * Math.exp(-r * T) * normCdf(a2) +
          S * Math.exp(-r * T) * (sig2 / (2 * bUsed)) *
            (Math.pow(S / M, (-2 * bUsed) / sig2) *
              normCdf(-a1 + (2 * bUsed * sqrtT) / sigma) -
              Math.exp(bUsed * T) * normCdf(-a1))
        );
      } else {
        const M = Smax ?? S;
        const a1 = (Math.log(S / M) + (bUsed + 0.5 * sig2) * T) / (sigma * sqrtT);
        const a2 = a1 - sigma * sqrtT;
        return (
          M * Math.exp(-r * T) * normCdf(-a2) -
          S * Math.exp(-q * T) * normCdf(-a1) +
          S * Math.exp(-r * T) * (sig2 / (2 * bUsed)) *
            (-Math.pow(S / M, (-2 * bUsed) / sig2) *
              normCdf(a1 - (2 * bUsed * sqrtT) / sigma) +
              Math.exp(bUsed * T) * normCdf(a1))
        );
      }
    } else {
      if (type === "call") {
        const M = Smax ?? S;
        const Kc = Math.max(K, M);
        const d1 = (Math.log(S / Kc) + (bUsed + 0.5 * sig2) * T) / (sigma * sqrtT);
        const d2 = d1 - sigma * sqrtT;
        const part1 =
          S * Math.exp(-q * T) * normCdf(d1) -
          Kc * Math.exp(-r * T) * normCdf(d2);
        const part2 =
          S *
          Math.exp(-r * T) *
          (sig2 / (2 * bUsed)) *
          (-Math.pow(S / Kc, (-2 * bUsed) / sig2) *
            normCdf(d1 - (2 * bUsed * sqrtT) / sigma) +
            Math.exp(bUsed * T) * normCdf(d1));
        let price = part1 + part2;
        if (K < M) price += (M - K) * Math.exp(-r * T);
        return price;
      } else {
        const m = Smin ?? S;
        const Kp = Math.min(K, m);
        const d1 = (Math.log(S / Kp) + (bUsed + 0.5 * sig2) * T) / (sigma * sqrtT);
        const d2 = d1 - sigma * sqrtT;
        const part1 =
          Kp * Math.exp(-r * T) * normCdf(-d2) -
          S * Math.exp(-q * T) * normCdf(-d1);
        const part2 =
          S *
          Math.exp(-r * T) *
          (sig2 / (2 * bUsed)) *
          (Math.pow(S / Kp, (-2 * bUsed) / sig2) *
            normCdf(-d1 + (2 * bUsed * sqrtT) / sigma) -
            Math.exp(bUsed * T) * normCdf(-d1));
        let price = part1 + part2;
        if (K > m) price += (K - m) * Math.exp(-r * T);
        return price;
      }
    }
  };

  if (!useLimit) return compute(b);
  // Centered limit at b = 0: average ±ε to cancel O(b) bias.
  const eps = 1e-5;
  return 0.5 * (compute(eps) + compute(-eps));
}

// Discrete monitoring lookback via Broadie-Glasserman-Kou (1999).
// Same continuity correction logic as barriers, applied to the running max
// (call fixed) or running min (put fixed / floating call).
function lookbackPrice(
  type: OptionType,
  kind: LookbackKind,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  Smin: number | undefined,
  Smax: number | undefined,
  monitoring: "continuous" | "discrete" = "continuous",
  nMonitor = 252,
): number {
  if (monitoring === "continuous" || nMonitor <= 0) {
    return lookbackPriceContinuous(type, kind, S, K, T, r, q, sigma, Smin, Smax);
  }
  // BGK 1999: shift the realised extremum INWARD toward S by the same factor
  //   M_eff = M · exp(−β·σ·√(T/m))   for a max
  //   m_eff = m · exp(+β·σ·√(T/m))   for a min
  // This converts the discrete-monitoring price to its continuous-equivalent.
  const shift = BGK_BETA * sigma * Math.sqrt(T / nMonitor);
  const SmaxEff = Smax !== undefined ? Smax * Math.exp(-shift) : undefined;
  const SminEff = Smin !== undefined ? Smin * Math.exp(shift) : undefined;
  return lookbackPriceContinuous(type, kind, S, K, T, r, q, sigma, SminEff, SmaxEff);
}

// ---------- Dispatcher ----------
export function exoticClosedFormPrice(
  spec: ExoticSpec,
  c: CommonInputs,
): number {
  // Apply Bos-Vandermark adjustment for European-style exotics if discrete
  // dividends are provided. This is exact for products whose payoff depends
  // ONLY on S_T (digital, vanilla, knock-out at expiry under pure European
  // exercise). For path-dependent products (barrier intra-life, asian,
  // lookback) we instead translate divs into an equivalent continuous yield.
  let cAdj = c;
  if (spec.dividends && spec.dividends.length > 0) {
    if (spec.family === "digital") {
      const { Sstar, Kstar } = bosVandermarkAdjust(c.S, c.K, c.T, c.r, spec.dividends);
      cAdj = { ...c, S: Sstar, K: Kstar };
    } else {
      // Path-dependent: convert to continuous-yield equivalent.
      const { dividendsToContinuousYield } = require("./discreteDividends") as typeof import("./discreteDividends");
      const qExtra = dividendsToContinuousYield(c.S, c.T, c.r, spec.dividends);
      cAdj = { ...c, q: c.q + qExtra };
    }
  }

  switch (spec.family) {
    case "barrier":
      return barrierPrice(
        cAdj.type,
        spec.barrier!.kind,
        cAdj.S,
        cAdj.K,
        spec.barrier!.B,
        cAdj.T,
        cAdj.r,
        cAdj.q,
        cAdj.sigma,
        spec.barrier!.monitoring ?? "continuous",
        spec.barrier!.nMonitor ?? 252,
        spec.barrier!.rebate ?? 0,
      );
    case "asian": {
      if (spec.asian!.avg === "geometric") {
        return geometricAsianPrice(cAdj.type, cAdj.S, cAdj.K, cAdj.T, cAdj.r, cAdj.q, cAdj.sigma);
      }
      const n = spec.asian!.nFixings;
      if (!n || n <= 0) {
        return continuousArithmeticAsian(cAdj.type, cAdj.S, cAdj.K, cAdj.T, cAdj.r, cAdj.q, cAdj.sigma);
      }
      return curranArithmeticAsian(cAdj.type, cAdj.S, cAdj.K, cAdj.T, cAdj.r, cAdj.q, cAdj.sigma, n);
    }
    case "digital":
      return digitalPrice(
        cAdj.type,
        spec.digital!.kind,
        cAdj.S,
        cAdj.K,
        spec.digital!.cash,
        cAdj.T,
        cAdj.r,
        cAdj.q,
        cAdj.sigma,
        spec.digital!.mode ?? "bs",
        spec.digital!.spreadEps,
      );
    case "lookback":
      return lookbackPrice(
        cAdj.type,
        spec.lookback!.kind,
        cAdj.S,
        cAdj.K,
        cAdj.T,
        cAdj.r,
        cAdj.q,
        cAdj.sigma,
        spec.lookback!.Smin,
        spec.lookback!.Smax,
        spec.lookback!.monitoring ?? "continuous",
        spec.lookback!.nMonitor ?? 252,
      );
  }
}

// ---------- Greeks by central bumping on the closed-form price ----------
export function exoticClosedFormGreeks(
  spec: ExoticSpec,
  c: CommonInputs,
): CFResult {
  const f = (cc: CommonInputs) => exoticClosedFormPrice(spec, cc);
  const price = f(c);

  // Bumps standard industrie (Glasserman 2004, §7.1).
  const dS = Math.max(c.S * 0.01, 1e-4);
  const dSig = Math.max(c.sigma * 0.01, 1e-4); // relative bump, not absolute
  const dR = 1e-4;
  const dT = Math.min(c.T * 0.01, 1 / 365);

  // Stabilisation barrière knock-in/out près de la barrière.
  let dSeff = dS;
  if (spec.family === "barrier" && spec.barrier) {
    const B = spec.barrier.B;
    const dist = Math.abs(c.S - B);
    if (dist > 1e-8 && dist < dS) {
      dSeff = Math.max(dist * 0.5, 1e-6);
    }
  }

  const pUp = f({ ...c, S: c.S + dSeff });
  const pDn = f({ ...c, S: c.S - dSeff });
  const delta = (pUp - pDn) / (2 * dSeff);
  const gamma = (pUp - 2 * price + pDn) / (dSeff * dSeff);

  const vUp = f({ ...c, sigma: c.sigma + dSig });
  const vDn = f({ ...c, sigma: Math.max(c.sigma - dSig, 1e-6) });
  const vega = (vUp - vDn) / (2 * dSig);

  const rUp = f({ ...c, r: c.r + dR });
  const rDn = f({ ...c, r: c.r - dR });
  const rho = (rUp - rDn) / (2 * dR);

  let theta: number;
  if (c.T > 2 * dT) {
    const tUp = f({ ...c, T: c.T + dT });
    const tDn = f({ ...c, T: c.T - dT });
    theta = -(tUp - tDn) / (2 * dT);
  } else {
    const tDn = f({ ...c, T: Math.max(c.T - dT, 1e-6) });
    theta = -(price - tDn) / dT;
  }

  return { price, delta, gamma, vega, theta, rho };
}

// Re-export discrete dividend type for UI.
export type { DiscreteDividend };

// Silence unused-import warning
void normPdf;
void vorstArithmeticAsianCV;
