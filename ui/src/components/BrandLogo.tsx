import Image from "next/image";

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
        "inline-flex select-none items-center font-semibold tracking-tight",
        mark ? "justify-center text-sm" : "gap-2 text-base",
        inverse ? "text-white" : "text-foreground",
        className,
      )}
      aria-label={APP_NAME}
    >
      <Image
        src="/elphie.png"
        alt=""
        width={512}
        height={512}
        className={cn("shrink-0 object-contain", mark ? "size-6" : "size-10")}
      />
      {!mark && <span>{APP_NAME}</span>}
    </span>
  );
}
