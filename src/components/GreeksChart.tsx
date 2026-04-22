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
  const charts = useMemo(() => GREEK_LABELS, []);
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {charts.map(({ key, label }) => (
          <div key={key} className="h-[180px]">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{label}</span>
              <span className="text-muted-foreground">vs S</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 5, right: 8, bottom: 5, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="S"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number) => v.toFixed(4)}
                />
                <Line
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[key]}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Spot courant : {spot.toFixed(2)}
      </p>
      <span className="hidden">
        <Legend />
      </span>
    </Card>
  );
}
