// Shared two-column auth shell for Stack Auth (/handler/[...stack]) and local/OSS
// auth pages (/auth/login, /auth/signup).

import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { APP_NAME } from "@/constants/branding";

const HIGHLIGHTS = [
  "Speech-to-speech",
  "MCP-native",
  "BYOK - any model",
];

export function AuthShell({
  children,
  enterpriseSlot,
}: {
  children: ReactNode;
  enterpriseSlot?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[55%_45%]">
      <main className="auth-imprint flex min-h-screen flex-col overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md space-y-6 rounded-md border border-border bg-card p-6 sm:p-8">
            <div className="lg:hidden">
              <BrandLogo className="text-base" />
            </div>
            {children}
          </div>
        </div>
      </main>

      <aside className="relative hidden flex-col justify-between border-l border-border bg-black p-10 text-white lg:flex xl:p-14">
        <div className="relative">
          <BrandLogo inverse className="text-base" />
        </div>

        <div className="relative max-w-md space-y-5">
          <h1 className="text-xl font-semibold leading-tight tracking-tight xl:text-2xl">
            Voice AI platform by {APP_NAME}.
          </h1>
          <ul className="flex flex-wrap gap-2">
            {HIGHLIGHTS.map((point) => (
              <li
                key={point}
                className="rounded-md border border-white/20 px-2 py-1 text-xs font-medium text-white/80"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>

        {enterpriseSlot && (
          <div className="relative mb-12 max-w-md space-y-3 rounded-md border border-white/20 p-5 xl:mb-16">
            {enterpriseSlot}
          </div>
        )}
      </aside>
    </div>
  );
}
