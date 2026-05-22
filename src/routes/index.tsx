import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { ArrowRight, Sigma, Waves, BookOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quant Pricer — Outil de pricing d'options" },
      {
        name: "description",
        content:
          "Pricer interactif pour options vanilles (Black-Scholes) et exotiques (Monte Carlo). Grecques, payoffs et trajectoires.",
      },
      { property: "og:title", content: "Quant Pricer — Outil de pricing d'options" },
      {
        property: "og:description",
        content: "Vanilles & exotiques, grecques et graphiques de payoff.",
      },
      { property: "og:url", content: "https://pricers-pal-vba.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://pricers-pal-vba.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Quant Pricer",
          url: "https://pricers-pal-vba.lovable.app/",
          description:
            "Pricer interactif pour options vanilles (Black-Scholes) et exotiques (Monte Carlo).",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Quant Pricer",
          url: "https://pricers-pal-vba.lovable.app/",
        }),
      },
    ],
  }),
  component: HomePage,
});

const cards = [
  {
    to: "/vanilla" as const,
    icon: Sigma,
    title: "Options vanilles",
    desc: "Calls / Puts européens — formules fermées Black-Scholes-Merton avec dividende continu.",
    bullets: ["Prime exacte", "Delta, Gamma, Vega, Theta, Rho", "Payoff & P&L à différentes dates"],
  },
  {
    to: "/exotic" as const,
    icon: Waves,
    title: "Options exotiques",
    desc: "Barrières, asiatiques, digitales, lookback — pricing par Monte Carlo.",
    bullets: ["Prime + IC 95%", "Grecques par bumping", "Trajectoires simulées"],
  },
  {
    to: "/about" as const,
    icon: BookOpen,
    title: "Méthodologie",
    desc: "Modèles, hypothèses, conventions de calcul et formules utilisées.",
    bullets: ["GBM risque-neutre", "Discrétisation log-Euler", "Conventions des grecques"],
  },
];

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <section className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Pricing à la volée — aucune donnée stockée
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Pricer d'options interactif
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Calculs de primes, grecques et payoffs pour options vanilles et exotiques —
            directement dans le navigateur.
          </p>
        </section>

        <section className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.to} to={c.to} className="group">
                <Card className="h-full p-6 transition-all hover:border-primary/50 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                  <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                    {c.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Link>
            );
          })}
        </section>
      </main>
    </div>
  );
}
