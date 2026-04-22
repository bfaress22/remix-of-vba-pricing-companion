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
  // Normalise chaque grecque par son max absolu pour les superposer sur une
  // même échelle. La valeur brute reste dans le tooltip.
  const { normalised, scales } = useMemo(() => {
    const sc: Record<GreekKey, number> = {
      delta: 0,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
    };
    for (const row of data) {
      for (const { key } of GREEK_LABELS) {
        const v = Math.abs(row[key]);
        if (v > sc[key]) sc[key] = v;
      }
    }
    const norm = data.map((row) => {
      const r: Record<string, number> = { S: row.S };
      for (const { key } of GREEK_LABELS) {
        r[key] = sc[key] > 0 ? row[key] / sc[key] : 0;
        r[`${key}_raw`] = row[key];
      }
      return r;
    });
    return { normalised: norm, scales: sc };
  }, [data]);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Valeurs normalisées (÷ max |·|)
        </span>
      </div>
      <div className="mt-4 h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={normalised}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          >
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
              domain={[-1, 1]}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(_v: number, name: string, item) => {
                const payload = item?.payload as Record<string, number> | undefined;
                const raw = payload?.[`${name}_raw`];
                return [raw !== undefined ? raw.toFixed(4) : "—", name];
              }}
            />
            <ReferenceLine
              x={spot}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="3 3"
            />
            <ReferenceLine y={0} stroke="var(--color-border)" />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {GREEK_LABELS.map(({ key, label }) => (
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
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-5">
        {GREEK_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1">
            <span
              className="h-2 w-3 rounded-sm"
              style={{ background: COLORS[key] }}
            />
            <span className="font-mono">{label}</span>
            <span className="ml-auto">max |·| = {scales[key].toFixed(4)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Spot courant : {spot.toFixed(2)}
      </p>
    </Card>
  );
}
