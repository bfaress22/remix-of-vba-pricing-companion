// Closed-form pricers for exotic options under Black-Scholes-Merton dynamics.
// Covers: barrier (continuous monitoring), geometric Asian, digital
// (cash-or-nothing & asset-or-nothing) and continuous lookback options.

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

export interface CFResult {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

// ---------- Barrier (Reiner-Rubinstein, continuous monitoring) ----------
function barrierPrice(
  type: OptionType,
  kind: BarrierKind,
  S: number,
  K: number,
  B: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
): number {
  // Phi/eta sign conventions per Haug "Complete Guide to Option Pricing Formulas"
  const phi = type === "call" ? 1 : -1;
  const eta = kind.startsWith("down") ? 1 : -1;
  const isOut = kind.endsWith("out");
  const isIn = !isOut;

  const sqrtT = Math.sqrt(T);
  const mu = (r - q - 0.5 * sigma * sigma) / (sigma * sigma);
  const lambda = Math.sqrt(mu * mu + (2 * r) / (sigma * sigma));

  const x1 = Math.log(S / K) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const x2 = Math.log(S / B) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const y1 =
    Math.log((B * B) / (S * K)) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;
  const y2 = Math.log(B / S) / (sigma * sqrtT) + (1 + mu) * sigma * sqrtT;

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

  // Knock-out check: if barrier already breached at t=0, price = 0
  if (isOut) {
    if (kind.startsWith("up") && S >= B) return 0;
    if (kind.startsWith("down") && S <= B) return 0;
  }

  let price = 0;
  if (type === "call") {
    if (kind === "down-in") {
      if (K > B) price = C;
      else price = A - Bv + D;
    } else if (kind === "up-in") {
      if (K > B) price = A;
      else price = Bv - C + D;
    } else if (kind === "down-out") {
      if (K > B) price = A - C;
      else price = Bv - D;
    } else {
      // up-out
      if (K > B) price = 0;
      else price = A - Bv + C - D;
    }
  } else {
    // put
    if (kind === "down-in") {
      if (K > B) price = Bv - C + D;
      else price = A;
    } else if (kind === "up-in") {
      if (K > B) price = A - Bv + D;
      else price = C;
    } else if (kind === "down-out") {
      if (K > B) price = A - Bv + C - D;
      else price = 0;
    } else {
      // up-out
      if (K > B) price = Bv - D;
      else price = A - C;
    }
  }
  return Math.max(price, 0);
}

// ---------- Geometric Asian (Kemna-Vorst) ----------
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
  // Adjusted dividend yield so that BS sees drift bG: q* such that r - q* = bG
  const qAdj = r - bG;
  return blackScholes({ type, S, K, T, r, q: qAdj, sigma: sigmaG }).price;
}

// ---------- Digital / Binary ----------
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
): number {
  if (T <= 0 || sigma <= 0) {
    const inMoney = type === "call" ? S > K : S < K;
    if (!inMoney) return 0;
    return kind === "cash" ? cash : S;
  }
  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const sign = type === "call" ? 1 : -1;
  if (kind === "cash") {
    return cash * Math.exp(-r * T) * normCdf(sign * d2);
  }
  return S * Math.exp(-q * T) * normCdf(sign * d1);
}

