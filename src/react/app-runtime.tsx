import {
  Component,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type {
  MicroAppRoute,
  ShellAppInstance,
  ShellAppManifest,
  ShellAppRenderProps,
  ShellHost,
  WorkspaceContext,
} from "../core/host.js";
import { useHostVersion } from "./react-bindings.js";

export type ShellAppOutletState =
  | {
      appId: string;
      status: "unavailable";
    }
  | {
      appId: string;
      manifest: ShellAppManifest;
      status: "loading";
    }
  | {
      appId: string;
      instance: ShellAppInstance;
      manifest: ShellAppManifest;
      renderProps: ShellAppRenderProps;
      resetKey: string;
      status: "ready";
    };

export type UseShellAppOutletOptions = {
  appId: string;
  host: ShellHost;
  navigate: (href: string) => void;
  route: MicroAppRoute;
  workspace: WorkspaceContext;
};

/**
 * Activates one App Module and returns its presentation-neutral outlet state.
 * A UI Kit renders unavailable, loading, ready, and error states without
 * duplicating lifecycle or race handling.
 */
export function useShellAppOutlet({
  appId,
  host,
  navigate,
  route,
  workspace,
}: UseShellAppOutletOptions): ShellAppOutletState {
  const hostVersion = useHostVersion(host);
  const activeApp = useSyncExternalStore(
    (listener) => host.subscribe(listener).dispose,
    () => host.activeApp(),
    () => host.activeApp(),
  );

  useEffect(() => {
    let isCancelled = false;

    void host.activate(appId).catch(() => {
      if (!isCancelled) {
        host.deactivate(appId);
      }
    });

    return () => {
      isCancelled = true;
      host.deactivate(appId);
    };
  }, [appId, host]);

  const manifest = useMemo(
    () => host.getManifest(appId),
    [appId, host, hostVersion],
  );

  if (!manifest) {
    return { appId, status: "unavailable" };
  }

  if (activeApp?.manifest.id !== appId) {
    return { appId, manifest, status: "loading" };
  }

  return {
    appId,
    instance: activeApp.instance,
    manifest,
    renderProps: {
      host,
      manifest,
      navigate,
      route,
      shell: host.getShell(),
      workspace,
    },
    resetKey: `${manifest.id}:${route.pathname}`,
    status: "ready",
  };
}

export type ShellAppErrorViewProps = {
  appId: string;
  appName: string;
  error: Error;
  ownerTeam?: string;
  retry: () => void;
};

export type ShellAppBoundaryProps = {
  appId: string;
  appName: string;
  children: ReactNode;
  ownerTeam?: string;
  resetKey: string;
  onError?: (error: unknown, info: ErrorInfo) => void;
  renderError: (props: ShellAppErrorViewProps) => ReactNode;
};

type ShellAppBoundaryState = {
  error: Error | null;
  resetKey: string;
};

/** Error isolation with UI rendering supplied at the Presentation Seam. */
export class ShellAppBoundary extends Component<
  ShellAppBoundaryProps,
  ShellAppBoundaryState
> {
  state: ShellAppBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: unknown) {
    return { error: normalizeError(error) };
  }

  static getDerivedStateFromProps(
    props: ShellAppBoundaryProps,
    state: ShellAppBoundaryState,
  ) {
    return props.resetKey !== state.resetKey
      ? { error: null, resetKey: props.resetKey }
      : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);

    if (!this.props.onError) {
      console.error(`Shell app "${this.props.appId}" failed to render.`, error, {
        componentStack: info.componentStack,
      });
    }
  }

  render() {
    if (this.state.error) {
      return this.props.renderError({
        appId: this.props.appId,
        appName: this.props.appName,
        error: this.state.error,
        ownerTeam: this.props.ownerTeam,
        retry: () => this.setState({ error: null }),
      });
    }

    return this.props.children;
  }
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
