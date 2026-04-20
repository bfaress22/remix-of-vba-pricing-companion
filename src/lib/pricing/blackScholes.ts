// Black-Scholes-Merton closed-form pricer for European vanilla options
// with continuous dividend yield q.

import { normCdf, normPdf } from "./stats";

export type OptionType = "call" | "put";

export interface BSInputs {
  type: OptionType;
  S: number; // spot
  K: number; // strike
  T: number; // maturity in years
  r: number; // risk-free rate (cont.)
  q: number; // continuous dividend yield
  sigma: number; // volatility (annualized)
}

export interface BSResult {
  price: number;
  delta: number;
  gamma: number;
  vega: number; // per 1.00 vol change (multiply by 0.01 for per 1%)
  theta: number; // per year (divide by 365 for per day)
  rho: number; // per 1.00 rate change
  d1: number;
  d2: number;
}

export function blackScholes(inp: BSInputs): BSResult {
  const { type, S, K, T, r, q, sigma } = inp;

  // Edge case: T = 0 → intrinsic value, no greeks
  if (T <= 0 || sigma <= 0) {
    const intrinsic =
      type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return {
      price: intrinsic,
      delta: type === "call" ? (S > K ? 1 : 0) : S < K ? -1 : 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
      d1: 0,
      d2: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const nNd1 = normCdf(-d1);
  const nNd2 = normCdf(-d2);
  const pdfD1 = normPdf(d1);

  const discR = Math.exp(-r * T);
  const discQ = Math.exp(-q * T);

  let price: number, delta: number, theta: number, rho: number;

  if (type === "call") {
    price = S * discQ * Nd1 - K * discR * Nd2;
    delta = discQ * Nd1;
    theta =
      -(S * discQ * pdfD1 * sigma) / (2 * sqrtT) -
      r * K * discR * Nd2 +
      q * S * discQ * Nd1;
    rho = K * T * discR * Nd2;
  } else {
    price = K * discR * nNd2 - S * discQ * nNd1;
    delta = -discQ * nNd1;
    theta =
      -(S * discQ * pdfD1 * sigma) / (2 * sqrtT) +
      r * K * discR * nNd2 -
      q * S * discQ * nNd1;
    rho = -K * T * discR * nNd2;
  }

  const gamma = (discQ * pdfD1) / (S * sigma * sqrtT);
  const vega = S * discQ * pdfD1 * sqrtT;

  return { price, delta, gamma, vega, theta, rho, d1, d2 };
}

// Payoff at maturity for a vanilla option at terminal spot ST
export function vanillaPayoff(type: OptionType, ST: number, K: number): number {
  return type === "call" ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
}