// ---------- Lookback (continuous monitoring, Goldman-Sosin-Gatto) ----------
function lookbackPrice(
  type: OptionType,
  kind: LookbackKind,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
): number {
  const b = r - q;
  const sqrtT = Math.sqrt(T);
  const sig2 = sigma * sigma;

  if (kind === "floating") {
    // Floating strike: K replaced by min (call) or max (put). Assume Smin=Smax=S at t=0.
    const M = S; // running extremum at inception
    if (type === "call") {
      const a1 =
        (Math.log(S / M) + (b + 0.5 * sig2) * T) / (sigma * sqrtT);
      const a2 = a1 - sigma * sqrtT;
      const term =
        S * Math.exp(-q * T) * normCdf(a1) -
        M * Math.exp(-r * T) * normCdf(a2) +
        S *
          Math.exp(-r * T) *
          (sig2 / (2 * b)) *
          (Math.pow(S / M, -2 * b / sig2) *
            normCdf(-a1 + (2 * b * sqrtT) / sigma) -
            Math.exp(b * T) * normCdf(-a1));
      return term;
    } else {
      const a1 =
        (Math.log(S / M) + (b + 0.5 * sig2) * T) / (sigma * sqrtT);
      const a2 = a1 - sigma * sqrtT;
      const term =
        M * Math.exp(-r * T) * normCdf(-a2) -
        S * Math.exp(-q * T) * normCdf(-a1) +
        S *
          Math.exp(-r * T) *
          (sig2 / (2 * b)) *
          (-Math.pow(S / M, -2 * b / sig2) *
            normCdf(a1 - (2 * b * sqrtT) / sigma) +
            Math.exp(b * T) * normCdf(a1));
      return term;
    }
  } else {
    // Fixed strike lookback. Assume running extremum = S at inception.
    if (type === "call") {
      const M = S;
      const Kc = Math.max(K, M);
      const d1 =
        (Math.log(S / Kc) + (b + 0.5 * sig2) * T) / (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;
      const part1 =
        S * Math.exp(-q * T) * normCdf(d1) -
        Kc * Math.exp(-r * T) * normCdf(d2);
      const part2 =
        S *
        Math.exp(-r * T) *
        (sig2 / (2 * b)) *
        (-Math.pow(S / Kc, -2 * b / sig2) *
          normCdf(d1 - (2 * b * sqrtT) / sigma) +
          Math.exp(b * T) * normCdf(d1));
      let price = part1 + part2;
      if (K < M) price += (M - K) * Math.exp(-r * T);
      return price;
    } else {
      const m = S;
      const Kp = Math.min(K, m);
      const d1 =
        (Math.log(S / Kp) + (b + 0.5 * sig2) * T) / (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;
      const part1 =
        Kp * Math.exp(-r * T) * normCdf(-d2) -
        S * Math.exp(-q * T) * normCdf(-d1);
      const part2 =
        S *
        Math.exp(-r * T) *
        (sig2 / (2 * b)) *
        (Math.pow(S / Kp, -2 * b / sig2) *
          normCdf(-d1 + (2 * b * sqrtT) / sigma) -
          Math.exp(b * T) * normCdf(-d1));
      let price = part1 + part2;
      if (K > m) price += (K - m) * Math.exp(-r * T);
      return price;
    }
  }
}

// ---------- Dispatcher ----------
export function exoticClosedFormPrice(
  spec: ExoticSpec,
  c: CommonInputs,
): number {
  switch (spec.family) {
    case "barrier":
      return barrierPrice(
        c.type,
        spec.barrier!.kind,
        c.S,
        c.K,
        spec.barrier!.B,
        c.T,
        c.r,
        c.q,
        c.sigma,
      );
    case "asian": {
      // Only geometric has a closed form. Arithmetic uses Turnbull-Wakeman
      // moment matching (approximation).
      if (spec.asian!.avg === "geometric") {
        return geometricAsianPrice(c.type, c.S, c.K, c.T, c.r, c.q, c.sigma);
      }
      return turnbullWakemanArithmetic(c.type, c.S, c.K, c.T, c.r, c.q, c.sigma);
    }
    case "digital":
      return digitalPrice(
        c.type,
        spec.digital!.kind,
        c.S,
        c.K,
        spec.digital!.cash,
        c.T,
        c.r,
        c.q,
        c.sigma,
      );
    case "lookback":
      return lookbackPrice(
        c.type,
        spec.lookback!.kind,
        c.S,
        c.K,
        c.T,
        c.r,
        c.q,
        c.sigma,
      );
  }
}

// Turnbull-Wakeman moment-matching approximation for arithmetic Asian
function turnbullWakemanArithmetic(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
): number {
  const b = r - q;
  if (Math.abs(b) < 1e-8) {
    // Limit case: use geometric approximation
    return geometricAsianPrice(type, S, K, T, r, q, sigma);
  }
  const M1 = (Math.exp(b * T) - 1) / (b * T);
  const M2 =
    (2 * Math.exp((2 * b + sigma * sigma) * T)) /
      ((b + sigma * sigma) * (2 * b + sigma * sigma) * T * T) +
    (2 / (b * T * T)) *
      (1 / (2 * b + sigma * sigma) -
        Math.exp(b * T) / (b + sigma * sigma));
  const sigmaA = Math.sqrt(Math.log(M2) / T - 2 * b);
  const FA = S * M1; // forward of average
  // Use Black-76 style: price = e^{-rT} [FA N(d1) - K N(d2)]
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(FA / K) + 0.5 * sigmaA * sigmaA * T) / (sigmaA * sqrtT);
  const d2 = d1 - sigmaA * sqrtT;
  const disc = Math.exp(-r * T);
  if (type === "call") {
    return disc * (FA * normCdf(d1) - K * normCdf(d2));
  }
  return disc * (K * normCdf(-d2) - FA * normCdf(-d1));
}

// ---------- Greeks by central bumping on the closed-form price ----------
export function exoticClosedFormGreeks(
  spec: ExoticSpec,
  c: CommonInputs,
): CFResult {
  const f = (cc: CommonInputs) => exoticClosedFormPrice(spec, cc);
  const price = f(c);

  const dS = Math.max(c.S * 0.001, 1e-4);
  const dSig = 1e-4;
  const dR = 1e-5;
  const dT = Math.min(c.T * 0.001, 1 / 365);

  const pUp = f({ ...c, S: c.S + dS });
  const pDn = f({ ...c, S: c.S - dS });
  const delta = (pUp - pDn) / (2 * dS);
  const gamma = (pUp - 2 * price + pDn) / (dS * dS);

  const vUp = f({ ...c, sigma: c.sigma + dSig });
  const vDn = f({ ...c, sigma: Math.max(c.sigma - dSig, 1e-6) });
  const vega = (vUp - vDn) / (2 * dSig);

  const rUp = f({ ...c, r: c.r + dR });
  const rDn = f({ ...c, r: c.r - dR });
  const rho = (rUp - rDn) / (2 * dR);

  const tDn = f({ ...c, T: Math.max(c.T - dT, 1e-6) });
  const theta = ((tDn - price) / dT) * -1;

  return { price, delta, gamma, vega, theta, rho };
}

// Silence unused-import warning
void normPdf;
