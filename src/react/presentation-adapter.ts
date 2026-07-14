import type { ComponentType, ErrorInfo, ReactNode } from "react";
import type {
  MicroAppRoute,
  ShellHost,
  WorkspaceContext,
} from "../core/host.js";

export type ShellPresentationFrameProps = {
  brandHref?: string;
  brandName: string;
  children: ReactNode;
  currentPathname: string;
  endContent?: ReactNode;
  host: ShellHost;
  logo?: ReactNode;
  sideNavLabel?: string;
  workspace: WorkspaceContext;
};

export type ShellPresentationCommandPaletteProps = {
  host: ShellHost;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export type ShellPresentationPreferencesProps = {
  host: ShellHost;
  showHeader?: boolean;
};

export type ShellPresentationAppOutletProps = {
  appId: string;
  host: ShellHost;
  navigate: (href: string) => void;
  route: MicroAppRoute;
  workspace: WorkspaceContext;
};

export type ShellPresentationErrorBoundaryProps = {
  appId: string;
  appName: string;
  children: ReactNode;
  ownerTeam?: string;
  resetKey: string;
  onError?: (error: unknown, info: ErrorInfo) => void;
};

/** The feature-level contract every App Foundry UI Kit implements. */
export type ShellPresentationAdapter = {
  AppErrorBoundary: ComponentType<ShellPresentationErrorBoundaryProps>;
  AppOutlet: ComponentType<ShellPresentationAppOutletProps>;
  CommandPalette: ComponentType<ShellPresentationCommandPaletteProps>;
  Frame: ComponentType<ShellPresentationFrameProps>;
  Preferences: ComponentType<ShellPresentationPreferencesProps>;
  id: string;
};

export function defineShellPresentationAdapter(
  adapter: ShellPresentationAdapter,
): ShellPresentationAdapter {
  return adapter;
}
