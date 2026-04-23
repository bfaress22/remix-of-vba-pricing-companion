# Quant Pricer

> Pricer d'options analytique aligné sur les standards Bloomberg OVME — formules fermées exactes, grecques analytiques, Monte Carlo de référence. Construit avec TanStack Start, React 19 et Tailwind v4.

<p align="center">
  <a href="#-fonctionnalités">Fonctionnalités</a> ·
  <a href="#-modèles-de-pricing">Modèles</a> ·
  <a href="#-démarrage-rapide">Démarrage</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-validation-numérique">Validation</a> ·
  <a href="#-bibliographie">Bibliographie</a>
</p>

---

## 📖 Présentation

**Quant Pricer** est un moteur de pricing d'options vanilles et exotiques entièrement côté navigateur. Il implémente, sans aucune simplification ni simulation cachée, les mêmes formules analytiques de référence que celles utilisées par les desks de trading et par le moteur **Bloomberg OVME** (Option Valuation — Multi-asset Equity).

L'objectif du projet est triple :

1. **Pédagogique** — exposer les formules originales (Black-Scholes-Merton, Reiner-Rubinstein, Levy, Goldman-Sosin-Gatto, Broadie-Glasserman-Kou…) avec leurs hypothèses et leurs limites.
2. **Opérationnel** — fournir un outil léger, déterministe et auditable pour valoriser et hedger un portefeuille d'options européennes et exotiques.
3. **Reproductible** — chaque résultat est accompagné de sa formule, de sa référence académique, et d'un test de cohérence interne (parité In/Out, parité put/call, parité asset/cash, etc.).

L'application offre également un **thème Bloomberg Terminal** (fond noir, ambre, monospace) pour les utilisateurs habitués à ce confort visuel.

---

## ✨ Fonctionnalités

### Pricing

- **Vanilles européennes** — Call/Put avec dividende continu, prix et grecques analytiques exactes.
- **Barrières** — 8 combinaisons (Call/Put × Up/Down × In/Out), monitoring continu **Reiner-Rubinstein** ou monitoring discret avec correction de continuité **Broadie-Glasserman-Kou (1997)**.
- **Asiatiques**
  - Moyenne géométrique → **Kemna-Vorst (1990)**, formule fermée *exacte*.
  - Moyenne arithmétique → **Levy (1992)**, moment-matching log-normal sur les deux premiers moments exacts.
- **Digitales** (binaires) — Cash-or-Nothing et Asset-or-Nothing, identité de réplication vérifiée.
- **Lookback continu** — **Goldman-Sosin-Gatto (1979)** strike flottant, **Conze-Viswanathan (1991)** strike fixe avec extrema réalisés (*S*ₘᵢₙ / *S*ₘₐₓ).
- **Monte Carlo** (optionnel) — schéma exact log-normal, Mulberry32 + Box-Muller, antithétiques, IC 95% par TCL, grecques par CRN bumping.

### Grecques

- **Vanilles** : Δ, Γ, ν, Θ, ρ — formes fermées analytiques.
- **Exotiques** : différences finies centrées sur la fonction de prix fermée, pas adaptés à la double précision IEEE-754.
- **Visualisation** : tous les grecs tracés sur un seul graphe en fonction du sous-jacent.

### UX

- Interface réactive (TanStack Router file-based, React 19, Suspense-ready).
- Graphes de payoff (à maturité) pour chaque produit (sauf path-dependent où le payoff dépend du chemin).
- Page **Méthodologie** avec toutes les équations LaTeX-like, hypothèses et bibliographie.
- Thèmes **clair / sombre / Bloomberg Terminal**.
- 100% client-side : aucun appel réseau, aucun tracking, déployable en statique ou edge.

---

## 🧮 Modèles de pricing

| Produit | Modèle | Référence | Type |
|---|---|---|---|
| Vanille EU | Black-Scholes-Merton (1973) | J. Polit. Economy 81 / Bell J. Econ. 4 | Fermée exacte |
| Barrière continue | Reiner-Rubinstein (1991) | Risk 4(8) | Fermée exacte |
| Barrière discrète | Broadie-Glasserman-Kou (1997) | Math. Finance 7(4) | Correction de continuité |
| Asian géométrique | Kemna-Vorst (1990) | J. Banking Finance 14(1) | Fermée exacte |
| Asian arithmétique | Levy (1992) | J. Int. Money Finance 11(5) | Approximation log-normale |
| Digitale | Reiner-Rubinstein (1991) | Risk 4(9) | Fermée exacte |
| Lookback flottant | Goldman-Sosin-Gatto (1979) | J. Finance 34(5) | Fermée exacte |
| Lookback fixe | Conze-Viswanathan (1991) | J. Finance 46(5) | Fermée exacte (avec extrema) |
| N(·) | Cody (1969) erfc | Math. Comp. 23 | ~10⁻¹⁵ |

