import { cn } from "@/lib/utils";

export type AppPageContentWidth = "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";

const WIDTH_CLASSES: Record<AppPageContentWidth, string> = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-full",
};

/** Paper dashboard content gutter — matches desktop/paper/apps/web page wrappers. */
export const APP_PAGE_GUTTER =
  "px-4 pb-8 pt-5 sm:px-6 sm:pt-6 lg:px-8";

type AppPageContentProps = React.ComponentPropsWithoutRef<"div"> & {
  width?: AppPageContentWidth;
};

export function AppPageContent({
  children,
  className,
  width = "full",
  ...props
}: AppPageContentProps) {
  return (
    <div
      className={cn(
        "app-page-content mx-auto w-full min-w-0 bg-paper-bg text-foreground shadow-none",
        WIDTH_CLASSES[width],
        APP_PAGE_GUTTER,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
