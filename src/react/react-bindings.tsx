// The React layer never duplicates shell state — that is the one rule this
// file exists to enforce. Every hook here is a thin `useSyncExternalStore`
// over a service's version counter: when the shell changes, the counter
// bumps, React re-reads, done. No context providers, no reducers, no copy
// of the command list living in component state.

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ShellHost,
  ShellTopNavMountArea,
} from "../core/host.js";
import {
  shell,
  type CommandContribution,
  type CommandSourceContribution,
  type ShellSDK,
} from "../core/shell-sdk.js";

export function useVisibleCommands(host: ShellHost): CommandContribution[] {
  const version = useHostVersion(host);

  return useMemo(() => host.paletteItems(), [host, version]);
}

// Registers a dynamic command source for exactly the lifetime of the
// calling component. Callers memoize `source`; a new object identity means
// re-register, which is precisely the semantics data-driven sources want
// (the registry swaps batches by id).
export function useCommandSource(
  source: CommandSourceContribution,
  sdk: ShellSDK = shell()
) {
  useEffect(() => {
    const registration = sdk.commands.registerSource(source);

    return () => {
      registration.dispose();
    };
  }, [sdk, source]);
}

export function useEntityActions({
  appId,
  entities,
  id,
  label,
  priority,
  sdk = shell(),
}: {
  appId: string;
  entities: CommandContribution[];
  id: string;
  label: string;
  priority?: number;
  sdk?: ShellSDK;
}) {
  const source = useMemo<CommandSourceContribution>(
    () => ({
      id,
      appId,
      label,
      commands: entities,
      priority,
      ring: "feature",
    }),
    [appId, entities, id, label, priority]
  );

  useCommandSource(source, sdk);
}

export function useSettingsGroups(host: ShellHost) {
  const version = useHostVersion(host);

  return useMemo(() => host.settingsGroups(), [host, version]);
}

export function useShellTopNavMounts(
  host: ShellHost,
  area?: ShellTopNavMountArea,
) {
  const version = useHostVersion(host);

  return useMemo(() => host.topNavMounts(area), [area, host, version]);
}

// Mount hooks split into two effects on purpose: the first registers and
// disposes on identity changes (id, area, host), while the second only
// pushes fresh `content` into the existing registration. React elements
// get a new identity every render, so folding content into the first
// effect would remount the contribution on every keystroke.
export function useShellTopNavMount({
  appId,
  area,
  content,
  host,
  id,
  order,
}: {
  appId?: string;
  area: ShellTopNavMountArea;
  content: ReactNode;
  host: ShellHost;
  id: string;
  order?: number;
}) {
  useEffect(() => {
    const registration = host.mountTopNav({
      appId,
      area,
      content,
      id,
      order,
    });

    return () => {
      registration.dispose();
    };
  }, [appId, area, host, id, order]);

  useEffect(() => {
    host.updateTopNavMount({
      appId,
      area,
      content,
      id,
      order,
    });
  }, [appId, area, content, host, id, order]);
}

export function useShellSideNavMounts(host: ShellHost) {
  const version = useHostVersion(host);

  return useMemo(() => host.sideNavMounts(), [host, version]);
}

export function useShellSideNavMount({
  appId,
  content,
  host,
  id,
  order,
}: {
  appId?: string;
  content: ReactNode;
  host: ShellHost;
  id: string;
  order?: number;
}) {
  useEffect(() => {
    const registration = host.mountSideNav({
      appId,
      content,
      id,
      order,
    });

    return () => {
      registration.dispose();
    };
  }, [appId, host, id, order]);

  useEffect(() => {
    host.updateSideNavMount({
      appId,
      content,
      id,
      order,
    });
  }, [appId, content, host, id, order]);
}

export function useShellTopNavHeader({
  appId,
  content,
  host,
  id,
  order,
}: {
  appId?: string;
  content: ReactNode;
  host: ShellHost;
  id: string;
  order?: number;
}) {
  useShellTopNavMount({
    appId,
    area: "header",
    content,
    host,
    id,
    order,
  });
}

// The primitive all the read hooks build on: subscribe to the host, read
// its version. `useMemo` on `[host, version]` then makes any derived list
// recompute exactly when the shell says something changed.
export function useHostVersion(host: ShellHost) {
  return useSyncExternalStore(
    (listener) => host.subscribe(listener).dispose,
    () => host.snapshotVersion(),
    () => host.snapshotVersion()
  );
}

function usePreferenceVersion(sdk: ShellSDK) {
  return useSyncExternalStore(
    (listener) => sdk.preferences.subscribe(listener).dispose,
    () => sdk.preferences.snapshotVersion(),
    () => sdk.preferences.snapshotVersion()
  );
}

export function usePreferenceInspection(key: string, sdk: ShellSDK = shell()) {
  const version = usePreferenceVersion(sdk);

  return useMemo(() => sdk.preferences.inspect(key), [key, sdk, version]);
}

// A live read of one context key; the third `useSyncExternalStore`
// argument makes server renders see the fallback instead of touching the
// browser-side store.
export function useContextKey<TValue>(
  key: string,
  fallback: TValue,
  sdk: ShellSDK = shell()
): TValue {
  return useSyncExternalStore(
    (listener) => sdk.context.subscribe(listener).dispose,
    () => {
      const value =
        sdk.context.get<TValue & (string | number | boolean | null)>(key);
      return value === undefined ? fallback : (value as TValue);
    },
    () => fallback
  );
}
