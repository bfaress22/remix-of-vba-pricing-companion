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
          "Formules de pricing : Black-Scholes-Merton, Reiner-Rubinstein, Broadie-Glasserman-Kou, Kemna-Vorst, Levy, Goldman-Sosin-Gatto. Mêmes références que Bloomberg OVME.",
      },
      { property: "og:title", content: "Méthodologie — Quant Pricer" },
      { property: "og:description", content: "Modèles analytiques alignés sur Bloomberg OVME." },
      { property: "og:url", content: "https://pricers-pal-vba.lovable.app/about" },
      { property: "og:type", content: "article" },
    ],
    links: [
      { rel: "canonical", href: "https://pricers-pal-vba.lovable.app/about" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "Quant Pricer — Méthodologie",
          description:
            "Formules de pricing : Black-Scholes-Merton, Reiner-Rubinstein, Broadie-Glasserman-Kou, Kemna-Vorst, Levy, Goldman-Sosin-Gatto.",
          url: "https://pricers-pal-vba.lovable.app/about",
          inLanguage: "fr",
        }),
      },
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
          Toutes les formules fermées utilisées sont les mêmes que celles du moteur
          analytique de Bloomberg OVME. Les références bibliographiques originales
          sont citées pour chaque produit. Aucune simplification, aucun lissage.
        </p>

        <div className="mt-8 space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">1. Cadre commun — Black-Scholes-Merton</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sous-jacent suivant un GBM risque-neutre avec dividende continu&nbsp;:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`dS_t = (r − q) S_t dt + σ S_t dW_t          (Q-mesure)
log S_T ~ N(log S_0 + (r − q − σ²/2)T, σ²T)`}
            </pre>
            <p className="mt-3 text-sm">
              <strong>Hypothèses</strong>&nbsp;: vol constante, taux et dividende constants,
              pas de friction, marché complet. Tout résultat ci-dessous est exact dans
              ce cadre — toute déviation (smile, sauts, taux stochastiques) sort du périmètre.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              N(·) calculé par approximation Cody (1969) erfc, précision ~10⁻¹⁵.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Réf.</strong> Black F., Scholes M. (1973), J. Polit. Economy 81&nbsp;;
              Merton R. (1973), Bell J. Econ. 4.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">2. Vanilles européennes</h2>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`d1 = [ln(S/K) + (r − q + σ²/2) T] / (σ √T)
d2 = d1 − σ √T
Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)`}
            </pre>
            <p className="mt-3 text-sm">
              Grecques&nbsp;: <em>analytiques exactes</em> (Delta, Gamma, Vega, Theta, Rho)
              dérivées de la fonction de prix. Conventions&nbsp;: Vega par σ=1.00,
              Theta par année, Rho par r=1.00.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">3. Barrières — Reiner-Rubinstein</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Monitoring continu, formules ferméés exactes pour les 8 combinaisons
              (call/put × Up/Down × In/Out) avec rebate&nbsp;= 0.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`μ = (r − q − σ²/2)/σ²
λ = √(μ² + 2r/σ²)
x1 = ln(S/K)/(σ√T) + (1+μ)σ√T
x2 = ln(S/B)/(σ√T) + (1+μ)σ√T
y1 = ln(B²/(SK))/(σ√T) + (1+μ)σ√T
y2 = ln(B/S)/(σ√T) + (1+μ)σ√T

A,B,C,D = combinaisons de S·e^(−qT)·N(±x_i) et K·e^(−rT)·N(±x_i ∓ σ√T)
         multipliées par (B/S)^(2(μ+1)) ou (B/S)^(2μ) pour C,D.

