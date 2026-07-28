// Shared auth shell for Stack Auth (/handler/[...stack]) and local/OSS auth
// pages (/auth/login, /auth/signup).

import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-imprint flex min-h-screen w-full items-center justify-center overflow-y-auto bg-background p-6 sm:p-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="relative isolate px-2 pb-1">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-1 z-0 h-3 bg-emerald-300/70 dark:bg-emerald-400/45"
            />
            <BrandLogo className="relative z-10 text-4xl font-bold leading-none" />
          </div>
        </div>
        <div className="space-y-6 rounded-md border border-border bg-card p-6 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
