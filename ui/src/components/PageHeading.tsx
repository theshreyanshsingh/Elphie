import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function PageHeading({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn(
        "relative isolate w-fit text-3xl font-bold leading-tight",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0.5 z-0 h-2 bg-emerald-300/70 dark:bg-emerald-400/45"
      />
      <span className="relative z-10">{children}</span>
    </h1>
  );
}
