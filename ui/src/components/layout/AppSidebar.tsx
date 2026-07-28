"use client";

import type { Team } from "@stackframe/stack";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useRef } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import {
  AudioLinesIcon,
  BillingIcon,
  BrainIcon,
  CampaignsIcon,
  FilesIcon,
  KeyIcon,
  LogoutIcon,
  OverviewIcon,
  PhoneIcon,
  ReportsIcon,
  SettingsIcon,
  type SidebarAnimatedIcon,
  type SidebarAnimatedIconHandle,
  ToolsIcon,
  TrendingUpIcon,
  WorkflowIcon,
} from "@/components/icons/sidebar-icons";
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
  icon: SidebarAnimatedIcon;
  showsTelephonyWarning?: boolean;
};

type SidebarNavSection = {
  label?: string;
  items: SidebarNavItem[];
};

const TELEPHONY_WARNING_COPY = "Action required";

function AnimatedDropdownItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: SidebarAnimatedIcon;
  label: string;
  onClick: () => void;
}) {
  const iconRef = useRef<SidebarAnimatedIconHandle | null>(null);

  return (
    <DropdownMenuItem
      onClick={onClick}
      className="cursor-pointer text-xs"
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      onFocus={() => iconRef.current?.startAnimation()}
      onBlur={() => iconRef.current?.stopAnimation()}
    >
      <Icon ref={iconRef} size={14} className="mr-2" />
      {label}
    </DropdownMenuItem>
  );
}

const NAV_SECTIONS: SidebarNavSection[] = [
  {
    items: [
      {
        title: "Overview",
        url: "/overview",
        icon: OverviewIcon,
      },
    ],
  },
  {
    label: "BUILD",
    items: [
      {
        title: "Voice Agents",
        url: "/workflow",
        icon: WorkflowIcon,
      },
      {
        title: "Campaigns",
        url: "/campaigns",
        icon: CampaignsIcon,
      },
      {
        title: "Models",
        url: "/model-configurations",
        icon: BrainIcon,
      },
      {
        title: "Telephony",
        url: "/telephony-configurations",
        icon: PhoneIcon,
        showsTelephonyWarning: true,
      },
      {
        title: "Tools",
        url: "/tools",
        icon: ToolsIcon,
      },
      {
        title: "Files",
        url: "/files",
        icon: FilesIcon,
      },
      {
        title: "Recordings",
        url: "/recordings",
        icon: AudioLinesIcon,
      },
      {
        title: "Developers",
        url: "/api-keys",
        icon: KeyIcon,
      },
    ],
  },
  {
    label: "MANAGE",
    items: [
      {
        title: "Agent Runs",
        url: "/usage",
        icon: TrendingUpIcon,
      },
      {
        title: "Billing",
        url: "/billing",
        icon: BillingIcon,
      },
      {
        title: "Reports",
        url: "/reports",
        icon: ReportsIcon,
      }
    ],
  },
];

