import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { NumberField } from "@/components/NumberField";
import { GreeksGrid } from "@/components/GreeksGrid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { blackScholes, vanillaPayoff, type OptionType } from "@/lib/pricing/blackScholes";

export const Route = createFileRoute("/vanilla")({
  head: () => ({
    meta: [
      { title: "Options vanilles — Black-Scholes | Quant Pricer" },
      {
        name: "description",
        content:
          "Pricer Black-Scholes-Merton pour Calls et Puts européens. Prime, grecques, payoff et P&L à différentes dates.",
      },
      { property: "og:title", content: "Options vanilles — Black-Scholes" },
      { property: "og:description", content: "Prime, grecques et payoff en temps réel." },
      { property: "og:url", content: "https://pricers-pal-vba.lovable.app/vanilla" },
    ],
    links: [
      { rel: "canonical", href: "https://pricers-pal-vba.lovable.app/vanilla" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Quant Pricer — Vanilla options",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Black-Scholes-Merton pricer for European calls and puts with analytical greeks.",
          url: "https://pricers-pal-vba.lovable.app/vanilla",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: VanillaPage,
});

function VanillaPage() {
  const [type, setType] = useState<OptionType>("call");
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [T, setT] = useState(1);
  const [r, setR] = useState(0.03);
  const [q, setQ] = useState(0);
  const [sigma, setSigma] = useState(0.2);

  const result = useMemo(
    () => blackScholes({ type, S, K, T, r, q, sigma }),
    [type, S, K, T, r, q, sigma],
  );

  // Payoff at maturity + value at T/2 + value at t=0 across spot grid
  const chartData = useMemo(() => {
    const lo = Math.max(K * 0.5, S * 0.5);
    const hi = Math.max(K * 1.5, S * 1.5);
    const n = 60;
    const out: { S: number; payoff: number; now: number; mid: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const Si = lo + (hi - lo) * (i / n);
      const payoff = vanillaPayoff(type, Si, K);
      const now = blackScholes({ type, S: Si, K, T, r, q, sigma }).price;
      const mid = blackScholes({ type, S: Si, K, T: T / 2, r, q, sigma }).price;
      out.push({ S: +Si.toFixed(2), payoff, now: +now.toFixed(4), mid: +mid.toFixed(4) });
    }
    return out;
  }, [type, S, K, T, r, q, sigma]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Options vanilles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Modèle Black-Scholes-Merton avec dividende continu q. Recalcul instantané.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Inputs */}
          <Card className="h-fit p-5 lg:sticky lg:top-20">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Type
                </Label>
                <Select value={type} onValueChange={(v) => setType(v as OptionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="put">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <NumberField label="Spot S" value={S} onChange={setS} step={1} />
              <NumberField label="Strike K" value={K} onChange={setK} step={1} />
              <NumberField label="Maturité T" value={T} onChange={setT} step={0.05} suffix="années" />
              <NumberField label="Taux r" value={r} onChange={setR} step={0.005} suffix="cont." />
              <NumberField label="Dividende q" value={q} onChange={setQ} step={0.005} suffix="cont." />
              <NumberField label="Volatilité σ" value={sigma} onChange={setSigma} step={0.01} />
            </div>
          </Card>

          {/* Results */}
          <div className="space-y-6">
            <Card className="p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Résultats
              </h2>
              <div className="mt-4">
                <GreeksGrid
                  price={result.price}
                  delta={result.delta}
                  gamma={result.gamma}
                  vega={result.vega}
                  theta={result.theta}
                  rho={result.rho}
                />
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Valeur de l'option vs Spot
              </h2>
              <div className="mt-4 h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="S"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine
                      x={chartData.reduce((acc, p) => (Math.abs(p.S - S) < Math.abs(acc - S) ? p.S : acc), chartData[0].S)}
                      stroke="var(--color-primary)"
                      strokeDasharray="4 4"
                      label={{ value: "Spot", fill: "var(--color-primary)", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="payoff"
                      name="Payoff (T)"
                      stroke="var(--color-chart-1)"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="mid"
                      name="Valeur (T/2)"
                      stroke="var(--color-chart-2)"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="now"
                      name="Valeur (t=0)"
                      stroke="var(--color-chart-4)"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
