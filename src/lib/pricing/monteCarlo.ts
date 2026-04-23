// Monte Carlo engine for exotic options under GBM dynamics.

import { boxMullerPair, mean, mulberry32, stddev } from "./stats";
import type { OptionType } from "./blackScholes";

export type ExoticType =
  | "barrier"
  | "asian"
  | "digital"
  | "lookback";

export type BarrierKind = "up-in" | "up-out" | "down-in" | "down-out";
export type AsianAvg = "arithmetic" | "geometric";
export type DigitalKind = "cash" | "asset"; // cash-or-nothing / asset-or-nothing
export type LookbackKind = "fixed" | "floating";

export interface CommonInputs {
  S: number;
  K: number;
  T: number;
  r: number;
  q: number;
  sigma: number;
  type: OptionType; // call/put
}

export interface MCParams {
  nSims: number;
  nSteps: number;
  seed?: number;
  antithetic: boolean;
}

export interface ExoticSpec {
  family: ExoticType;
  // family-specific
  barrier?: { kind: BarrierKind; B: number; monitoring?: "continuous" | "discrete"; nMonitor?: number };
  asian?: { avg: AsianAvg; nFixings?: number };
  digital?: { kind: DigitalKind; cash: number }; // cash payout for cash-or-nothing
  lookback?: { kind: LookbackKind; Smin?: number; Smax?: number };
}

export interface MCResult {
  price: number;
  stderr: number;
  ci95: [number, number];
  paths: number[][]; // sample of trajectories for display (small)
}

// Tire nSteps normales N(0,1) iid en utilisant Box-Muller en pairs
// (cos ET sin de la même paire d'uniformes — pas de gaspillage).
function drawNormals(rng: () => number, nSteps: number): Float64Array {
  const z = new Float64Array(nSteps);
  for (let i = 0; i < nSteps; i += 2) {
    const [a, b] = boxMullerPair(rng(), rng());
    z[i] = a;
    if (i + 1 < nSteps) z[i + 1] = b;
  }
  return z;
}

// Construit le chemin à partir d'un vecteur de normales fixé. Permet le
// VRAI antithetic en réutilisant les mêmes z avec signe opposé.
function pathFromNormals(
  S0: number,
  r: number,
  q: number,
  sigma: number,
  T: number,
  z: Float64Array,
  flipSign: boolean,
): number[] {
  const nSteps = z.length;
  const dt = T / nSteps;
  const drift = (r - q - 0.5 * sigma * sigma) * dt;
  const vol = sigma * Math.sqrt(dt);
  const path = new Array<number>(nSteps + 1);
  path[0] = S0;
  let S = S0;
  for (let i = 0; i < nSteps; i++) {
    const zi = flipSign ? -z[i] : z[i];
    S = S * Math.exp(drift + vol * zi);
    path[i + 1] = S;
  }
  return path;
}

function payoff(spec: ExoticSpec, common: CommonInputs, path: number[]): number {
  const { K, type } = common;
  const ST = path[path.length - 1];

  switch (spec.family) {
    case "barrier": {
      const b = spec.barrier!;
      let breached = false;
      if (b.kind.startsWith("up")) {
        for (const s of path) if (s >= b.B) { breached = true; break; }
      } else {
        for (const s of path) if (s <= b.B) { breached = true; break; }
      }
      const isOut = b.kind.endsWith("out");
      const active = isOut ? !breached : breached;
      if (!active) return 0;
      return type === "call" ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
    }
    case "asian": {
      const a = spec.asian!;
      let avg: number;
      if (a.avg === "arithmetic") {
        let s = 0;
        for (let i = 1; i < path.length; i++) s += path[i];
        avg = s / (path.length - 1);
      } else {
        let s = 0;
        for (let i = 1; i < path.length; i++) s += Math.log(path[i]);
        avg = Math.exp(s / (path.length - 1));
      }
      return type === "call" ? Math.max(avg - K, 0) : Math.max(K - avg, 0);
    }
    case "digital": {
      const d = spec.digital!;
      const inMoney = type === "call" ? ST > K : ST < K;
      if (!inMoney) return 0;
      return d.kind === "cash" ? d.cash : ST;
    }
    case "lookback": {
      const lk = spec.lookback!;
      let mn = path[0], mx = path[0];
      for (const s of path) { if (s < mn) mn = s; if (s > mx) mx = s; }
      if (lk.kind === "fixed") {
        return type === "call" ? Math.max(mx - K, 0) : Math.max(K - mn, 0);
      } else {
        // floating strike
        return type === "call" ? Math.max(ST - mn, 0) : Math.max(mx - ST, 0);
      }
    }
  }
}

