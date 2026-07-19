import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

export type AtlasTheme = "light" | "dark";
const STORAGE_KEY = "atlas-theme";

interface AtlasThemeContextValue {
  theme: AtlasTheme;
  setTheme: (theme: AtlasTheme) => void;
  toggleTheme: () => void;
}

const AtlasThemeContext = createContext<AtlasThemeContextValue | null>(null);

function initialTheme(): AtlasTheme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function AtlasThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AtlasTheme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<AtlasThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark"),
  }), [theme]);

  return <AtlasThemeContext.Provider value={value}>{children}</AtlasThemeContext.Provider>;
}

export function useAtlasTheme(): AtlasThemeContextValue {
  const value = useContext(AtlasThemeContext);
  if (!value) throw new Error("Atlas theme context is unavailable");
  return value;
}

export function AtlasThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useAtlasTheme();
  const next = theme === "dark" ? "light" : "dark";
  return <button
    type="button"
    className={`atlas-theme-toggle ${className}`.trim()}
    onClick={toggleTheme}
    aria-label={`Switch to ${next} mode`}
    title={`Switch to ${next} mode`}
    data-theme-current={theme}
  >
    {theme === "dark" ? <Sun /> : <Moon />}
    <span className="atlas-rail-label">{next === "light" ? "Light mode" : "Dark mode"}</span>
  </button>;
}
