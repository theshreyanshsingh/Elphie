"use client";

import { APP_NAME, APP_URL } from "@/constants/branding";

export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background px-6 py-4">
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <a
          href={`${APP_URL}/privacy-policy`}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-foreground"
        >
          Privacy Policy
        </a>
        <span className="text-border">|</span>
        <a
          href={`${APP_URL}/terms-of-service`}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-foreground"
        >
          Terms of Service
        </a>
        <span className="text-border">|</span>
        <span>{APP_NAME}</span>
      </div>
    </footer>
  );
}
