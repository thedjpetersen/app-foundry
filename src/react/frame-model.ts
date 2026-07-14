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
  topNavMounts: Record<
    ShellTopNavMountArea,
    ShellTopNavMountContribution[]
  >;
};

/** Presentation-neutral state consumed by every UI Kit's shell frame. */
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
