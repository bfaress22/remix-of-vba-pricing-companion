// Sobol low-discrepancy sequence generator (Joe-Kuo new-joe-kuo-6.21201
// direction numbers, first 32 dimensions embedded). Plus inverse normal
// CDF by Acklam (2003) — accuracy ~1.15e-9 absolute over the full range.
//
// References:
//   - Joe S., Kuo F.Y. (2008), "Constructing Sobol' sequences with better
//     two-dimensional projections", SIAM J. Sci. Comput. 30(5).
//   - Acklam P.J. (2003), "An algorithm for computing the inverse normal
//     cumulative distribution function".
//   - Glasserman P. (2003), Monte Carlo Methods in Financial Engineering,
//     §5.2.3 (Sobol) and §3.2.3 (Brownian bridge).

// Joe-Kuo direction numbers (s, a, m_i) for dimensions 2..32.
// Source: https://web.maths.unsw.edu.au/~fkuo/sobol/new-joe-kuo-6.21201
// Format per row: [s, a, m_1, m_2, ..., m_s].
const JK_DIRS: Array<[number, number, ...number[]]> = [
  [1, 0, 1],
  [2, 1, 1, 3],
  [3, 1, 1, 3, 1],
  [3, 2, 1, 1, 1],
  [4, 1, 1, 1, 3, 3],
  [4, 4, 1, 3, 5, 13],
  [5, 2, 1, 1, 5, 5, 17],
  [5, 4, 1, 1, 5, 5, 5],
  [5, 7, 1, 1, 7, 11, 19],
  [5, 11, 1, 3, 5, 1, 1],
  [5, 13, 1, 3, 1, 3, 11],
  [5, 14, 1, 1, 3, 7, 7],
  [6, 1, 1, 3, 3, 5, 9, 23],
  [6, 13, 1, 3, 3, 11, 25, 25],
  [6, 16, 1, 1, 3, 13, 25, 39],
  [6, 19, 1, 3, 1, 5, 27, 9],
  [6, 22, 1, 1, 1, 11, 1, 39],
  [6, 25, 1, 1, 3, 13, 23, 23],
  [7, 1, 1, 1, 5, 5, 9, 25, 109],
  [7, 4, 1, 1, 1, 11, 1, 31, 9],
  [7, 7, 1, 3, 1, 9, 31, 51, 25],
  [7, 8, 1, 3, 5, 11, 17, 21, 113],
  [7, 14, 1, 3, 1, 5, 13, 35, 31],
  [7, 19, 1, 1, 1, 5, 31, 49, 5],
  [7, 21, 1, 1, 3, 13, 29, 31, 75],
  [7, 28, 1, 1, 5, 9, 5, 1, 109],
  [7, 31, 1, 3, 5, 7, 25, 35, 75],
  [7, 32, 1, 1, 5, 5, 9, 27, 71],
  [7, 37, 1, 1, 3, 7, 27, 7, 23],
  [7, 41, 1, 1, 5, 11, 9, 49, 33],
  [7, 42, 1, 3, 1, 7, 25, 5, 117],
];

const BITS = 30; // Use 30 bits to stay safely within JS bitwise int range.
const SCALE = 1 / 2 ** BITS;

export class Sobol {
  private dim: number;
  private direction: number[][]; // [d][bit]
  private x: number[]; // current state per dim
  private count = 0;

  constructor(dim: number) {
    if (dim < 1) throw new Error("Sobol: dim must be >= 1");
    if (dim > JK_DIRS.length + 1) {
      throw new Error(`Sobol: dim ${dim} exceeds embedded table (max ${JK_DIRS.length + 1})`);
    }
    this.dim = dim;
    this.x = new Array<number>(dim).fill(0);
    this.direction = new Array<number[]>(dim);

    // Dimension 0 (1st dim): v_i = 1/2^i, i.e. m_i = 1, s irrelevant.
    this.direction[0] = new Array<number>(BITS + 1).fill(0);
    for (let i = 1; i <= BITS; i++) {
      this.direction[0][i] = 1 << (BITS - i);
    }

    // Dimensions 1..dim-1: build from Joe-Kuo (s,a,m).
    for (let d = 1; d < dim; d++) {
      const row = JK_DIRS[d - 1];
      const s = row[0];
      const a = row[1];
      const dir = new Array<number>(BITS + 1).fill(0);
      // Initial m_1..m_s shifted to v_i = m_i << (BITS - i).
      for (let i = 1; i <= s; i++) {
        const mi = row[1 + i] as number;
        dir[i] = mi << (BITS - i);
      }
      // Recurrence v_i = v_{i-s} XOR (v_{i-s} >> s) XOR XOR_{k=1..s-1} a_k v_{i-k}
      // where a is the polynomial coefficients packed as bits.
      for (let i = s + 1; i <= BITS; i++) {
        let v = dir[i - s] ^ (dir[i - s] >>> s);
        for (let k = 1; k <= s - 1; k++) {
          const bit = (a >>> (s - 1 - k)) & 1;
          if (bit) v ^= dir[i - k];
        }
        dir[i] = v;
      }
      this.direction[d] = dir;
    }
  }

  // Returns next vector in (0,1)^dim. First call returns the seed (small
  // positive shift to avoid exact 0/1 in inverse-normal transforms).
  next(): Float64Array {
    const out = new Float64Array(this.dim);
    if (this.count === 0) {
      this.count = 1;
      // Skip the all-zero point: use a tiny offset (Owen-style).
      for (let d = 0; d < this.dim; d++) out[d] = 0.5 * SCALE;
      return out;
    }
    // Find lowest-set bit of count (Antonov-Saleev recurrence).
    let c = 1;
    let value = this.count;
    while ((value & 1) === 1) {
      value >>>= 1;
      c++;
    }
    if (c > BITS) throw new Error("Sobol: sequence exhausted");
    for (let d = 0; d < this.dim; d++) {
      this.x[d] ^= this.direction[d][c];
      // Avoid exact 0 (first call already handled) and exact 1 (impossible
      // here since x < 2^BITS strictly).
      const u = this.x[d] * SCALE;
      out[d] = u <= 0 ? 0.5 * SCALE : u >= 1 ? 1 - 0.5 * SCALE : u;
    }
    this.count++;
    return out;
  }

  reset(): void {
    this.count = 0;
    this.x.fill(0);
  }
}

// Acklam (2003) inverse normal CDF. Max abs error ~1.15e-9 in (0,1).
// For finance we don't need machine precision (Sobol noise dominates).
const ACKLAM_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
];
const ACKLAM_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1,
];
const ACKLAM_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
];
const ACKLAM_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
  3.754408661907416,
];
const ACKLAM_PLOW = 0.02425;
const ACKLAM_PHIGH = 1 - ACKLAM_PLOW;

export function invNormCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let q: number, r: number;
  if (p < ACKLAM_PLOW) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q +
        ACKLAM_C[4]) *
        q +
        ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1)
    );
  }
  if (p <= ACKLAM_PHIGH) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r + ACKLAM_A[3]) * r +
        ACKLAM_A[4]) *
        r +
        ACKLAM_A[5]) *
        q) /
      (((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r + ACKLAM_B[3]) * r +
        ACKLAM_B[4]) *
        r +
        1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) * q +
      ACKLAM_C[4]) *
      q +
      ACKLAM_C[5]) /
    ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) * q + 1)
  );
}
