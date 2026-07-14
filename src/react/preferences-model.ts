// Responsibility: Preferences have an ownership hierarchy, but a UI kit should not need to
// understand how groups are resolved or which app is currently active. This
// model turns the host registry into ordered ring groups plus one resilient
// selection. Presentation decides whether those groups become a sidebar,
// tabs, or another navigation pattern.

import { useEffect, useMemo, useState } from "react";
import type { ShellHost } from "../core/host.js";
import type { PreferenceRing, SettingsGroup } from "../core/shell-sdk.js";
import { useSettingsGroups } from "./react-bindings.js";

export type SettingsRingGroup = {
  groups: SettingsGroup[];
  ring: PreferenceRing;
};

export type ShellPreferencesModel = {
  activeAppId?: string;
  groups: SettingsGroup[];
  groupsByRing: SettingsRingGroup[];
  selectGroup: (groupId: string) => void;
  selectedGroup?: SettingsGroup;
};

// API contract: Selection and grouping behavior is shared by every UI kit's preferences view.
export function useShellPreferencesModel(
  host: ShellHost,
): ShellPreferencesModel {
  const groups = useSettingsGroups(host);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const activeAppId = host.getShell().context.get<string>("appActive");
  const preferredGroup = preferredSettingsGroup(groups, activeAppId);
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? preferredGroup;
  const groupsByRing = useMemo(() => groupSettingsByRing(groups), [groups]);

  // Contributions can disappear when an app deactivates. If selection is no
  // longer valid—or a newly active app has a more relevant group—move to the
  // preferred group instead of leaving presentation with a dangling id.
  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId("");
      return;
    }

    if (
      preferredGroup &&
      (!selectedGroup ||
        (activeAppId &&
          selectedGroup.appId !== activeAppId &&
          preferredGroup.appId === activeAppId))
    ) {
      setSelectedGroupId(preferredGroup.id);
    }
  }, [activeAppId, groups, preferredGroup, selectedGroup]);

  return {
    activeAppId,
    groups,
    groupsByRing,
    selectGroup: setSelectedGroupId,
    selectedGroup,
  };
}

// Invariant: Ring order expresses the framework's ownership ladder. Empty rings are
// omitted so a presentation never renders navigation with dead headings.
export function groupSettingsByRing(
  groups: SettingsGroup[],
): SettingsRingGroup[] {
  const orderedRings: PreferenceRing[] = [
    "platform",
    "product",
    "app",
    "feature",
  ];

  return orderedRings
    .map((ring) => ({
      ring,
      groups: groups.filter((group) => group.ring === ring),
    }))
    .filter((item) => item.groups.length > 0);
}

// Decision: Prefer the active app, then progressively broader ownership. This makes
// opening settings feel local to the current task while still producing a
// deterministic landing group when no app is active.
export function preferredSettingsGroup(
  groups: SettingsGroup[],
  activeAppId?: string,
) {
  if (activeAppId) {
    const appGroup = groups.find(
      (group) => group.appId === activeAppId && group.ring === "app",
    );

    if (appGroup) return appGroup;

    const activeGroup = groups.find((group) => group.appId === activeAppId);
    if (activeGroup) return activeGroup;
  }

  return (
    groups.find((group) => group.ring === "app") ??
    groups.find((group) => group.ring === "product") ??
    groups.find((group) => group.ring === "platform") ??
    groups[0]
  );
}