// Lazy load SelectedTeamSwitcher - we'll pass selectedTeam from our context
const StackTeamSwitcher = React.lazy(() =>
  import("@stackframe/stack").then((mod) => ({
    default: mod.SelectedTeamSwitcher,
  }))
);

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { provider, getSelectedTeam, logout, user } = useAuth();
  const { config } = useAppConfig();
  const { telnyxMissingWebhookPublicKeyCount } = useTelephonyConfigWarnings();
  const billingAvailable = isBillingAvailable(config?.deploymentMode);
  const hasTelephonyWarning = telnyxMissingWebhookPublicKeyCount > 0;
  const isCollapsed = !isMobile && state === "collapsed";

  // Get selected team for Stack auth (cast to Team type from Stack)
  // Stabilize the reference so SelectedTeamSwitcher only sees a change when the team ID changes,
  // preventing unnecessary PATCH calls to Stack Auth on every route navigation.
  const selectedTeamRef = useRef<Team | null>(null);
  const rawSelectedTeam = provider === "stack" && getSelectedTeam ? getSelectedTeam() as Team | null : null;
  if (rawSelectedTeam?.id !== selectedTeamRef.current?.id) {
    selectedTeamRef.current = rawSelectedTeam;
  }
  const selectedTeam = selectedTeamRef.current;

  // Version info from app config context
  const versionInfo = config ? { ui: config.uiVersion, api: config.apiVersion } : null;

  const isActive = (path: string) => pathname.startsWith(path);

  const handleMobileNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const SidebarLink = ({ item }: { item: SidebarNavItem }) => {
    const isItemActive = isActive(item.url);
    const Icon = item.icon;
    const iconRef = useRef<SidebarAnimatedIconHandle | null>(null);
    const startIcon = () => iconRef.current?.startAnimation();
    const stopIcon = () => iconRef.current?.stopAnimation();
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
          "rounded-xl transition-colors hover:bg-accent hover:text-accent-foreground",
          isItemActive &&
            "bg-cta/15 font-semibold text-foreground hover:bg-cta/20 hover:text-foreground"
        )}
      >
        <Link
          href={item.url}
          onClick={handleMobileNavClick}
          onMouseEnter={startIcon}
          onMouseLeave={stopIcon}
          onFocus={startIcon}
          onBlur={stopIcon}
          className={cn("relative", isCollapsed && "justify-center")}
          translate="no"
        >
          {isItemActive && !isCollapsed && (
            <span
              className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cta"
              aria-hidden
            />
          )}
          <Icon
            ref={iconRef}
            size={16}
            className={cn(
              "shrink-0",
              isItemActive && "text-cta"
            )}
          />
          <span
            className={cn("notranslate min-w-0 flex-1 truncate", isCollapsed && "sr-only")}
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

  // Footer identity trigger: avatar initials only (no name), in a subtle
  // bordered circle. Same treatment expanded and collapsed.
  const displayIdentity =
    user?.displayName ||
    (user as { primaryEmail?: string } | undefined)?.primaryEmail ||
    (user as LocalUser | undefined)?.email ||
    "";
  const userInitials =
    displayIdentity
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s[0]?.toUpperCase())
      .join("") || "U";

  const userChipTrigger = (
    <Button
      variant="outline"
      className={cn(
        "cursor-pointer text-xs",
        isCollapsed
          ? "size-8 shrink-0 items-center justify-center rounded-md p-0"
          : "h-auto w-full justify-start gap-2 rounded-md px-2 py-1"
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-medium",
          isCollapsed ? "size-6" : "h-6 w-6"
        )}
      >
        {userInitials}
      </span>
      {!isCollapsed && (user as LocalUser | undefined)?.email && (
        <span className="truncate text-xs text-muted-foreground">
          {(user as LocalUser).email}
        </span>
      )}
    </Button>
  );

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="app-sidebar-dock">
      <SidebarHeader
        className={cn("notranslate px-3 py-3", isCollapsed && "px-2 py-3")}
        translate="no"
      >
        <div
          className={cn(
            "flex items-center",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          <div className={cn("flex items-center gap-2", isCollapsed && "hidden")}>
            <Link
              href="/"
              className="notranslate flex items-center gap-2"
              translate="no"
            >
              <BrandLogo mark className="h-6" />
              {versionInfo && (
                <span
                  className="notranslate text-xs font-normal text-muted-foreground"
                  translate="no"
                >
                  v{versionInfo.ui}
                </span>
              )}
            </Link>
          </div>

          <SidebarTrigger
            className={cn("size-8 shrink-0 hover:bg-accent", isCollapsed && "mx-0")}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </SidebarTrigger>
        </div>

        {provider === "stack" && (
          <div className={cn("mt-2 notranslate", isCollapsed && "hidden")} translate="no">
            <React.Suspense
              fallback={
                <div className="h-9 w-full animate-pulse rounded bg-muted" />
              }
            >
              <StackTeamSwitcher
                selectedTeam={selectedTeam || undefined}
                onChange={() => {
                  router.refresh();
                }}
              />
            </React.Suspense>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent
        className={cn("notranslate px-2", isCollapsed && "px-2")}
        translate="no"
      >
        {NAV_SECTIONS.map((section, index) => (
          <SidebarGroup
            key={section.label ?? "overview"}
            className={cn("p-0", index === 0 ? "mt-0" : "mt-4")}
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
              {section.items
                .filter((item) => item.url !== "/billing" || billingAvailable)
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarLink item={item} />
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter
        className={cn("notranslate px-3 py-3", isCollapsed && "px-2 py-3")}
        translate="no"
      >
        <div
          className={cn(
            "flex w-full flex-col gap-2",
            isCollapsed && "items-center"
          )}
        >
          {provider !== "stack" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {userChipTrigger}
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    {(user as LocalUser | undefined)?.email && (
                      <p className="text-xs text-muted-foreground">{(user as LocalUser).email}</p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <AnimatedDropdownItem
                  icon={SettingsIcon}
                  label="Platform Settings"
                  onClick={() => router.push("/settings")}
                />
                <AnimatedDropdownItem
                  icon={LogoutIcon}
                  label="Sign out"
                  onClick={() => logout()}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {userChipTrigger}
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    {user?.displayName && (
                      <p className="text-xs font-medium">{user.displayName}</p>
                    )}
                    {(user as { primaryEmail?: string })?.primaryEmail && (
                      <p className="text-xs text-muted-foreground">{(user as { primaryEmail?: string }).primaryEmail}</p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <AnimatedDropdownItem
                  icon={SettingsIcon}
                  label="Account settings"
                  onClick={() => router.push("/handler/account-settings")}
                />
                <AnimatedDropdownItem
                  icon={SettingsIcon}
                  label="Platform Settings"
                  onClick={() => router.push("/settings")}
                />
                <AnimatedDropdownItem
                  icon={LogoutIcon}
                  label="Sign out"
                  onClick={() => logout()}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <ThemeToggle fullWidth={!isCollapsed} showLabel={!isCollapsed} />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
