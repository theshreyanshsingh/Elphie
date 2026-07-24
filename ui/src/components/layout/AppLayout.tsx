"use client";

import { AlertTriangle, Menu, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { APP_NAME } from "@/constants/branding";
import { useAppConfig } from "@/context/AppConfigContext";
import { LeadFormsProvider } from "@/context/LeadFormsContext";

import { AppSidebar } from "./AppSidebar";

function AppHeader() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-50 flex shrink-0 items-center justify-between bg-paper-bg px-4 py-3 sm:px-6 md:hidden lg:px-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open menu" className="md:hidden">
          <Menu className="h-4 w-4" />
        </Button>
        <Link href="/" className="text-xs font-semibold md:hidden">{APP_NAME}</Link>
      </div>
    </header>
  );
}

function BackendStatusBanner() {
  const { config, loading, refresh } = useAppConfig();

  if (!config || config.backendStatus === "reachable") {
    return null;
  }

  const backendUrl = config.backendUrl && config.backendUrl !== "unknown"
    ? config.backendUrl
    : "the configured backend";
  const message = config.backendMessage || `Backend is not reachable at ${backendUrl}.`;

  return (
    <div
      role="alert"
      className="border-b border-border bg-muted px-4 py-2 text-foreground"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">Backend connection failed</p>
            <p className="break-words text-xs">{message}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );
}

interface AppLayoutProps {
  children: ReactNode;
  headerActions?: ReactNode;
  stickyTabs?: ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  headerActions,
  stickyTabs,
}) => {
  const pathname = usePathname();

  const shouldShowSidebar = pathname !== "/" && !pathname.startsWith("/handler") && !pathname.startsWith("/auth");
  const isWorkflowEditor = /^\/workflow\/\d+$/.test(pathname);
  const isFullBleedContent = isWorkflowEditor;

  return (
    <SidebarProvider defaultOpen>
      {shouldShowSidebar ? (
        <LeadFormsProvider>
          <div className="flex h-dvh min-h-0 w-full bg-paper-bg text-foreground">
            <AppSidebar />
            <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-paper-bg">
              <BackendStatusBanner />
              {!isWorkflowEditor && <AppHeader />}
              {headerActions && (
                <header className="relative z-20 shrink-0 overflow-visible bg-paper-bg px-4 py-3 sm:px-6 lg:px-8">
                  <div className="flex items-center justify-center">
                    {headerActions}
                  </div>
                </header>
              )}

              {stickyTabs && (
                <div className="sticky top-0 z-40 shrink-0 bg-paper-bg px-4 sm:px-6 lg:px-8">
                  <div className="flex items-center justify-center py-2">
                    {stickyTabs}
                  </div>
                </div>
              )}

              <div
                className={
                  isFullBleedContent
                    ? "app-content-area app-content-area--full-bleed flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                    : "app-content-area app-content-area--scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
                }
              >
                {children}
              </div>
            </SidebarInset>
          </div>
        </LeadFormsProvider>
      ) : (
        <div className="app-surface flex min-h-dvh w-full flex-1 flex-col">
          <BackendStatusBanner />
          {children}
        </div>
      )}
    </SidebarProvider>
  );
};

export default AppLayout;
