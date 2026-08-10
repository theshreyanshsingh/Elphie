"use client";

import {
  AlertTriangle,
  AudioLines,
  Brain,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  FileText,
  Home,
  Key,
  LogOut,
  type LucideIcon,
  Megaphone,
  Phone,
  Settings,
  TrendingUp,
  Workflow,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { SidebarTeamSwitcher } from "@/components/layout/SidebarTeamSwitcher";
import ThemeToggle from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppConfig } from "@/context/AppConfigContext";
import { useTelephonyConfigWarnings } from "@/context/TelephonyConfigWarningsContext";
import type { LocalUser } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { isBillingAvailable } from "@/lib/deploymentFeatures";
import { cn } from "@/lib/utils";

type SidebarNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  showsTelephonyWarning?: boolean;
};

type SidebarNavSection = {
  label?: string;
  items: SidebarNavItem[];
};

const TELEPHONY_WARNING_COPY = "Action required";

const NAV_SECTIONS: SidebarNavSection[] = [
  {
    items: [
      {
        title: "Overview",
        url: "/overview",
        icon: Home,
      },
    ],
  },
  {
    label: "BUILD",
    items: [
      {
        title: "Voice Agents",
        url: "/workflow",
        icon: Workflow,
      },
      {
        title: "Campaigns",
        url: "/campaigns",
        icon: Megaphone,
      },
      {
        title: "Models",
        url: "/model-configurations",
        icon: Brain,
      },
      {
        title: "Telephony",
        url: "/telephony-configurations",
        icon: Phone,
        showsTelephonyWarning: true,
      },
      {
        title: "Tools",
        url: "/tools",
        icon: Wrench,
      },
      {
        title: "Files",
        url: "/files",
        icon: Database,
      },
      {
        title: "Recordings",
        url: "/recordings",
        icon: AudioLines,
      },
      {
        title: "Developers",
        url: "/api-keys",
        icon: Key,
      },
    ],
  },
  {
    label: "MANAGE",
    items: [
      {
        title: "Agent Runs",
        url: "/usage",
        icon: TrendingUp,
      },
      {
        title: "Billing",
        url: "/billing",
        icon: CircleDollarSign,
      },
      {
        title: "Reports",
        url: "/reports",
        icon: FileText,
      }
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { provider, logout, user } = useAuth();
  const { config } = useAppConfig();
  const {
    telnyxMissingWebhookPublicKeyCount,
    vonageMissingSignatureSecretCount,
  } = useTelephonyConfigWarnings();
  const hasTelephonyWarning =
    telnyxMissingWebhookPublicKeyCount > 0 ||
    vonageMissingSignatureSecretCount > 0;
  const isCollapsed = !isMobile && state === "collapsed";

  const isActive = (path: string) => pathname.startsWith(path);

  const handleMobileNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const SidebarLink = ({ item }: { item: SidebarNavItem }) => {
    const isItemActive = isActive(item.url);
    const Icon = item.icon;
    const showWarningDot = item.showsTelephonyWarning && hasTelephonyWarning;
    const tooltip = {
      children: (
        <div className="notranslate" translate="no">
          <p>{item.title}</p>
          {showWarningDot && (
            <p className="text-amber-600 dark:text-amber-400">{TELEPHONY_WARNING_COPY}</p>
          )}
        </div>
      ),
    };
    const warningIndicator = (
      <AlertTriangle
        aria-label="Action required on a telephony configuration"
        className={cn(
          "text-amber-500",
          isCollapsed ? "absolute -right-0.5 -top-0.5 h-3 w-3" : "ml-auto h-3.5 w-3.5"
        )}
      />
    );

    return (
      <SidebarMenuButton
        asChild
        tooltip={tooltip}
        className={cn(
          "rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground",
          isItemActive &&
            "bg-cta/15 font-semibold text-foreground hover:bg-cta/20 hover:text-foreground"
        )}
      >
        <Link
          href={item.url}
          onClick={handleMobileNavClick}
          className={cn("relative", isCollapsed && "justify-center")}
          translate="no"
        >
          {isItemActive && !isCollapsed && (
            <span
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-cta"
              aria-hidden
            />
          )}
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isItemActive && "text-cta drop-shadow-[0_0_6px_rgba(240,170,70,0.8)]"
            )}
          />
          <span
            className={cn("notranslate min-w-0 flex-1 truncate text-xs", isCollapsed && "sr-only")}
            translate="no"
          >
            {item.title}
          </span>
          {showWarningDot && (
            isCollapsed ? (
              warningIndicator
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  {warningIndicator}
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{TELEPHONY_WARNING_COPY}</p>
                </TooltipContent>
              </Tooltip>
            )
          )}
        </Link>
      </SidebarMenuButton>
    );
  };

  // Prefer the signed-in email for the footer identity chip.
  const userEmail =
    (user as LocalUser | undefined)?.email ||
    (user as { primaryEmail?: string } | undefined)?.primaryEmail ||
    user?.displayName ||
    "";

  const userChipTrigger = (
    <Button
      variant="ghost"
      className={cn(
        "h-auto min-w-0 flex-1 cursor-pointer justify-start rounded-md px-2 py-1 text-xs font-normal",
        isCollapsed && "justify-center px-1"
      )}
      aria-label="Account menu"
    >
      <span
        className={cn(
          "notranslate min-w-0 truncate text-xs",
          isCollapsed && "sr-only"
        )}
        translate="no"
        title={userEmail || undefined}
      >
        {userEmail || "Account"}
      </span>
      {isCollapsed && (
        <span className="text-xs font-medium">
          {(userEmail || "U").slice(0, 1).toUpperCase()}
        </span>
      )}
    </Button>
  );

  const themeToggleButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="notranslate shrink-0" translate="no">
          <ThemeToggle
            showLabel={false}
            variant="outline"
            size="icon"
            className="rounded-md"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side={isCollapsed ? "right" : "top"}>
        <p>Toggle theme</p>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <Sidebar collapsible="icon" variant="floating" className="app-sidebar-dock py-4">
      <SidebarHeader className="px-2 py-3 notranslate" translate="no">
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center gap-2", isCollapsed && "hidden")}>
            <Link
              href="/"
              className="notranslate flex items-center gap-2 px-1"
              translate="no"
            >
              <BrandLogo mark className="h-6" />
            </Link>
          </div>

          <SidebarTrigger className={cn("hover:bg-accent", isCollapsed && "mx-auto")}>
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </SidebarTrigger>
        </div>

        {provider === "stack" && (
          <div className={cn("mt-3 notranslate", isCollapsed && "hidden")} translate="no">
            <SidebarTeamSwitcher />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className={cn("notranslate", isCollapsed && "px-0")} translate="no">
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup
            key={section.label ?? "overview"}
            className={index === 0 ? "mt-2" : "mt-6"}
          >
            {section.label && (
              <SidebarGroupLabel
                className={cn(
                  "notranslate text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  isCollapsed && "hidden"
                )}
                translate="no"
              >
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {section.items.filter((item) => item.url !== "/billing" || isBillingAvailable(config?.deploymentMode)).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarLink item={item} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter
        className={cn("p-3 notranslate", isCollapsed && "p-2")}
        translate="no"
      >
        <div
          className={cn(
            "flex w-full items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-1",
            isCollapsed && "flex-col"
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {userChipTrigger}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  {provider === "stack" && user?.displayName && (
                    <p className="text-sm font-medium">{user.displayName}</p>
                  )}
                  {userEmail && (
                    <p className="text-xs text-muted-foreground">{userEmail}</p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {provider === "stack" && (
                <DropdownMenuItem
                  onClick={() => router.push("/handler/account-settings")}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Account settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Platform Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logout()} className="cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {themeToggleButton}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
