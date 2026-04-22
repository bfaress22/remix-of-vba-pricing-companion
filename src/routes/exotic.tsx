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
  const [asianAvg, setAsianAvg] = useState<AsianAvg>("arithmetic");
  const [digitalKind, setDigitalKind] = useState<DigitalKind>("cash");
  const [cash, setCash] = useState(1);
  const [lookbackKind, setLookbackKind] = useState<LookbackKind>("fixed");

  // MC params
  const [nSims, setNSims] = useState(20000);
  const [nSteps, setNSteps] = useState(100);
  const [seed, setSeed] = useState(42);
  const [antithetic, setAntithetic] = useState(true);

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
        return { family, barrier: { kind: barrierKind, B } };
      case "asian":
        return { family, asian: { avg: asianAvg } };
      case "digital":
        return { family, digital: { kind: digitalKind, cash } };
      case "lookback":
        return { family, lookback: { kind: lookbackKind } };
    }
  }, [family, barrierKind, B, asianAvg, digitalKind, cash, lookbackKind]);

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
        const mc = { nSims, nSteps, seed, antithetic };
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

  // Closed-form availability note (arithmetic Asian uses Turnbull-Wakeman approximation)
  const cfNote =
    family === "asian" && asianAvg === "arithmetic"
      ? "Approximation Turnbull-Wakeman (matching de moments)."
      : family === "barrier"
        ? "Formule Reiner-Rubinstein, monitoring continu."
        : family === "lookback"
          ? "Formule Goldman-Sosin-Gatto, monitoring continu, extrema = S₀."
          : null;

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
                </>
              )}
              {family === "asian" && (
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

// Avoid unused import warning when method is closed-form
void exoticClosedFormPrice;
