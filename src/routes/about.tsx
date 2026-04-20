import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "Méthodologie | Quant Pricer" },
      {
        name: "description",
        content:
          "Modèles, hypothèses et conventions utilisés pour le pricing : Black-Scholes-Merton et Monte Carlo sous GBM.",
      },
      { property: "og:title", content: "Méthodologie — Quant Pricer" },
      { property: "og:description", content: "Modèles, hypothèses, formules." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Méthodologie</h1>
        <p className="mt-2 text-muted-foreground">
          Détail des modèles, hypothèses et conventions utilisées par le pricer.
        </p>

        <div className="mt-8 space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Black-Scholes-Merton</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pricing en forme fermée des options européennes vanilles sur sous-jacent
              versant un dividende continu de taux <em>q</em>.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`d1 = [ln(S/K) + (r − q + σ²/2) T] / (σ √T)
d2 = d1 − σ √T
Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)`}
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Grecques exactes : Delta, Gamma, Vega (par 1.00 σ), Theta (annualisé), Rho.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Monte Carlo (exotiques)</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Dynamique GBM risque-neutre, schéma exact par log-Euler :
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`S_{t+Δt} = S_t · exp[(r − q − σ²/2)·Δt + σ·√Δt·Z],  Z ~ N(0,1)`}
            </pre>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>• PRNG déterministe (Mulberry32) avec seed contrôlable.</li>
              <li>• Variates normales par Box-Muller.</li>
              <li>• Réduction de variance optionnelle par variables antithétiques.</li>
              <li>• Intervalle de confiance 95% via erreur standard de la moyenne.</li>
              <li>• Grecques par bumping symétrique, mêmes nombres aléatoires (variance commune).</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Payoffs supportés</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• <strong>Barrière</strong> : Up/Down × In/Out, surveillance discrète sur les pas.</li>
              <li>• <strong>Asiatique</strong> : moyenne arithmétique ou géométrique sur les pas.</li>
              <li>• <strong>Digitale</strong> : cash-or-nothing ou asset-or-nothing à maturité.</li>
              <li>• <strong>Lookback</strong> : strike fixe (max/min vs K) ou flottant (S_T vs min/max).</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Conventions</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• Taux <em>r</em> et dividende <em>q</em> en composé continu, base annuelle.</li>
              <li>• Maturité <em>T</em> en années (ACT/365 supposée).</li>
              <li>• Vega exprimé pour une variation de 1.00 de σ (multiplier par 0.01 pour « per vol point »).</li>
              <li>• Theta exprimé en variation annuelle de la valeur (∂V/∂T).</li>
              <li>• Rho exprimé pour une variation de 1.00 de r.</li>
            </ul>
          </Card>

          <Card className="border-dashed p-6">
            <h2 className="text-lg font-semibold">Intégration de votre code VBA</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cette base sera enrichie au fur et à mesure que vous collerez vos modules VBA.
              Les fonctions seront portées en TypeScript dans <code>src/lib/pricing/</code>
              en respectant vos formules et conventions exactes.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
