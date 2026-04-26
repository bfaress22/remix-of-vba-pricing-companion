// Monte Carlo engine for exotic options under GBM dynamics.
//
// Production-grade features (aligned with Glasserman 2003, Numerix conventions):
//   - PRNG mode (Mulberry32) ou QRNG mode (Sobol Joe-Kuo + inverse normal Acklam).
//   - Antithetic variates (real ones: reuse same z with sign flip).
//   - Brownian bridge correction for continuous-barrier monitoring (Glasserman §6.4).
//   - CRN seed sharing across bumped greeks runs.
//   - Standard error correctly accounting for antithetic pair correlation.

import { boxMullerPair, mean, mulberry32, stddev } from "./stats";
import { Sobol, invNormCdf } from "./sobol";
import type { OptionType } from "./blackScholes";
import type { DiscreteDividend } from "./discreteDividends";
import { dividendsToContinuousYield } from "./discreteDividends";

export type ExoticType = "barrier" | "asian" | "digital" | "lookback";
export type BarrierKind = "up-in" | "up-out" | "down-in" | "down-out";
export type AsianAvg = "arithmetic" | "geometric";
export type DigitalKind = "cash" | "asset";
export type LookbackKind = "fixed" | "floating";
export type RngMode = "pseudo" | "sobol";

export interface CommonInputs {
  S: number;
  K: number;
  T: number;
  r: number;
  q: number;
  sigma: number;
  type: OptionType;
}

export interface MCParams {
  nSims: number;
  nSteps: number;
  seed?: number;
  antithetic: boolean;
  rng?: RngMode; // "pseudo" (Mulberry32) | "sobol" (Joe-Kuo, default)
  brownianBridge?: boolean; // for barriers: correct discrete-monitoring bias
}

export interface ExoticSpec {
  family: ExoticType;
  barrier?: {
    kind: BarrierKind;
    B: number;
    monitoring?: "continuous" | "discrete";
    nMonitor?: number;
    rebate?: number;
  };
  asian?: { avg: AsianAvg; nFixings?: number };
  digital?: { kind: DigitalKind; cash: number; mode?: "bs" | "callspread"; spreadEps?: number };
  lookback?: {
    kind: LookbackKind;
    Smin?: number;
    Smax?: number;
    monitoring?: "continuous" | "discrete";
    nMonitor?: number;
  };
  dividends?: DiscreteDividend[]; // optional discrete cash divs (Bos-Vandermark)
}

export interface MCResult {
  price: number;
  stderr: number;
  ci95: [number, number];
  paths: number[][];
}

// --- Normal-variate suppliers ----------------------------------------------

interface NormalSupplier {
  draw(nSteps: number): Float64Array;
}

class PseudoSupplier implements NormalSupplier {
  private rng: () => number;
  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }
  draw(nSteps: number): Float64Array {
    const z = new Float64Array(nSteps);
    for (let i = 0; i < nSteps; i += 2) {
      const [a, b] = boxMullerPair(this.rng(), this.rng());
      z[i] = a;
      if (i + 1 < nSteps) z[i + 1] = b;
    }
    return z;
  }
}

class SobolSupplier implements NormalSupplier {
  private sobol: Sobol;
  private dim: number;
  constructor(dim: number) {
    this.dim = dim;
    this.sobol = new Sobol(dim);
    // Skip the first point (seeded as small offset to avoid 0/1).
    this.sobol.next();
  }
  draw(_nSteps: number): Float64Array {
    const u = this.sobol.next();
    const z = new Float64Array(this.dim);
    for (let i = 0; i < this.dim; i++) z[i] = invNormCdf(u[i]);
    return z;
  }
}

// --- Path construction ------------------------------------------------------

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

// --- Brownian-bridge barrier correction (Glasserman §6.4) -------------------
// On each step (S_i, S_{i+1}), the conditional probability that the GBM
// touches the barrier B between t_i and t_{i+1} is:
//   p = exp(−2·log(S_i/B)·log(S_{i+1}/B) / (σ²·dt))     for an UP barrier
// (and symmetrically for DOWN). We accept the path as "touched" with prob p
// even if neither endpoint crosses B. This eliminates the discretization bias
// for continuous-monitoring barrier MC.
function bridgeTouchesBarrier(
  path: number[],
  B: number,
  isUp: boolean,
  sigma: number,
  dt: number,
  rng: () => number,
): boolean {
  const sig2dt = sigma * sigma * dt;
  for (let i = 0; i < path.length - 1; i++) {
    const Si = path[i];
    const Sj = path[i + 1];
    if (isUp) {
      if (Si >= B || Sj >= B) return true;
      const num = -2 * Math.log(B / Si) * Math.log(B / Sj);
      const p = Math.exp(num / sig2dt);
      if (rng() < p) return true;
    } else {
      if (Si <= B || Sj <= B) return true;
      const num = -2 * Math.log(Si / B) * Math.log(Sj / B);
      const p = Math.exp(num / sig2dt);
      if (rng() < p) return true;
    }
  }
  return false;
}

// --- Payoff -----------------------------------------------------------------

