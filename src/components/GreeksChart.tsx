import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
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

const COLORS: Record<GreekKey, string> = {
  delta: "var(--color-chart-1)",
  gamma: "var(--color-chart-2)",
  vega: "var(--color-chart-3)",
  theta: "var(--color-chart-4)",
  rho: "var(--color-chart-5)",
};

const GREEK_LABELS: { key: GreekKey; label: string }[] = [
  { key: "delta", label: "Delta" },
  { key: "gamma", label: "Gamma" },
  { key: "vega", label: "Vega" },
  { key: "theta", label: "Theta" },
  { key: "rho", label: "Rho" },
];

export function GreeksChart({ data, spot, title = "Grecques vs Spot" }: Props) {
  const greeks = useMemo(() => GREEK_LABELS, []);
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4 h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="S"
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
              label={{
                value: "Spot",
                position: "insideBottom",
                offset: -2,
                fontSize: 11,
                fill: "var(--color-muted-foreground)",
              }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v: number, name: string) => [v.toFixed(4), name]}
              labelFormatter={(l) => `S = ${Number(l).toFixed(2)}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {greeks.map(({ key, label }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={COLORS[key]}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Spot courant : {spot.toFixed(2)} — toutes les grecques sont tracées sur la même échelle.
      </p>
    </Card>
  );
}
