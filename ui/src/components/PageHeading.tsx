import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Elphie Paper page title — compact `text-sm` (not Dograh-scale text-2xl/3xl).
 * Trailing `text-sm` wins over any larger size passed via className.
 */
export function PageHeading({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        "relative isolate w-fit font-semibold leading-tight",
        className,
        "text-sm",
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0.5 z-0 h-1.5 bg-emerald-300/70 dark:bg-emerald-400/45"
      />
      <span className="relative z-10">{children}</span>
    </h1>
  );
}
