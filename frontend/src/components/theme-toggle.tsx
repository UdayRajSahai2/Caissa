"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";
import styles from "./theme-toggle.module.css";

const options: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setTheme(stored);
    }
  }, []);

  function choose(next: ThemeChoice) {
    setTheme(next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.setItem(THEME_STORAGE_KEY, "system");
      return;
    }
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((option) => option.value === theme);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = options[(current + delta + options.length) % options.length];
      choose(next.value);
    }
  }

  return (
    <div role="radiogroup" aria-label="Color theme" className={styles.group} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const Icon = option.Icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            aria-label={option.label}
            className={styles.option}
            onClick={() => choose(option.value)}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.label}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