Toutes les formules sont implémentées dans `src/lib/pricing/` :

```
src/lib/pricing/
├── blackScholes.ts        # BSM vanille + grecques analytiques
├── exoticClosedForm.ts    # Reiner-Rubinstein, Levy, Kemna-Vorst, GSG, BGK
├── monteCarlo.ts          # MC déterministe (seedé)
└── stats.ts               # erf/erfc Cody, normCdf, normPdf
```

---

## 🚀 Démarrage rapide

### Prérequis

- [Bun](https://bun.sh/) ≥ 1.1 (recommandé) ou Node.js ≥ 20

### Installation

```bash
bun install
```

### Développement

```bash
bun run dev          # http://localhost:8080
```

### Build de production

```bash
bun run build        # bundle Vite + TanStack Start
bun run preview      # serve le build local
```

### Qualité de code

```bash
bun run lint         # ESLint flat config
bun run format       # Prettier
```

---

## 🏛 Architecture

### Stack

- **Framework** : [TanStack Start](https://tanstack.com/start) v1 (SSR/SSG, server functions, Vite 7).
- **UI** : React 19, Radix UI primitives, [shadcn/ui](https://ui.shadcn.com/) custom.
- **Styling** : Tailwind CSS v4 (CSS-first via `@import` + design tokens en `oklch`).
- **Routing** : file-based, type-safe (`src/routes/`).
- **Charts** : Recharts.
- **Validation** : Zod.
- **Cible déploiement** : Cloudflare Workers (Edge) via `@cloudflare/vite-plugin`.

### Arborescence

```
src/
├── routes/                # Routing file-based (TanStack)
│   ├── __root.tsx         # Shell HTML, providers
│   ├── index.tsx          # Landing
│   ├── vanilla.tsx        # Pricer vanille
│   ├── exotic.tsx         # Pricer exotiques (barrière, asian, digital, lookback)
│   └── about.tsx          # Méthodologie complète
├── lib/pricing/           # Cœur quant (TypeScript pur, sans dépendance)
├── components/
│   ├── GreeksChart.tsx    # Tous les grecs sur un seul graphe
│   ├── GreeksGrid.tsx     # Affichage tabulaire
│   ├── Header.tsx         # Nav + toggle thème Bloomberg
│   ├── NumberField.tsx    # Input numérique sécurisé
│   └── ui/                # shadcn primitives
├── styles.css             # Design tokens (light / dark / .bloomberg)
└── router.tsx             # Bootstrap router
```

### Design system

Aucune couleur en dur dans les composants. Tous les tokens sont définis dans `src/styles.css` au format `oklch`, déclinés sur 3 thèmes :

- `:root` — clair
- `.dark` — sombre
- `.bloomberg` — fond noir profond, ambre `oklch(0.85 0.17 70)`, police `ui-monospace`

---

## ✅ Validation numérique

Chaque modèle est validé contre une identité ou un benchmark indépendant :

| Test | Identité | Tolérance |
|---|---|---|
| Put-Call parité | C − P = S·e⁻ᵍᵀ − K·e⁻ʳᵀ | 10⁻¹⁴ |
| Barrière In + Out | Σ = Vanille | 10⁻¹⁶ |
| Digitales | Asset − K·Cash(Q=1) = Vanille | 10⁻⁴ |
| Asian Levy | vs Monte Carlo (10⁶ chemins, antithétiques) | < 0.5% pour σ ≤ 30%, T ≤ 2 |
| Grecques vanilles | analytique vs FD | < 10⁻⁶ |
| N(·) Cody | vs `scipy.stats.norm.cdf` | < 10⁻¹⁵ |

Pour les barrières et lookbacks, le Monte Carlo sous-échantillonne le franchissement (biais > 0 pour KO, < 0 pour KI / lookback) — préférer systématiquement les formules fermées.

---

## 📐 Conventions

- Taux `r` et dividende `q` : composés **continus**, base annuelle.
- Maturité `T` en années (ACT/365).
- Volatilité `σ` annualisée.
- **Vega** : ∂V/∂σ pour Δσ = 1.00 (multiplier par 0.01 pour "par 1%").
- **Theta** : −∂V/∂T annuel (diviser par 365 pour "par jour").
- **Rho** : ∂V/∂r pour Δr = 1.00.
- Barrière : monitoring continu par défaut, sinon nombre d'observations `m` explicite.
- Lookback : extrema réalisés modifiables ; sinon m = M = S₀ à l'émission.

---

## 🧪 Périmètre — ce que le projet **ne fait pas**

Pour rester strictement aligné avec un cadre Black-Scholes-Merton exact :

- ❌ Pas de smile / surface de volatilité (vol constante).
- ❌ Pas de modèle stochastique de vol (Heston, SABR) ni de local vol (Dupire).
- ❌ Pas de taux stochastiques (Hull-White, BGM).
- ❌ Pas de sauts (Merton-jump, Kou).
- ❌ Pas de calibration sur données de marché.
- ❌ Pas de produits multi-sous-jacents (basket, spread, rainbow).
- ❌ Pas d'américaines (early exercise) — uniquement européennes.

Ces extensions sortent du périmètre "formule fermée alignée OVME standard". Une roadmap d'extensions stochastiques (Heston via FFT Carr-Madan, Dupire local-vol via PDE) est envisageable mais nécessite un changement d'architecture (calibration côté serveur).

---

## 📚 Bibliographie

- **Black F., Scholes M.** (1973). *The Pricing of Options and Corporate Liabilities*, J. Polit. Economy 81(3), 637–654.
- **Merton R.** (1973). *Theory of Rational Option Pricing*, Bell J. Econ. 4(1), 141–183.
- **Reiner E., Rubinstein M.** (1991). *Breaking down the barriers*, Risk 4(8), 28–35.
- **Reiner E., Rubinstein M.** (1991). *Unscrambling the binary code*, Risk 4(9), 75–83.
- **Broadie M., Glasserman P., Kou S.** (1997). *A continuity correction for discrete barrier options*, Math. Finance 7(4), 325–349.
- **Kemna A.G.Z., Vorst A.C.F.** (1990). *A pricing method for options based on average asset values*, J. Banking Finance 14(1), 113–129.
- **Levy E.** (1992). *Pricing European average rate currency options*, J. Int. Money Finance 11(5), 474–491.
- **Goldman M.B., Sosin H.B., Gatto M.A.** (1979). *Path-dependent options: Buy at the low, sell at the high*, J. Finance 34(5), 1111–1127.
- **Conze A., Viswanathan R.** (1991). *Path-dependent options: The case of lookback options*, J. Finance 46(5), 1893–1907.
- **Cody W.J.** (1969). *Rational Chebyshev approximations for the error function*, Math. Comp. 23, 631–637.
- **Haug E.G.** (2007). *The Complete Guide to Option Pricing Formulas*, 2ᵉ éd., McGraw-Hill.
- **Glasserman P.** (2003). *Monte Carlo Methods in Financial Engineering*, Springer.

---

## 🤝 Contribuer

Les contributions sont bienvenues, en particulier :

- Nouveaux produits à formule fermée (chooser, compound, forward-start…).
- Cas de tests numériques additionnels (vs Bloomberg OVME, vs QuantLib).
- Améliorations UX du graphe des grecs.
- Traductions de la page Méthodologie.

Workflow standard : fork → branche → PR avec description du modèle et de sa référence académique. Toute formule ajoutée doit être accompagnée :

1. de sa **référence originale** (article, page),
2. d'un **test de cohérence** (identité ou benchmark indépendant),
3. d'une entrée correspondante dans `src/routes/about.tsx`.

---

## 📄 Licence

MIT — voir `LICENSE` (à ajouter selon le contexte de fork).

---

## ⚠️ Avertissement

Ce logiciel est fourni **à titre éducatif et de recherche**. Il ne constitue ni un conseil en investissement, ni un outil de trading certifié. Les auteurs déclinent toute responsabilité quant à l'usage des prix et grecs produits dans un contexte de marché réel. Toujours valider contre une source de référence (Bloomberg OVME, QuantLib, contrepartie) avant exécution.