function payoff(
  spec: ExoticSpec,
  common: CommonInputs,
  path: number[],
  bridgeRng?: () => number,
  useBridge?: boolean,
): number {
  const { K, type } = common;
  const ST = path[path.length - 1];

  switch (spec.family) {
    case "barrier": {
      const b = spec.barrier!;
      const isUp = b.kind.startsWith("up");
      const isOut = b.kind.endsWith("out");
      let breached: boolean;
      if (useBridge && bridgeRng && (b.monitoring ?? "continuous") === "continuous") {
        const dt = common.T / (path.length - 1);
        breached = bridgeTouchesBarrier(path, b.B, isUp, common.sigma, dt, bridgeRng);
      } else {
        breached = false;
        if (isUp) {
          for (const s of path) if (s >= b.B) { breached = true; break; }
        } else {
          for (const s of path) if (s <= b.B) { breached = true; break; }
        }
      }
      const active = isOut ? !breached : breached;
      const rebate = b.rebate ?? 0;
      if (!active) {
        // KO touched → immediate rebate (we already discount at end).
        // KI not touched → rebate paid at expiry.
        return isOut ? rebate : rebate;
      }
      return type === "call" ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
    }
    case "asian": {
      const a = spec.asian!;
      let avg: number;
      if (a.nFixings && a.nFixings > 0) {
        // Discrete fixings: pick equally spaced indices on the path grid.
        const nF = Math.floor(a.nFixings);
        const step = (path.length - 1) / nF;
        if (a.avg === "arithmetic") {
          let s = 0;
          for (let k = 1; k <= nF; k++) s += path[Math.round(k * step)];
          avg = s / nF;
        } else {
          let s = 0;
          for (let k = 1; k <= nF; k++) s += Math.log(path[Math.round(k * step)]);
          avg = Math.exp(s / nF);
        }
      } else {
        if (a.avg === "arithmetic") {
          let s = 0;
          for (let i = 1; i < path.length; i++) s += path[i];
          avg = s / (path.length - 1);
        } else {
          let s = 0;
          for (let i = 1; i < path.length; i++) s += Math.log(path[i]);
          avg = Math.exp(s / (path.length - 1));
        }
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
        return type === "call" ? Math.max(ST - mn, 0) : Math.max(mx - ST, 0);
      }
    }
  }
}

// --- Apply discrete dividends to common inputs (continuous-yield equivalent)
function applyDividends(common: CommonInputs, divs?: DiscreteDividend[]): CommonInputs {
  if (!divs || divs.length === 0) return common;
  const qExtra = dividendsToContinuousYield(common.S, common.T, common.r, divs);
  return { ...common, q: common.q + qExtra };
}

// --- Engine -----------------------------------------------------------------

export function priceExoticMC(
  spec: ExoticSpec,
  commonRaw: CommonInputs,
  mc: MCParams,
  keepPaths = 15,
): MCResult {
  const common = applyDividends(commonRaw, spec.dividends);
  const seed = mc.seed ?? Math.floor(Math.random() * 2 ** 31);
  const disc = Math.exp(-common.r * common.T);
  const useBridge = !!mc.brownianBridge && spec.family === "barrier";
  const bridgeRng = useBridge ? mulberry32(seed ^ 0x9e3779b9) : undefined;

  const supplier: NormalSupplier =
    (mc.rng ?? "sobol") === "sobol"
      ? new SobolSupplier(mc.nSteps)
      : new PseudoSupplier(seed);

  const payoffs: number[] = [];
  const sample: number[][] = [];
  const N = mc.antithetic ? Math.ceil(mc.nSims / 2) : mc.nSims;

  for (let i = 0; i < N; i++) {
    const z = supplier.draw(mc.nSteps);
    const p1 = pathFromNormals(common.S, common.r, common.q, common.sigma, common.T, z, false);
    payoffs.push(payoff(spec, common, p1, bridgeRng, useBridge));
    if (sample.length < keepPaths) sample.push(p1);

    if (mc.antithetic) {
      const p2 = pathFromNormals(common.S, common.r, common.q, common.sigma, common.T, z, true);
      payoffs.push(payoff(spec, common, p2, bridgeRng, useBridge));
      if (sample.length < keepPaths) sample.push(p2);
    }
  }

  let mu: number, sd: number, nEff: number;
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
  // Greeks always use pseudo-RNG for CRN (Sobol can't be re-seeded for paired runs).
  const greeksMc: MCParams = { ...mc, seed: baseSeed, rng: "pseudo" };
  const run = (c: CommonInputs) => priceExoticMC(spec, c, greeksMc, 0).price;
  const base = priceExoticMC(spec, common, greeksMc);

  const dS = common.S * 0.01;
  const dSig = Math.max(common.sigma * 0.01, 1e-4);
  const dR = 1e-4;
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

  // Central theta when feasible.
  let theta: number;
  if (common.T > 2 * dT) {
    const tUp = run({ ...common, T: common.T + dT });
    const tDn = run({ ...common, T: common.T - dT });
    theta = -(tUp - tDn) / (2 * dT);
  } else {
    const tDn = run({ ...common, T: Math.max(common.T - dT, 1e-6) });
    theta = -(base.price - tDn) / dT;
  }

  return {
    price: base.price,
    stderr: base.stderr,
    ci95: base.ci95,
    greeks: { delta, gamma, vega, theta, rho },
  };
}