export function priceExoticMC(
  spec: ExoticSpec,
  common: CommonInputs,
  mc: MCParams,
  keepPaths = 15,
): MCResult {
  const seed = mc.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(seed);
  const disc = Math.exp(-common.r * common.T);

  const payoffs: number[] = [];
  const sample: number[][] = [];

  const N = mc.antithetic ? Math.ceil(mc.nSims / 2) : mc.nSims;

  for (let i = 0; i < N; i++) {
    // Tire un vecteur de normales iid. En antithetic on REUTILISE ce
    // même vecteur avec signe opposé sur le second chemin — ce qui est
    // la vraie technique d'antithétique (Glasserman 2004, §4.2) et
    // garantit corr(p1,p2) ≤ 0 sur les payoffs monotones.
    const z = drawNormals(rng, mc.nSteps);
    const p1 = pathFromNormals(common.S, common.r, common.q, common.sigma, common.T, z, false);
    payoffs.push(payoff(spec, common, p1));
    if (sample.length < keepPaths) sample.push(p1);

    if (mc.antithetic) {
      const p2 = pathFromNormals(common.S, common.r, common.q, common.sigma, common.T, z, true);
      payoffs.push(payoff(spec, common, p2));
      if (sample.length < keepPaths) sample.push(p2);
    }
  }

  // Estimateur correct de l'IC :
  //  - sans antithetic : moyenne et écart-type sur N payoffs iid.
  //  - avec antithetic : moyenne sur N PAIRES Y_i = (V(z_i)+V(-z_i))/2,
  //    et écart-type sur ces Y_i (qui SONT iid). Le stderr naïf sur tous
  //    les payoffs est biaisé car les paires sont corrélées négativement.
  let mu: number;
  let sd: number;
  let nEff: number;
  if (mc.antithetic) {
    const pairs: number[] = [];
    for (let k = 0; k < payoffs.length; k += 2) {
      pairs.push(0.5 * (payoffs[k] + payoffs[k + 1]));
    }
    mu = mean(pairs);
    sd = stddev(pairs, mu);
    nEff = pairs.length;
  } else {
    mu = mean(payoffs);
    sd = stddev(payoffs, mu);
    nEff = payoffs.length;
  }
  const price = disc * mu;
  const stderr = (disc * sd) / Math.sqrt(nEff);
  return {
    price,
    stderr,
    ci95: [price - 1.96 * stderr, price + 1.96 * stderr],
    paths: sample,
  };
}

// Greeks by central bumping. Reuses the same seed for variance reduction.
export interface MCGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

export function exoticGreeks(
  spec: ExoticSpec,
  common: CommonInputs,
  mc: MCParams,
): { price: number; stderr: number; ci95: [number, number]; greeks: MCGreeks } {
  const baseSeed = mc.seed ?? 42;
  const run = (c: CommonInputs) =>
    priceExoticMC(spec, c, { ...mc, seed: baseSeed }, 0).price;

  const base = priceExoticMC(spec, common, { ...mc, seed: baseSeed });

  const dS = common.S * 0.01;
  const dSig = 0.01;
  const dR = 0.0001;
  const dT = Math.min(common.T * 0.01, 1 / 365);

  const pUp = run({ ...common, S: common.S + dS });
  const pDn = run({ ...common, S: common.S - dS });
  const delta = (pUp - pDn) / (2 * dS);
  const gamma = (pUp - 2 * base.price + pDn) / (dS * dS);

  const vUp = run({ ...common, sigma: common.sigma + dSig });
  const vDn = run({ ...common, sigma: Math.max(common.sigma - dSig, 1e-6) });
  const vega = (vUp - vDn) / (2 * dSig);

  const rUp = run({ ...common, r: common.r + dR });
  const rDn = run({ ...common, r: common.r - dR });
  const rho = (rUp - rDn) / (2 * dR);

  const tDn = run({ ...common, T: Math.max(common.T - dT, 1e-6) });
  const theta = (tDn - base.price) / dT * -1; // d/dt; theta usually reported as -dV/dT

  return {
    price: base.price,
    stderr: base.stderr,
    ci95: base.ci95,
    greeks: { delta, gamma, vega, theta, rho },
  };
}
