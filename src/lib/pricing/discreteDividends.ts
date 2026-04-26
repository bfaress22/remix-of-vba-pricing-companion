// Bos-Vandermark (2002) "Finessing fixed dividends" — translation of an
// equity with discrete cash dividends into an equivalent Black-Scholes
// model. Used by Bloomberg DVD/OVME for equity options with fixed cash
// divs (the standard market practice for single-stock options).
//
// Idea: split each cash dividend D_i (paid at t_i) between
//   - a "near" piece D_i^N applied as a forward-shift on S₀:  S* = S₀ − Σ D_i^N · e^{-r·t_i}
//   - a "far"  piece D_i^F applied as a strike shift:           K* = K + Σ D_i^F · e^{r·(T-t_i)}
// with weights w_i^N = (T − t_i)/T  and w_i^F = t_i/T, so D_i^N = w_i^N · D_i.
//
// Reference: Bos M., Vandermark S. (2002), "Finessing fixed dividends",
// Risk 15(9), 157–158. Validated by Vellekoop & Nieuwenhuis (2006),
// "Efficient pricing of derivatives on assets with discrete dividends",
// Applied Math. Finance 13(3).

export interface DiscreteDividend {
  t: number; // ex-div time in years from now (0 < t ≤ T)
  amount: number; // cash amount per share
}

export interface BVAdjusted {
  Sstar: number; // adjusted spot
  Kstar: number; // adjusted strike
}

export function bosVandermarkAdjust(
  S: number,
  K: number,
  T: number,
  r: number,
  divs: DiscreteDividend[],
): BVAdjusted {
  if (T <= 0 || divs.length === 0) return { Sstar: S, Kstar: K };
  let nearPV = 0;
  let farFV = 0;
  for (const d of divs) {
    if (d.t <= 0 || d.t > T) continue;
    const wNear = (T - d.t) / T;
    const wFar = d.t / T;
    nearPV += wNear * d.amount * Math.exp(-r * d.t);
    farFV += wFar * d.amount * Math.exp(r * (T - d.t));
  }
  return { Sstar: Math.max(S - nearPV, 1e-8), Kstar: K + farFV };
}

// Equivalent continuous yield q* such that S·e^{-q*·T} = S − Σ D_i e^{-r·t_i}.
// Useful as a fallback or for path-dependent products where Bos-Vandermark
// doesn't directly apply (we instead translate the cash divs into a
// continuous yield matching the same forward).
export function dividendsToContinuousYield(
  S: number,
  T: number,
  r: number,
  divs: DiscreteDividend[],
): number {
  if (T <= 0 || divs.length === 0) return 0;
  let pv = 0;
  for (const d of divs) {
    if (d.t <= 0 || d.t > T) continue;
    pv += d.amount * Math.exp(-r * d.t);
  }
  if (pv >= S) return 0; // pathological: divs would zero the forward
  return -Math.log(1 - pv / S) / T;
}
