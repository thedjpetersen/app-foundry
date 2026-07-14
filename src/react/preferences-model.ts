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

/** Selection and grouping behavior shared by every UI Kit's preferences view. */
export function useShellPreferencesModel(host: ShellHost): ShellPreferencesModel {
  const groups = useSettingsGroups(host);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const activeAppId = host.getShell().context.get<string>("appActive");
  const preferredGroup = preferredSettingsGroup(groups, activeAppId);
  const selectedGroup =
    groups.find((group) => group.id === selectedGroupId) ?? preferredGroup;
  const groupsByRing = useMemo(() => groupSettingsByRing(groups), [groups]);

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

export function groupSettingsByRing(groups: SettingsGroup[]): SettingsRingGroup[] {
  const orderedRings: PreferenceRing[] = ["platform", "product", "app", "feature"];

  return orderedRings
    .map((ring) => ({
      ring,
      groups: groups.filter((group) => group.ring === ring),
    }))
    .filter((item) => item.groups.length > 0);
}

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
