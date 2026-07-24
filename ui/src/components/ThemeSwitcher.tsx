"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  fullWidth?: boolean;
  variant?: "ghost" | "outline" | "default";
  size?: "default" | "sm" | "lg" | "icon";
}

export default function ThemeToggle({
  className,
  showLabel = false,
  fullWidth = false,
  variant = "ghost",
  size = "icon",
}: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  const resolvedVariant = fullWidth ? "outline" : variant;
  const resolvedSize = fullWidth || showLabel ? "default" : size;
  const isDark = theme === "dark";

  return (
    <Button
      variant={resolvedVariant}
      size={resolvedSize}
      className={cn(
        "cursor-pointer rounded-md px-2 py-1 text-xs",
        (fullWidth || showLabel) && "w-full justify-center gap-2",
        className,
      )}
      onClick={toggleTheme}
    >
      {isDark ? (
        <Moon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Sun className="h-3.5 w-3.5 shrink-0" />
      )}
      {(showLabel || fullWidth) && theme && (
        <span>{isDark ? "Dark mode" : "Light mode"}</span>
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