Prix selon kind ∈ {DI,UI,DO,UO} et K vs B :
  DIC, K>B : C            DIC, K<B : A − B + D
  DOC, K>B : A − C        DOC, K<B : B − D
  ...      (voir Haug 4.17 pour la table complète)`}
            </pre>
            <p className="mt-2 text-sm">
              <strong>Vérification implémentée</strong>&nbsp;: la parité In + Out = Vanille
              est exacte à 10⁻¹⁶ près (test interne).
            </p>
            <p className="mt-3 text-sm">
              <strong>Monitoring discret (option)</strong>&nbsp;: correction de continuité
              de Broadie-Glasserman-Kou (1997). On remplace B par&nbsp;:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`B_eff = B · exp(±β · σ · √(T/m)),    β = −ζ(½)/√(2π) ≈ 0.5826

  +β  pour barrière haute  (Up)
  −β  pour barrière basse  (Down)
  m   = nombre d'observations (52 hebdo, 252 quotidiennes…)`}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Réf.</strong> Reiner E., Rubinstein M. (1991) Risk 4(8)&nbsp;;
              Broadie M., Glasserman P., Kou S. (1997), Math. Finance 7(4)&nbsp;;
              Haug E.&nbsp;G. (2007), <em>Complete Guide to Option Pricing Formulas</em>, 2ᵉ éd., §4.17.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">4. Asiatiques</h2>
            <p className="mt-2 text-sm">
              <strong>Moyenne géométrique</strong>&nbsp;— Kemna-Vorst (1990), exact&nbsp;:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`σ_G = σ/√3
b_G = (r − q − σ²/6)/2
Prix = BS(S, K, T, r, q* = r − b_G, σ_G)`}
            </pre>
            <p className="mt-3 text-sm">
              <strong>Moyenne arithmétique</strong>&nbsp;— Levy (1992), moment-matching log-normal.
              Pas de forme exacte (somme de variables lognormales)&nbsp;; Levy fait correspondre
              les <em>deux premiers moments exacts</em> de A = (1/T)∫₀ᵀ S_u du à une lognormale&nbsp;:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`b = r − q
M1 = E[A]  = S · (e^{bT} − 1) / (bT)
M2 = E[A²] = (2S² / (b+σ²)T²) · [(e^{(2b+σ²)T} − 1)/(2b+σ²) − (e^{bT} − 1)/b]
V  = ln(M2) − 2 ln(M1)
d1 = (ln(M1/K) + V/2)/√V,    d2 = d1 − √V
Call = e^{−rT} (M1 N(d1) − K N(d2))`}
            </pre>
            <p className="mt-2 text-sm text-muted-foreground">
              Précision typique&nbsp;: erreur &lt; 0.5% vs MC pour σ ≤ 30%, T ≤ 2 ans.
              C'est l'approximation de référence dans Bloomberg OVME pour les Asian arithmétiques.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Réf.</strong> Kemna A.&nbsp;G.&nbsp;Z., Vorst A.&nbsp;C.&nbsp;F. (1990), J. Banking Finance 14(1)&nbsp;;
              Levy E. (1992), J. Int. Money Finance 11.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">5. Digitales (binaires)</h2>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`Cash-or-Nothing call  = Q · e^{−rT} · N(d2)
Cash-or-Nothing put   = Q · e^{−rT} · N(−d2)
Asset-or-Nothing call = S · e^{−qT} · N(d1)
Asset-or-Nothing put  = S · e^{−qT} · N(−d1)

Identité : Asset − K · Cash(Q=1) = Vanille (vérifié à 10⁻⁴)`}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Réf.</strong> Reiner E., Rubinstein M. (1991), "Unscrambling the binary code", Risk 4(9).
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">6. Lookback continu — Goldman-Sosin-Gatto</h2>
            <p className="mt-2 text-sm">
              <strong>Strike flottant</strong>&nbsp;: payoff (S_T − m) call, (M − S_T) put, où m, M
              sont les extrema réalisés. Si l'option vient d'être émise, m = M = S₀.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`b = r − q,    a1 = (ln(S/M) + (b+σ²/2)T)/(σ√T),   a2 = a1 − σ√T

Call = S e^{−qT} N(a1) − M e^{−rT} N(a2)
     + S e^{−rT} (σ²/2b) [(S/M)^{−2b/σ²} N(−a1 + 2b√T/σ) − e^{bT} N(−a1)]`}
            </pre>
            <p className="mt-3 text-sm">
              <strong>Strike fixe</strong>&nbsp;: payoff (M − K)⁺ call, (K − m)⁺ put. Conze-Viswanathan (1991)
              étend GSG en intégrant le max/min réalisé.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Réf.</strong> Goldman M.&nbsp;B., Sosin H.&nbsp;B., Gatto M.&nbsp;A. (1979), J. Finance 34(5)&nbsp;;
              Conze A., Viswanathan R. (1991), J. Finance 46(5).
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">7. Grecques exotiques</h2>
            <p className="mt-2 text-sm">
              Différences finies centrées sur la fonction de prix ferméée&nbsp;:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`Delta = (P(S+h) − P(S−h)) / (2h),     h = 0.001·S
