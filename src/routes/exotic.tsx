import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/NumberField";
import { GreeksGrid } from "@/components/GreeksGrid";
import { GreeksChart, type GreekPoint } from "@/components/GreeksChart";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  exoticGreeks,
  priceExoticMC,
  type BarrierKind,
  type ExoticSpec,
  type ExoticType,
  type AsianAvg,
  type DigitalKind,
  type LookbackKind,
} from "@/lib/pricing/monteCarlo";
import {
  exoticClosedFormGreeks,
  exoticClosedFormPrice,
} from "@/lib/pricing/exoticClosedForm";
import type { OptionType } from "@/lib/pricing/blackScholes";

type PricingMethod = "closed-form" | "monte-carlo";

export const Route = createFileRoute("/exotic")({
  head: () => ({
    meta: [
      { title: "Options exotiques — Formules fermées & Monte Carlo | Quant Pricer" },
      {
        name: "description",
        content:
          "Pricing d'options barrières, asiatiques, digitales et lookback par formules fermées (par défaut) ou Monte Carlo. Grecques et graphes.",
      },
      { property: "og:title", content: "Options exotiques — CF & MC" },
      { property: "og:description", content: "Barrières, asiatiques, digitales, lookback." },
    ],
  }),
  component: ExoticPage,
});

