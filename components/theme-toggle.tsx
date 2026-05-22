"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_STORAGE_KEY = "creator-content-library-theme";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function getDocumentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme | null>(null);
  const isDark = theme === "dark";
  const nextTheme: Theme = isDark ? "light" : "dark";

  React.useEffect(() => {
    setTheme(getDocumentTheme());
  }, []);

  function toggleTheme() {
    const currentTheme = theme ?? getDocumentTheme();
    const updatedTheme: Theme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(updatedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, updatedTheme);
    setTheme(updatedTheme);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      onClick={toggleTheme}
    >
      {isDark ? <Sun /> : <Moon />}
      <span className="sr-only">Switch to {nextTheme} mode</span>
    </Button>
  );
}
