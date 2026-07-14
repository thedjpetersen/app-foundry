// Responsibility: The frame model is the smallest useful projection of `ShellHost` for a
// product shell: the app catalog, the app matching the current location,
// and active-app contributions grouped into their four top-nav slots. It
// contains no Astryx, DOM, or layout decisions, so different UI kits can
// render identical host state without reimplementing host queries.

import { useMemo } from "react";
import type {
  ShellAppManifest,
  ShellHost,
  ShellTopNavMountArea,
  ShellTopNavMountContribution,
} from "../core/host.js";
import { useHostVersion } from "./react-bindings.js";

export type ShellFrameModel = {
  activeApp?: ShellAppManifest;
  apps: ShellAppManifest[];
  topNavMounts: Record<ShellTopNavMountArea, ShellTopNavMountContribution[]>;
};

// Invariant: `useHostVersion` is the subscription edge. The returned number is not
// business data; including it in the memo dependencies simply invalidates
// the projection whenever manifests, activation, or nav mounts change.
export function useShellFrameModel({
  currentPathname,
  host,
}: {
  currentPathname: string;
  host: ShellHost;
}): ShellFrameModel {
  const version = useHostVersion(host);

  return useMemo(
    () => ({
      activeApp: host.getManifestForPathname(currentPathname),
      apps: host.getManifests(),
      topNavMounts: {
        center: host.topNavMounts("center"),
        end: host.topNavMounts("end"),
        header: host.topNavMounts("header"),
        start: host.topNavMounts("start"),
      },
    }),
    [currentPathname, host, version],
  );
}
