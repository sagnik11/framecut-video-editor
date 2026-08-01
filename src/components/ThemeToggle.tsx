import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  const saved = window.localStorage.getItem("framecut-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("framecut-theme", theme);
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="icon-button" type="button" onClick={() => setTheme(next)} aria-label={`Use ${next} theme`} title={`Use ${next} theme`}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
