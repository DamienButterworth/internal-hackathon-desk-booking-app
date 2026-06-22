"use client";

import { Moon, Sun } from "lucide-react";

// Stateless: the `.dark` class on <html> (set before paint by the inline script
// in the root layout) is the single source of truth. Clicking flips that class
// and persists the choice; the icon shown is decided purely by CSS via the
// `dark:` variant, so there's no React state and no hydration mismatch.
export function ThemeToggle() {
  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      // ignore (private mode / storage disabled)
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface"
    >
      <Moon size={16} className="block dark:hidden" />
      <Sun size={16} className="hidden dark:block" />
    </button>
  );
}