Gamma = (P(S+h) − 2P(S) + P(S−h)) / h²
Vega  = (P(σ+ε) − P(σ−ε)) / (2ε),     ε = 1e−4
Rho   = (P(r+ε) − P(r−ε)) / (2ε),     ε = 1e−5
Theta = −(P(T) − P(T−Δt)) / Δt,        Δt = min(T·0.001, 1/365)`}
            </pre>
            <p className="mt-2 text-sm text-muted-foreground">
              Pas optimisés pour la double précision. Grecques analytiques pour les vanilles.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">8. Monte Carlo (méthode alternative)</h2>
            <p className="mt-2 text-sm">
              Disponible en option pour comparaison. Schéma exact (pas d'erreur de discrétisation)&nbsp;:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`S_{t+Δt} = S_t · exp[(r − q − σ²/2)·Δt + σ·√Δt·Z],   Z ~ N(0,1)`}
            </pre>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>• PRNG Mulberry32 (déterministe, seed contrôlable).</li>
              <li>• Box-Muller pour les variates normales.</li>
              <li>• Variables antithétiques pour réduction de variance.</li>
              <li>• IC 95% par erreur standard de la moyenne (TCL).</li>
              <li>• Grecques par bumping symétrique, seed commun (CRN).</li>
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              Note&nbsp;: pour les barrières et lookback, MC sous-échantillonne le franchissement
              (biais &gt;0 pour KO, &lt;0 pour KI et lookback). Préférer les formules ferméées.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">9. Conventions communes</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• r, q&nbsp;: composés continus, base annuelle.</li>
              <li>• T en années (ACT/365).</li>
              <li>• σ annualisée.</li>
              <li>• Vega&nbsp;: ∂V/∂σ pour Δσ = 1.00.</li>
              <li>• Theta&nbsp;: −∂V/∂T (annuel).</li>
              <li>• Rho&nbsp;: ∂V/∂r pour Δr = 1.00.</li>
              <li>• Pour barrière&nbsp;: monitoring continu sauf paramétrage discret explicite.</li>
              <li>• Pour lookback&nbsp;: extrema réalisés modifiables&nbsp;; sinon m = M = S₀.</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Bibliographie</h2>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Black F., Scholes M. (1973). <em>The Pricing of Options and Corporate Liabilities</em>, J. Polit. Economy 81(3), 637–654.</li>
              <li>• Merton R. (1973). <em>Theory of Rational Option Pricing</em>, Bell J. Econ. 4(1), 141–183.</li>
              <li>• Reiner E., Rubinstein M. (1991). <em>Breaking down the barriers</em>, Risk 4(8), 28–35.</li>
              <li>• Reiner E., Rubinstein M. (1991). <em>Unscrambling the binary code</em>, Risk 4(9), 75–83.</li>
              <li>• Broadie M., Glasserman P., Kou S. (1997). <em>A continuity correction for discrete barrier options</em>, Math. Finance 7(4), 325–349.</li>
              <li>• Kemna A.G.Z., Vorst A.C.F. (1990). <em>A pricing method for options based on average asset values</em>, J. Banking Finance 14(1), 113–129.</li>
              <li>• Levy E. (1992). <em>Pricing European average rate currency options</em>, J. Int. Money Finance 11(5), 474–491.</li>
              <li>• Goldman M.B., Sosin H.B., Gatto M.A. (1979). <em>Path-dependent options: Buy at the low, sell at the high</em>, J. Finance 34(5), 1111–1127.</li>
              <li>• Conze A., Viswanathan R. (1991). <em>Path-dependent options: The case of lookback options</em>, J. Finance 46(5), 1893–1907.</li>
              <li>• Cody W.J. (1969). <em>Rational Chebyshev approximations for the error function</em>, Math. Comp. 23, 631–637.</li>
              <li>• Haug E.G. (2007). <em>The Complete Guide to Option Pricing Formulas</em>, 2ᵉ éd., McGraw-Hill.</li>
              <li>• Glasserman P. (2003). <em>Monte Carlo Methods in Financial Engineering</em>, Springer.</li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
