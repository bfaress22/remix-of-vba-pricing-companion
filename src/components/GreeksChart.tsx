import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";

export type GreekKey = "delta" | "gamma" | "vega" | "theta" | "rho";

export interface GreekPoint {
  S: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
}

interface Props {
  data: GreekPoint[];
  spot: number;
  title?: string;
}

const GREEKS: { key: GreekKey; label: string; color: string; digits: number }[] = [
  { key: "delta", label: "Delta", color: "var(--color-chart-1)", digits: 4 },
  { key: "gamma", label: "Gamma", color: "var(--color-chart-2)", digits: 6 },
  { key: "vega", label: "Vega", color: "var(--color-chart-3)", digits: 4 },
  { key: "theta", label: "Theta", color: "var(--color-chart-4)", digits: 4 },
  { key: "rho", label: "Rho", color: "var(--color-chart-5)", digits: 4 },
];

function MiniChart({
  data,
  spot,
  gKey,
  label,
  color,
  digits,
}: {
  data: GreekPoint[];
  spot: number;
  gKey: GreekKey;
  label: string;
  color: string;
  digits: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">vs Spot</span>
      </div>
      <div className="mt-2 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="S"
              tick={{ fontSize: 10 }}
              stroke="var(--color-muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              stroke="var(--color-muted-foreground)"
              width={56}
              tickFormatter={(v: number) => {
                const a = Math.abs(v);
                if (a !== 0 && (a >= 1000 || a < 0.01)) return v.toExponential(1);
                return v.toFixed(digits > 4 ? 4 : 2);
              }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v: number) => [v.toFixed(digits), label]}
              labelFormatter={(s: number) => `Spot ${Number(s).toFixed(2)}`}
            />
            <ReferenceLine
              x={spot}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="3 3"
            />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Line
              type="monotone"
              dataKey={gKey}
              stroke={color}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GreeksChart({ data, spot, title = "Grecques vs Spot" }: Props) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Spot courant : {spot.toFixed(2)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {GREEKS.map((g) => (
          <MiniChart
            key={g.key}
            data={data}
            spot={spot}
            gKey={g.key}
            label={g.label}
            color={g.color}
            digits={g.digits}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Chaque grecque est tracée sur sa propre échelle (standard desks : pas de
        normalisation, lecture directe des sensibilités).
      </p>
    </Card>
  );
}