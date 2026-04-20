
## Pricer d'options — Application web interactive

Web app multi-produits pour pricer des **options vanilles** et **exotiques**, avec grecques et graphiques de payoff. Calculs 100% en JavaScript, à la volée, sans persistance.

### Structure des pages (routes séparées)

- **`/` — Accueil** : présentation de l'outil, cartes d'accès rapide vers chaque famille de produit, derniers pricings de la session.
- **`/vanilla` — Options vanilles** : pricing par formules fermées (Black-Scholes / Black-76).
- **`/exotic` — Options exotiques** : pricing par Monte Carlo (barrières, asiatiques, digitales, lookback).
- **`/about` — Méthodologie** : explications des modèles, hypothèses, conventions.

### Page Vanilles `/vanilla`

Formulaire d'inputs : type (Call/Put), spot S, strike K, maturité T (en années), taux r, dividende q, volatilité σ.

Sortie en temps réel :
- Prime (Black-Scholes)
- Grecques : Delta, Gamma, Vega, Theta, Rho
- Graphique payoff à maturité (Recharts) avec spot courant matérialisé
- Graphique P&L à différentes dates (T, T/2, 0)

### Page Exotiques `/exotic`

Sélecteur de type d'option :
- **Barrière** (Up/Down × In/Out, Call/Put)
- **Asiatique** (moyenne arithmétique/géométrique)
- **Digitale** (cash-or-nothing, asset-or-nothing)
- **Lookback** (fixed/floating strike)

Inputs communs + paramètres spécifiques (barrière, nb d'observations…).
Paramètres Monte Carlo : nb de simulations, nb de pas, seed optionnelle, antithétique on/off.

Sortie :
- Prime + intervalle de confiance 95%
- Grecques par bumping (Delta, Gamma, Vega, Theta, Rho)
- Graphique payoff à maturité
- Échantillon de trajectoires simulées (10–20 paths affichés)

### Intégration de votre code VBA

Vous collerez vos modules VBA dans le chat. Pour chaque module :
1. Je lis et identifie les fonctions (formules de pricing, helpers stats, conventions de calcul).
2. Je porte fidèlement la logique en TypeScript dans `src/lib/pricing/` (un fichier par modèle : `blackScholes.ts`, `monteCarlo.ts`, `barrier.ts`, `asian.ts`, etc.).
3. Je conserve vos conventions (signe des grecques, base de jours, formules exactes).

### UX & design

- Layout deux colonnes desktop : formulaire d'inputs (sticky) à gauche, résultats + graphiques à droite.
- Stack responsive sur mobile.
- Header avec navigation entre routes (`Vanilles`, `Exotiques`, `Méthodologie`).
- Composants shadcn/ui (Card, Input, Select, Tabs, Slider) pour une interface sobre et professionnelle.
- Recharts pour tous les graphiques.
- Recalcul automatique débounced à chaque changement d'input.

### Hors-scope (à demander si besoin)

- Sauvegarde / historique / login
- Calibration de volatilité, smile/surface
- Produits structurés (autocalls), taux, obligations
- Export Excel/CSV