function ExoticPage() {
  const [method, setMethod] = useState<PricingMethod>("closed-form");
  const [family, setFamily] = useState<ExoticType>("barrier");
  const [type, setType] = useState<OptionType>("call");
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [T, setT] = useState(1);
  const [r, setR] = useState(0.03);
  const [q, setQ] = useState(0);
  const [sigma, setSigma] = useState(0.2);

  // Family-specific
  const [barrierKind, setBarrierKind] = useState<BarrierKind>("up-out");
  const [B, setB] = useState(120);
  const [barrierMonitoring, setBarrierMonitoring] = useState<"continuous" | "discrete">("continuous");
  const [nMonitor, setNMonitor] = useState(252);
  const [rebate, setRebate] = useState(0);
  const [asianAvg, setAsianAvg] = useState<AsianAvg>("arithmetic");
  const [asianFixings, setAsianFixings] = useState(0); // 0 = continu
  const [digitalKind, setDigitalKind] = useState<DigitalKind>("cash");
  const [cash, setCash] = useState(1);
  const [digitalMode, setDigitalMode] = useState<"bs" | "callspread">("bs");
  const [lookbackKind, setLookbackKind] = useState<LookbackKind>("fixed");
  const [Smin, setSmin] = useState(100);
  const [Smax, setSmax] = useState(100);
  const [lookbackMonitoring, setLookbackMonitoring] = useState<"continuous" | "discrete">("continuous");
  const [lookbackNMonitor, setLookbackNMonitor] = useState(252);

  // MC params
  const [nSims, setNSims] = useState(20000);
  const [nSteps, setNSteps] = useState(100);
  const [seed, setSeed] = useState(42);
  const [antithetic, setAntithetic] = useState(true);
  const [rngMode, setRngMode] = useState<"pseudo" | "sobol">("sobol");
  const [brownianBridge, setBrownianBridge] = useState(true);

  const [running, setRunning] = useState(false);
  const [mcOutput, setMcOutput] = useState<null | {
    price: number;
    stderr: number;
    ci95: [number, number];
    greeks: { delta: number; gamma: number; vega: number; theta: number; rho: number };
    paths: number[][];
  }>(null);

  const spec: ExoticSpec = useMemo(() => {
    switch (family) {
      case "barrier":
        return {
          family,
          barrier: { kind: barrierKind, B, monitoring: barrierMonitoring, nMonitor, rebate },
        };
      case "asian":
        return {
          family,
          asian: {
            avg: asianAvg,
            nFixings: asianFixings > 0 ? asianFixings : undefined,
          },
        };
      case "digital":
        return { family, digital: { kind: digitalKind, cash, mode: digitalMode } };
      case "lookback":
        return {
          family,
          lookback: {
            kind: lookbackKind,
            Smin,
            Smax,
            monitoring: lookbackMonitoring,
            nMonitor: lookbackNMonitor,
          },
        };
    }
  }, [family, barrierKind, B, barrierMonitoring, nMonitor, rebate, asianAvg, asianFixings, digitalKind, cash, digitalMode, lookbackKind, Smin, Smax, lookbackMonitoring, lookbackNMonitor]);

  // Closed-form result: recomputed live on every input change.
  const cfOutput = useMemo(() => {
    if (method !== "closed-form") return null;
    try {
      return exoticClosedFormGreeks(spec, { S, K, T, r, q, sigma, type });
    } catch {
      return null;
    }
  }, [method, spec, S, K, T, r, q, sigma, type]);

  // P&L vs spot at several residual maturities (closed form only).
  const pnlCurve = useMemo(() => {
    if (method !== "closed-form" || !cfOutput) return [];
    const premium = cfOutput.price;
    const lo = Math.max(S * 0.5, 1e-3);
    const hi = S * 1.5;
    const n = 60;
    const horizons: { key: string; T: number }[] = [
      { key: "t0", T: T },
      { key: "tMid", T: T / 2 },
      { key: "tEnd", T: Math.max(T * 0.01, 1e-4) },
    ];
    const rows: Record<string, number>[] = [];
    for (let i = 0; i <= n; i++) {
      const Si = lo + (hi - lo) * (i / n);
      const row: Record<string, number> = { S: +Si.toFixed(2) };
      for (const h of horizons) {
        try {
          const price = exoticClosedFormPrice(spec, {
            S: Si,
            K,
            T: h.T,
            r,
            q,
            sigma,
            type,
          });
          row[h.key] = +(price - premium).toFixed(4);
        } catch {
          // skip
        }
      }
      rows.push(row);
    }
    return rows;
  }, [method, cfOutput, spec, S, K, T, r, q, sigma, type]);

  // Payoff à l'échéance : exact, exprimé dans la variable d'état pertinente
  // pour chaque famille (S_T pour vanille/digital/barrière, moyenne A pour
  // asiatique, extremum M pour lookback). Aucune approximation.
  const payoffMeta = useMemo(() => {
    switch (family) {
      case "digital":
        return {
          xLabel: "S à maturité",
          xKey: "x",
          note: "Payoff exact en fonction de S à maturité.",
          scenario: null as string | null,
        };
      case "barrier": {
        const isOut = barrierKind.endsWith("out");
        const isUp = barrierKind.startsWith("up");
        const scenario = isOut
          ? `Scénario : barrière ${isUp ? "haute" : "basse"} B=${B} non franchie (option active).`
          : `Scénario : barrière ${isUp ? "haute" : "basse"} B=${B} franchie (option activée).`;
        return {
          xLabel: "S à maturité",
          xKey: "x",
          note: "Payoff exact en fonction de S à maturité, conditionné au scénario ci-dessous.",
          scenario,
        };
      }
      case "asian":
        return {
          xLabel: `Moyenne ${asianAvg === "arithmetic" ? "arithmétique" : "géométrique"} A à maturité`,
          xKey: "x",
          note: "Le payoff d'une option asiatique est fonction de la moyenne A, pas de S_T. Courbe strictement exacte en A.",
          scenario: null,
        };
      case "lookback":
        return {
          xLabel:
            type === "call"
              ? lookbackKind === "fixed"
                ? "Max M réalisé"
                : "Min m réalisé"
              : lookbackKind === "fixed"
                ? "Min m réalisé"
                : "Max M réalisé",
          xKey: "x",
          note: "Le payoff d'un lookback est fonction de l'extremum réalisé. Courbe strictement exacte en cet extremum.",
          scenario: null,
        };
    }
  }, [family, barrierKind, B, asianAvg, lookbackKind, type]);

  const payoffCurve = useMemo(() => {
    const premium = cfOutput?.price ?? 0;
    // Determine x-axis range from S (reasonable display window)
    const lo = Math.max(S * 0.4, 1e-3);
    const hi = S * 1.6;
    const n = 80;
    const rows: { x: number; payoff: number; pnl: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const x = lo + (hi - lo) * (i / n);
      let pay = 0;
      switch (family) {
        case "digital": {
          const inMoney = type === "call" ? x > K : x < K;
          if (inMoney) pay = digitalKind === "cash" ? cash : x;
          break;
        }
        case "barrier": {
          // Conditioned on the "active" scenario (knock-out not breached,
          // or knock-in breached). Then payoff is just vanilla on S_T=x.
          pay = type === "call" ? Math.max(x - K, 0) : Math.max(K - x, 0);
          break;
        }
        case "asian": {
          // Payoff is exact function of the average A (= x).
          pay = type === "call" ? Math.max(x - K, 0) : Math.max(K - x, 0);
          break;
        }
        case "lookback": {
          if (lookbackKind === "fixed") {
            // call: max(M - K, 0) where M = realized max (= x)
            // put:  max(K - m, 0) where m = realized min (= x)
            pay = type === "call" ? Math.max(x - K, 0) : Math.max(K - x, 0);
          } else {
            // floating strike lookback: payoff uses S_T and the extremum.
            // At maturity, S_T ≤ M (call) or S_T ≥ m (put); the payoff is
            // max(S_T - m, 0) (call) or max(M - S_T, 0) (put). Without
            // fixing S_T, we display the max achievable payoff conditional on
            // extremum x and S_T = S (current spot), which is exact given
            // that assumption. Mark via scenario text.
            pay =
              type === "call"
                ? Math.max(S - x, 0) // x = realized min m
                : Math.max(x - S, 0); // x = realized max M
          }
          break;
        }
      }
      rows.push({
        x: +x.toFixed(2),
        payoff: +pay.toFixed(4),
        pnl: +(pay - premium).toFixed(4),
      });
    }
    return rows;
  }, [family, type, K, S, cfOutput, digitalKind, cash, lookbackKind]);

  // Greeks-vs-spot curve (closed form only — MC would be too slow here).
  const greekCurve: GreekPoint[] = useMemo(() => {
    if (method !== "closed-form") return [];
    const lo = Math.max(S * 0.5, 1e-3);
    const hi = S * 1.5;
    const n = 40;
    const out: GreekPoint[] = [];
    for (let i = 0; i <= n; i++) {
      const Si = lo + (hi - lo) * (i / n);
      try {
        const g = exoticClosedFormGreeks(spec, { S: Si, K, T, r, q, sigma, type });
        out.push({
          S: +Si.toFixed(2),
          delta: +g.delta.toFixed(6),
          gamma: +g.gamma.toFixed(6),
          vega: +g.vega.toFixed(6),
          theta: +g.theta.toFixed(6),
          rho: +g.rho.toFixed(6),
        });
      } catch {
        // skip non-finite points
      }
    }
    return out;
  }, [method, spec, K, T, r, q, sigma, type, S]);

  const runMC = () => {
    setRunning(true);
    setTimeout(() => {
      try {
        const common = { S, K, T, r, q, sigma, type };
        const mc = { nSims, nSteps, seed, antithetic, rng: rngMode, brownianBridge };
        const grk = exoticGreeks(spec, common, mc);
        const sample = priceExoticMC(spec, common, mc, 15);
        setMcOutput({
          price: grk.price,
          stderr: grk.stderr,
          ci95: grk.ci95,
          greeks: grk.greeks,
          paths: sample.paths,
        });
      } finally {
        setRunning(false);
      }
    }, 10);
  };

  const pathData = useMemo(() => {
    if (!mcOutput) return [];
    const dt = T / nSteps;
    return Array.from({ length: nSteps + 1 }, (_, i) => {
      const row: Record<string, number> = { t: +(i * dt).toFixed(3) };
      mcOutput.paths.forEach((p, idx) => {
        row[`p${idx}`] = +p[i].toFixed(2);
      });
      return row;
    });
  }, [mcOutput, T, nSteps]);

  // Closed-form availability note
  const cfNote =
    family === "asian"
      ? asianAvg === "arithmetic"
        ? "Levy (1992) — moment-matching log-normal sur 2 moments exacts."
        : "Kemna-Vorst (1990) — exact pour la moyenne géométrique."
      : family === "barrier"
        ? barrierMonitoring === "continuous"
          ? "Reiner-Rubinstein (1991), monitoring continu — exact."
          : `Reiner-Rubinstein + correction Broadie-Glasserman-Kou (1997), m = ${nMonitor} obs.`
        : family === "lookback"
          ? "Goldman-Sosin-Gatto (1979) / Conze-Viswanathan (1991), monitoring continu."
          : "Reiner-Rubinstein (1991) — exact.";

  // Pick which result to display in the grid
  const displayPrice =
    method === "closed-form" ? cfOutput?.price : mcOutput?.price;
  const displayGreeks =
    method === "closed-form"
      ? cfOutput
        ? {
            delta: cfOutput.delta,
            gamma: cfOutput.gamma,
            vega: cfOutput.vega,
            theta: cfOutput.theta,
            rho: cfOutput.rho,
          }
        : null
      : mcOutput?.greeks ?? null;
  const displayCI = method === "monte-carlo" ? mcOutput?.ci95 : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Options exotiques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Formules fermées par défaut, Monte Carlo en option (GBM risque-neutre).
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Inputs */}
          <Card className="h-fit p-5 lg:sticky lg:top-20">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Méthode de pricing
                </Label>
                <Select value={method} onValueChange={(v) => setMethod(v as PricingMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed-form">Formule fermée (défaut)</SelectItem>
                    <SelectItem value="monte-carlo">Monte Carlo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Famille
                </Label>
                <Select value={family} onValueChange={(v) => setFamily(v as ExoticType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="barrier">Barrière</SelectItem>
                    <SelectItem value="asian">Asiatique</SelectItem>
                    <SelectItem value="digital">Digitale</SelectItem>
                    <SelectItem value="lookback">Lookback</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sens
                </Label>
                <Select value={type} onValueChange={(v) => setType(v as OptionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="put">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <NumberField label="Spot S" value={S} onChange={setS} step={1} />
              <NumberField label="Strike K" value={K} onChange={setK} step={1} />
              <NumberField label="Maturité T" value={T} onChange={setT} step={0.05} suffix="années" />
              <NumberField label="Taux r" value={r} onChange={setR} step={0.005} />
              <NumberField label="Dividende q" value={q} onChange={setQ} step={0.005} />
              <NumberField label="Volatilité σ" value={sigma} onChange={setSigma} step={0.01} />

              {/* family-specific */}
              {family === "barrier" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Type de barrière
                    </Label>
                    <Select value={barrierKind} onValueChange={(v) => setBarrierKind(v as BarrierKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="up-out">Up & Out</SelectItem>
                        <SelectItem value="up-in">Up & In</SelectItem>
                        <SelectItem value="down-out">Down & Out</SelectItem>
                        <SelectItem value="down-in">Down & In</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <NumberField label="Barrière B" value={B} onChange={setB} step={1} />
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Monitoring
                    </Label>
                    <Select value={barrierMonitoring} onValueChange={(v) => setBarrierMonitoring(v as "continuous" | "discrete")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="continuous">Continu (Reiner-Rubinstein)</SelectItem>
                        <SelectItem value="discrete">Discret (Broadie-Glasserman-Kou)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {barrierMonitoring === "discrete" && (
                    <NumberField
                      label="Pas de monitoring m"
                      value={nMonitor}
                      onChange={(v) => setNMonitor(Math.max(1, Math.round(v)))}
                      step={1}
                      suffix="obs"
                    />
                  )}
                </>
              )}
              {family === "asian" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Moyenne
                    </Label>
                    <Select value={asianAvg} onValueChange={(v) => setAsianAvg(v as AsianAvg)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arithmetic">Arithmétique</SelectItem>
                        <SelectItem value="geometric">Géométrique</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {asianAvg === "arithmetic" && (
                    <NumberField
                      label="Fixings n (0 = continu)"
                      value={asianFixings}
                      onChange={(v) => setAsianFixings(Math.max(0, Math.round(v)))}
                      step={1}
                      suffix="obs"
                    />
                  )}
                </>
              )}
              {family === "digital" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Type
                    </Label>
                    <Select value={digitalKind} onValueChange={(v) => setDigitalKind(v as DigitalKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash-or-nothing</SelectItem>
                        <SelectItem value="asset">Asset-or-nothing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {digitalKind === "cash" && (
                    <NumberField label="Cash payout" value={cash} onChange={setCash} step={0.1} />
                  )}
                </>
              )}
              {family === "lookback" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Strike
                    </Label>
                    <Select value={lookbackKind} onValueChange={(v) => setLookbackKind(v as LookbackKind)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixe</SelectItem>
                        <SelectItem value="floating">Flottant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {((lookbackKind === "fixed" && type === "put") ||
                    (lookbackKind === "floating" && type === "call")) && (
                    <NumberField
                      label="Min réalisé Sₘᵢₙ"
                      value={Smin}
                      onChange={setSmin}
                      step={1}
                    />
                  )}
                  {((lookbackKind === "fixed" && type === "call") ||
                    (lookbackKind === "floating" && type === "put")) && (
                    <NumberField
                      label="Max réalisé Sₘₐₓ"
                      value={Smax}
                      onChange={setSmax}
                      step={1}
                    />
                  )}
                </>
              )}

              {method === "monte-carlo" && (
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-xs font-semibold uppercase tracking-wide">
                    Monte Carlo
                  </Label>
                  <NumberField label="Simulations" value={nSims} onChange={(v) => setNSims(Math.max(100, Math.round(v)))} step={1000} />
                  <NumberField label="Pas" value={nSteps} onChange={(v) => setNSteps(Math.max(1, Math.round(v)))} step={10} />
                  <NumberField label="Seed" value={seed} onChange={(v) => setSeed(Math.round(v))} step={1} />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Antithétique
                    </Label>
                    <Switch checked={antithetic} onCheckedChange={setAntithetic} />
                  </div>
                  <Button onClick={runMC} disabled={running} className="w-full">
                    {running ? "Calcul…" : "Lancer la simulation"}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Results */}
          <div className="space-y-6">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Résultats
                </h2>
                <span className="text-xs text-muted-foreground">
                  {method === "closed-form" ? "Formule fermée" : "Monte Carlo"}
                </span>
              </div>
              {cfNote && method === "closed-form" && (
                <p className="mt-1 text-xs text-muted-foreground">{cfNote}</p>
              )}
              <div className="mt-4">
                {displayGreeks && displayPrice !== undefined ? (
                  <GreeksGrid
                    price={displayPrice}
                    delta={displayGreeks.delta}
                    gamma={displayGreeks.gamma}
                    vega={displayGreeks.vega}
                    theta={displayGreeks.theta}
                    rho={displayGreeks.rho}
                    ci={displayCI}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {method === "monte-carlo"
                      ? "Configurez les paramètres puis lancez la simulation."
                      : "Calcul en cours…"}
                  </p>
                )}
              </div>
            </Card>

            {method === "closed-form" && greekCurve.length > 0 && (
              <GreeksChart data={greekCurve} spot={S} />
            )}

            {method === "closed-form" && payoffCurve.length > 0 && (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Payoff &amp; P&amp;L à l'échéance
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {payoffMeta.note}
                    </p>
                    {payoffMeta.scenario && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payoffMeta.scenario}
                      </p>
                    )}
                    {family === "lookback" && lookbackKind === "floating" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Scénario : S à maturité = S₀ = {S}.
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Exact
                  </span>
                </div>
                <div className="mt-4 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={payoffCurve} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="x"
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-muted-foreground)"
                        label={{ value: payoffMeta.xLabel, position: "insideBottom", offset: -2, fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => v.toFixed(4)}
                      />
                      <Line
                        type="monotone"
                        dataKey="payoff"
                        name="Payoff"
                        stroke="var(--color-chart-1)"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        name="P&L (payoff − prime)"
                        stroke="var(--color-chart-4)"
                        dot={false}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm" style={{ background: "var(--color-chart-1)" }} />
                    Payoff
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm" style={{ background: "var(--color-chart-4)" }} />
                    P&amp;L (− prime {cfOutput?.price.toFixed(4) ?? "—"})
                  </span>
                </div>
              </Card>
            )}

            {method === "closed-form" && pnlCurve.length > 0 && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  P&amp;L vs Spot
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valeur de l'option − prime payée ({cfOutput?.price.toFixed(4)}), à différentes maturités résiduelles.
                </p>
                <div className="mt-4 h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pnlCurve} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="S"
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-muted-foreground)"
                        label={{ value: "Spot", position: "insideBottom", offset: -2, fontSize: 11 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="var(--color-muted-foreground)"
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-popover)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(v: number) => v.toFixed(4)}
                      />
                      <Line
                        type="monotone"
                        dataKey="t0"
                        name={`T = ${T.toFixed(2)}`}
                        stroke="var(--color-chart-1)"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="tMid"
                        name={`T/2 = ${(T / 2).toFixed(2)}`}
                        stroke="var(--color-chart-2)"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="tEnd"
                        name="≈ Maturité"
                        stroke="var(--color-chart-3)"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm" style={{ background: "var(--color-chart-1)" }} />
                    T = {T.toFixed(2)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm" style={{ background: "var(--color-chart-2)" }} />
                    T/2
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm" style={{ background: "var(--color-chart-3)" }} />
                    ≈ Maturité
                  </span>
                </div>
              </Card>
            )}

            {method === "monte-carlo" && (
              <Card className="p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Trajectoires simulées (échantillon)
                </h2>
                <div className="mt-4 h-[340px]">
                  {mcOutput ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={pathData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-popover)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        {mcOutput.paths.map((_, idx) => (
                          <Line
                            key={idx}
                            type="monotone"
                            dataKey={`p${idx}`}
                            stroke={`var(--color-chart-${(idx % 5) + 1})`}
                            dot={false}
                            strokeWidth={1}
                            strokeOpacity={0.7}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Aucune simulation.
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
