// App Foundry owns headless feature models; a UI kit owns how those
// features look and behave on screen. This file is the only handshake
// between them. The adapter is deliberately feature-shaped (frame,
// palette, preferences, outlet, error boundary) rather than component-
// shaped, so the framework never starts prescribing buttons, spacing,
// tokens, or layout primitives.

import type { ComponentType, ErrorInfo, ReactNode } from "react";
import type {
  MicroAppRoute,
  ShellHost,
  WorkspaceContext,
} from "../core/host.js";

// Frame props contain product identity, workspace context, host state, and
// extension slots. They describe what the shell must present without
// describing which navigation or layout components must present it.
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

// Interactive surfaces receive the host rather than copied command or
// preference arrays. That keeps their React models subscribed to the same
// authoritative registries used by every App Module.
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

// The feature-level contract every App Foundry UI kit implements. Keeping
// the five surfaces together prevents a host from accidentally mixing
// incompatible frame, outlet, and recovery conventions.
export type ShellPresentationAdapter = {
  AppErrorBoundary: ComponentType<ShellPresentationErrorBoundaryProps>;
  AppOutlet: ComponentType<ShellPresentationAppOutletProps>;
  CommandPalette: ComponentType<ShellPresentationCommandPaletteProps>;
  Frame: ComponentType<ShellPresentationFrameProps>;
  Preferences: ComponentType<ShellPresentationPreferencesProps>;
  id: string;
};

// This identity helper is intentionally runtime-free. It gives TypeScript a
// stable inference point for adapter authors without registering a global or
// making App Foundry depend on the adapter that a host selects.
export function defineShellPresentationAdapter(
  adapter: ShellPresentationAdapter,
): ShellPresentationAdapter {
  return adapter;
}
