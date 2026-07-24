import {
  AudioLinesIcon,
  BadgeDollarIcon,
  BlocksIcon,
  BookOpenTextIcon,
  BrainIcon,
  CodeIcon,
  FolderOpenIcon,
  HouseIcon,
  KeyIcon,
  LogoutIcon,
  PhoneIcon,
  RocketIcon,
  SettingsIcon,
  TrendingUpIcon,
} from "@animateicons/react/lucide";
import type { ComponentType, Ref } from "react";

export type SidebarAnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

export type SidebarAnimatedIcon = ComponentType<{
  className?: string;
  size?: number;
  ref?: Ref<SidebarAnimatedIconHandle>;
}>;

export {
  AudioLinesIcon,
  BadgeDollarIcon as BillingIcon,
  BrainIcon,
  RocketIcon as CampaignsIcon,
  FolderOpenIcon as FilesIcon,
  KeyIcon,
  LogoutIcon,
  HouseIcon as OverviewIcon,
  PhoneIcon,
  BookOpenTextIcon as ReportsIcon,
  SettingsIcon,
  CodeIcon as ToolsIcon,
  TrendingUpIcon,
  BlocksIcon as WorkflowIcon,
};
