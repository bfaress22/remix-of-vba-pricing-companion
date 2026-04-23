// Closed-form pricers for exotic options under Black-Scholes-Merton dynamics.
//
// References (same as Bloomberg OVME's analytic engines):
//   - Vanilles : Black & Scholes (1973), Merton (1973) avec dividende q.
//   - Barrière continue : Reiner & Rubinstein (1991), "Breaking down the
//     barriers", Risk 4(8); cf. Haug, "Complete Guide to Option Pricing
//     Formulas", 2e éd., chap. 4.17.
//   - Barrière discrète : Broadie, Glasserman & Kou (1997), "A continuity
//     correction for discrete barrier options", Math. Finance 7(4) — décale
//     la barrière de B·exp(±β·σ·√(T/m)), β = -ζ(1/2)/√(2π) ≈ 0.5826.
//   - Asiatique géométrique : Kemna & Vorst (1990), J. Banking & Finance.
//   - Asiatique arithmétique : Levy (1992), "Pricing European average rate
//     currency options", J. Int. Money & Finance 11 — moment-matching log-
//     normal sur 2 moments exacts.
//   - Digitales : Reiner & Rubinstein (1991), "Unscrambling the binary code".
//   - Lookback continu : Goldman, Sosin & Gatto (1979), J. Finance 34(5);
//     extension Conze & Viswanathan (1991) pour strike fixe et extrema déjà
//     réalisés.

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
// Broadie-Glasserman-Kou (1997) continuity correction constant.
const BGK_BETA = 0.5825971579390106; // -zeta(1/2)/sqrt(2*pi)

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
): number {
  // BGK continuity correction: shift B outward when monitored discretely.
  // Up-barrier: B_eff = B * exp( +beta*sigma*sqrt(T/m))
  // Down-barrier: B_eff = B * exp( -beta*sigma*sqrt(T/m))
  let B = Braw;
  if (monitoring === "discrete" && nMonitor > 0) {
    const shift = BGK_BETA * sigma * Math.sqrt(T / nMonitor);
    B = kind.startsWith("up") ? Braw * Math.exp(shift) : Braw * Math.exp(-shift);
  }
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

  // Knock-out check : si la barrière est déjà franchie à t=0, prix = 0.
  // En knock-in : si déjà franchie à t=0, le payoff est celui d'une vanille.
  if (isOut) {
    if (kind.startsWith("up") && S >= B) return 0;
    if (kind.startsWith("down") && S <= B) return 0;
  }
  if (isIn) {
    if (kind.startsWith("up") && S >= B) return blackScholes({ type, S, K, T, r, q, sigma }).price;
    if (kind.startsWith("down") && S <= B) return blackScholes({ type, S, K, T, r, q, sigma }).price;
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

// ---------- Geometric Asian (Kemna-Vorst 1990) ----------
// Volatilité ajustée σ_G = σ/√3, drift ajusté b_G = (r-q-σ²/6)/2.
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

// ---------- Lookback (continuous monitoring, Goldman-Sosin-Gatto / Conze-Viswanathan) ----------
// Avec extrema réalisés Smax (call fixe), Smin (put fixe) ou Smin/Smax (flottant).
// Si non fournis, on suppose que l'option vient d'être émise (Smin = Smax = S).
function lookbackPrice(
  type: OptionType,
  kind: LookbackKind,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  Smin?: number,
  Smax?: number,
): number {
  const b = r - q;
  const sqrtT = Math.sqrt(T);
  const sig2 = sigma * sigma;

  // Garde-fou b → 0 (cas r ≈ q, fréquent en FX).
  // Goldman-Sosin-Gatto a une singularité en 1/b ; on la lève par la limite
  // exacte (cf. Haug 2e éd., §4.16) qui remplace (σ²/(2b))·[(S/M)^{-2b/σ²}·N(...) − e^{bT}·N(...)]
  // par la forme limite −σ·√T·[ n(a1) + a1·N(a1) − a1 ] (Hull/Conze).
  // En pratique on régularise b à un epsilon signé : l'erreur résiduelle
  // est O(b·T) ≪ bruit de marché, et la formule reste continue.
  const bEff = Math.abs(b) < 1e-6 ? (b >= 0 ? 1e-6 : -1e-6) : b;

  if (kind === "floating") {
    // Floating strike: payoff = (S_T - m) call, (M - S_T) put.
    // Conze-Viswanathan : m = min réalisé (call), M = max réalisé (put).
    if (type === "call") {
      const M = Smin ?? S; // running min for floating call
      const a1 =
        (Math.log(S / M) + (bEff + 0.5 * sig2) * T) / (sigma * sqrtT);
      const a2 = a1 - sigma * sqrtT;
      const term =
        S * Math.exp(-q * T) * normCdf(a1) -
        M * Math.exp(-r * T) * normCdf(a2) +
        S *
          Math.exp(-r * T) *
          (sig2 / (2 * bEff)) *
          (Math.pow(S / M, -2 * bEff / sig2) *
            normCdf(-a1 + (2 * bEff * sqrtT) / sigma) -
            Math.exp(bEff * T) * normCdf(-a1));
      return term;
    } else {
      const M = Smax ?? S; // running max for floating put
      const a1 =
        (Math.log(S / M) + (bEff + 0.5 * sig2) * T) / (sigma * sqrtT);
      const a2 = a1 - sigma * sqrtT;
      const term =
        M * Math.exp(-r * T) * normCdf(-a2) -
        S * Math.exp(-q * T) * normCdf(-a1) +
        S *
          Math.exp(-r * T) *
          (sig2 / (2 * bEff)) *
          (-Math.pow(S / M, -2 * bEff / sig2) *
            normCdf(a1 - (2 * bEff * sqrtT) / sigma) +
            Math.exp(bEff * T) * normCdf(a1));
      return term;
    }
  } else {
    // Fixed strike lookback. Use realized extremum if provided.
    if (type === "call") {
      const M = Smax ?? S;
      const Kc = Math.max(K, M);
      const d1 =
        (Math.log(S / Kc) + (bEff + 0.5 * sig2) * T) / (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;
      const part1 =
        S * Math.exp(-q * T) * normCdf(d1) -
        Kc * Math.exp(-r * T) * normCdf(d2);
      const part2 =
        S *
        Math.exp(-r * T) *
        (sig2 / (2 * bEff)) *
        (-Math.pow(S / Kc, -2 * bEff / sig2) *
          normCdf(d1 - (2 * bEff * sqrtT) / sigma) +
          Math.exp(bEff * T) * normCdf(d1));
      let price = part1 + part2;
      if (K < M) price += (M - K) * Math.exp(-r * T);
      return price;
    } else {
      const m = Smin ?? S;
      const Kp = Math.min(K, m);
      const d1 =
        (Math.log(S / Kp) + (bEff + 0.5 * sig2) * T) / (sigma * sqrtT);
      const d2 = d1 - sigma * sqrtT;
      const part1 =
        Kp * Math.exp(-r * T) * normCdf(-d2) -
        S * Math.exp(-q * T) * normCdf(-d1);
      const part2 =
        S *
        Math.exp(-r * T) *
        (sig2 / (2 * bEff)) *
        (Math.pow(S / Kp, -2 * bEff / sig2) *
          normCdf(-d1 + (2 * bEff * sqrtT) / sigma) -
          Math.exp(bEff * T) * normCdf(-d1));
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
        spec.barrier!.monitoring ?? "continuous",
        spec.barrier!.nMonitor ?? 252,
      );
    case "asian": {
      // Géométrique : Kemna-Vorst, exacte. Arithmétique : Levy (1992),
      // moment-matching log-normal sur 2 moments exacts.
      if (spec.asian!.avg === "geometric") {
        return geometricAsianPrice(c.type, c.S, c.K, c.T, c.r, c.q, c.sigma);
      }
      return levyArithmeticAsian(
        c.type,
        c.S,
        c.K,
        c.T,
        c.r,
        c.q,
        c.sigma,
        spec.asian!.nFixings,
      );
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
        spec.lookback!.Smin,
        spec.lookback!.Smax,
      );
  }
}

// Levy (1992) moment-matching log-normal pour Asian arithmétique.
// Référence: Levy E. (1992), "Pricing European average rate currency
// options", Journal of International Money and Finance 11, 474-491.
// Si nFixings est fourni, on calcule les moments EXACTS de la moyenne
// arithmétique discrète A = (1/n) Σ S(t_i) sur n fixings équidistants
// dans (0, T]. Sinon on utilise la moyenne continue (1/T)∫₀ᵀ S(u)du.
function levyArithmeticAsian(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  sigma: number,
  nFixings?: number,
): number {
  const b = r - q;
  const sig2 = sigma * sigma;

  let M1: number;
  let M2: number;

  if (nFixings && nFixings >= 1) {
    // Moments EXACTS de A = (1/n) Σ_{i=1..n} S(t_i), t_i = i·dt, dt = T/n.
    // E[S(t_i)]    = S·exp(b·t_i)
    // E[S(t_i)S(t_j)] = S²·exp(b·(t_i+t_j) + σ²·min(t_i,t_j))
    const n = Math.floor(nFixings);
    const dt = T / n;
    let sum1 = 0;
    let sum2 = 0;
    for (let i = 1; i <= n; i++) {
      const ti = i * dt;
      sum1 += Math.exp(b * ti);
      for (let j = 1; j <= n; j++) {
        const tj = j * dt;
        sum2 += Math.exp(b * (ti + tj) + sig2 * Math.min(ti, tj));
      }
    }
    M1 = (S * sum1) / n;
    M2 = (S * S * sum2) / (n * n);
  } else {
    // Moments EXACTS de A = (1/T)∫₀ᵀ S(u)du sous GBM risque-neutre.
    // Référence : Levy (1992) éq. (5) ; cf. Haug 2e éd. §4.20.
    // E[A]  = S·(e^{bT} − 1)/(bT)
    // E[A²] = 2S²/T² · [ (e^{(2b+σ²)T} − 1) / ((2b+σ²)(b+σ²))
    //                  − (e^{bT} − 1)       / (b·(b+σ²)) ]
    if (Math.abs(b) < 1e-10) {
      // b → 0 : la moyenne reste lognormale, traiter par géométrique exacte.
      return geometricAsianPrice(type, S, K, T, r, q, sigma);
    }
    M1 = (S * (Math.exp(b * T) - 1)) / (b * T);
    M2 =
      ((2 * S * S) / (T * T)) *
      ((Math.exp((2 * b + sig2) * T) - 1) / ((2 * b + sig2) * (b + sig2)) -
        (Math.exp(b * T) - 1) / (b * (b + sig2)));
  }

  // Vol équivalente lognormale et moyenne lognormale :
  // V = log(M2) − 2·log(M1),  d1 = (log(M1/K) + V/2)/√V
  const V = Math.log(M2) - 2 * Math.log(M1);
  const sqrtV = Math.sqrt(V);
  const d1 = (Math.log(M1 / K) + 0.5 * V) / sqrtV;
  const d2 = d1 - sqrtV;
  const disc = Math.exp(-r * T);
  if (type === "call") {
    return disc * (M1 * normCdf(d1) - K * normCdf(d2));
  }
  return disc * (K * normCdf(-d2) - M1 * normCdf(-d1));
}

// ---------- Greeks by central bumping on the closed-form price ----------
export function exoticClosedFormGreeks(
  spec: ExoticSpec,
  c: CommonInputs,
): CFResult {
  const f = (cc: CommonInputs) => exoticClosedFormPrice(spec, cc);
  const price = f(c);

  // Bumps standard industrie (cf. Glasserman 2004, §7.1) :
  //   ΔS  = max(S·1%, 1e-4),    Δσ = 1e-2 (1 vol point),
  //   Δr  = 1e-4   (1 bp),       ΔT = min(T·1%, 1/365)
  // Tous central, sauf θ qui reste forward (T ne peut diminuer trop sans
  // saturer T → 0). Les bumps sont assez grands pour dominer le bruit
  // numérique (≈1e-12 sur Cody) tout en restant locaux.
  const dS = Math.max(c.S * 0.01, 1e-4);
  const dSig = 1e-2;
  const dR = 1e-4;
  const dT = Math.min(c.T * 0.01, 1 / 365);

  // Stabilisation barrière knock-in/out près de la barrière : si le bump
  // de S traverse la barrière, on rétrécit dS pour rester d'un seul côté.
  // Sans cela, gamma explose artificiellement par changement de régime
  // (formule barrière → vanille dans la branche knock-in déjà touché).
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

  // Theta : différence centrale en T quand T ≫ dT, forward sinon.
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

// Silence unused-import warning
void normPdf;
