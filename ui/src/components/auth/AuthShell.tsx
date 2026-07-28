// Shared auth shell for Stack Auth (/handler/[...stack]) and local/OSS auth
// pages (/auth/login, /auth/signup).

import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-imprint flex min-h-screen w-full items-center justify-center overflow-y-auto bg-background p-6 sm:p-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="text-base" />
        </div>
        <div className="space-y-6 rounded-md border border-border bg-card p-6 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
