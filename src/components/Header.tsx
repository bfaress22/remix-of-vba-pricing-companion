import { Link } from "@tanstack/react-router";
import { LineChart, Terminal } from "lucide-react";
import { useEffect, useState } from "react";

export function Header() {
  const [bloomberg, setBloomberg] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (saved === "bloomberg") {
      document.documentElement.classList.add("bloomberg");
      setBloomberg(true);
    }
  }, []);

  const toggle = () => {
    const next = !bloomberg;
    setBloomberg(next);
    document.documentElement.classList.toggle("bloomberg", next);
    try {
      localStorage.setItem("theme", next ? "bloomberg" : "default");
    } catch {
      // ignore
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LineChart className="h-5 w-5 text-primary" />
          <span>Quant Pricer</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Accueil
          </Link>
          <Link
            to="/vanilla"
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Vanilles
          </Link>
          <Link
            to="/exotic"
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Exotiques
          </Link>
          <Link
            to="/about"
            activeProps={{ className: "bg-accent text-accent-foreground" }}
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Méthodologie
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={bloomberg}
            title={bloomberg ? "Désactiver le thème Bloomberg" : "Activer le thème Bloomberg"}
            className={`ml-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs uppercase tracking-wide transition-colors ${
              bloomberg
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Bloomberg</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
