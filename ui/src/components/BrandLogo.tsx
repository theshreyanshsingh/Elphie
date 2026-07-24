import { APP_NAME } from "@/constants/branding";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  inverse = false,
  mark = false,
}: {
  className?: string;
  inverse?: boolean;
  mark?: boolean;
}) {
  return (
    <span
      className={cn(
        "select-none font-semibold tracking-tight",
        mark ? "text-sm" : "text-base",
        inverse ? "text-white" : "text-foreground",
        className,
      )}
      aria-label={APP_NAME}
    >
      {APP_NAME}
    </span>
  );
}
