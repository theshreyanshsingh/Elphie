"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: "ghost" | "outline" | "default";
  size?: "default" | "sm" | "lg" | "icon";
}

export default function ThemeToggle({
  className,
  showLabel = false,
  variant = "ghost",
  size = "icon"
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  // Avoid hydration mismatch for the visible icon/label.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        showLabel && "w-full justify-start",
        className
      )}
      onClick={toggleTheme}
    >
      <Sun className={cn(
        "h-4 w-4 transition-all",
        isDark ? "-rotate-90 scale-0" : "rotate-0 scale-100",
        showLabel && "absolute"
      )} />
      <Moon className={cn(
        "h-4 w-4 transition-all",
        isDark ? "rotate-0 scale-100" : "rotate-90 scale-0",
        !showLabel && "absolute"
      )} />
      {showLabel && mounted && (
        <span className="ml-2">{isDark ? "Dark" : "Light"} Mode</span>
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
