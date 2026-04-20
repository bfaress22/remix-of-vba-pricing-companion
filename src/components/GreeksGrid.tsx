interface Props {
  price: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  ci?: [number, number];
}

function fmt(x: number, digits = 4) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits);
}

export function GreeksGrid({ price, delta, gamma, vega, theta, rho, ci }: Props) {
  const items = [
    { label: "Prime", value: fmt(price), accent: true },
    { label: "Delta", value: fmt(delta) },
    { label: "Gamma", value: fmt(gamma, 6) },
    { label: "Vega (per 1.00 σ)", value: fmt(vega, 4) },
    { label: "Theta (per an)", value: fmt(theta, 4) },
    { label: "Rho (per 1.00 r)", value: fmt(rho, 4) },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.label}
            className={`rounded-lg border p-3 ${it.accent ? "bg-primary/5 border-primary/30" : "bg-card"}`}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{it.label}</div>
            <div className={`mt-1 font-mono text-lg ${it.accent ? "text-primary font-semibold" : ""}`}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
      {ci && (
        <p className="mt-2 text-xs text-muted-foreground">
          IC 95% : [{fmt(ci[0])}, {fmt(ci[1])}]
        </p>
      )}
    </div>
  );
}
