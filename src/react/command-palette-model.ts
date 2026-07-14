import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { ShellHost } from "../core/host.js";
import type {
  CommandContribution,
  CommandShortcut,
  RankedCommandResult,
} from "../core/shell-sdk.js";
import { useVisibleCommands } from "./react-bindings.js";

export type ShellCommandPaletteItem = {
  command: CommandContribution;
  description: string;
  group: string;
  id: string;
  isBackItem?: boolean;
  label: string;
  result?: RankedCommandResult;
  shortcut?: CommandShortcut;
};

export type ShellCommandPaletteGroup = {
  items: ShellCommandPaletteItem[];
  label: string;
};

export type ShellCommandPaletteModel = {
  drillParent?: CommandContribution;
  executeItem: (item?: ShellCommandPaletteItem) => void;
  groups: ShellCommandPaletteGroup[];
  handleKeyDown: (event: KeyboardEvent) => void;
  isDrilling: boolean;
  items: ShellCommandPaletteItem[];
  placeholder: string;
  query: string;
  selectedIndex: number;
  setQuery: (query: string) => void;
};

/** Interaction controller shared by every UI Kit's command palette. */
export function useShellCommandPaletteModel({
  host,
  isOpen,
  onOpenChange,
}: {
  host: ShellHost;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}): ShellCommandPaletteModel {
  const visibleCommands = useVisibleCommands(host);
  const [query, setQuery] = useState("");
  const [drillParent, setDrillParent] = useState<CommandContribution>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = useMemo(
    () => buildCommandItems(host, query, drillParent),
    [drillParent, host, query, visibleCommands],
  );
  const groups = useMemo(() => groupCommandItems(items), [items]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    } else {
      setDrillParent(undefined);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((currentIndex) =>
      items.length === 0 ? 0 : Math.min(currentIndex, items.length - 1),
    );
  }, [items.length]);

  function executeItem(item: ShellCommandPaletteItem | undefined) {
    if (!item) {
      return;
    }

    if (item.isBackItem) {
      setDrillParent(undefined);
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    if (item.command.children?.length) {
      setDrillParent(item.command);
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    onOpenChange(false);
    void host.runCommand(item.command.id);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((currentIndex) =>
        items.length === 0 ? 0 : Math.min(currentIndex + 1, items.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "ArrowRight" && items[selectedIndex]?.command.children?.length) {
      event.preventDefault();
      executeItem(items[selectedIndex]);
      return;
    }

    if (event.key === "ArrowLeft" && drillParent) {
      event.preventDefault();
      setDrillParent(undefined);
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    if (event.key === "Backspace" && query.length === 0 && drillParent) {
      event.preventDefault();
      setDrillParent(undefined);
      setSelectedIndex(0);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      executeItem(items[selectedIndex]);
      return;
    }

    if (event.key === "Escape") {
      if (drillParent) {
        event.preventDefault();
        setDrillParent(undefined);
        setQuery("");
        setSelectedIndex(0);
        return;
      }

      onOpenChange(false);
    }
  }

  return {
    drillParent,
    executeItem,
    groups,
    handleKeyDown,
    isDrilling: drillParent != null,
    items,
    placeholder: drillParent
      ? `Search ${drillParent.title} actions`
      : "Search actions, pages, entities",
    query,
    selectedIndex,
    setQuery,
  };
}

export function buildCommandItems(
  host: ShellHost,
  query: string,
  drillParent?: CommandContribution,
): ShellCommandPaletteItem[] {
  if (drillParent) {
    return [
      createBackItem(drillParent),
      ...host
        .paletteChildResults(drillParent.id, query)
        .map((result) => commandToItem(result.command, result, drillParent)),
    ];
  }

  return host
    .paletteResults(query)
    .map((result) => commandToItem(result.command, result));
}

export function groupCommandItems(items: ShellCommandPaletteItem[]) {
  const groups: ShellCommandPaletteGroup[] = [];

  for (const item of items) {
    const existingGroup = groups.find((group) => group.label === item.group);

    if (existingGroup) {
      existingGroup.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }

  return groups;
}

function createBackItem(parent: CommandContribution): ShellCommandPaletteItem {
  const command: CommandContribution = {
    id: "platform.paletteBack",
    appId: "platform",
    category: "Navigation",
    title: "Back to all commands",
    description: parent.title,
    icon: "chevronLeft",
    kind: "action",
  };

  return {
    id: command.id,
    label: command.title,
    command,
    description: parent.title,
    group: `${parent.title} actions`,
    isBackItem: true,
  };
}

function commandToItem(
  command: CommandContribution,
  result: RankedCommandResult,
  drillParent?: CommandContribution,
): ShellCommandPaletteItem {
  return {
    id: command.id,
    label: command.title,
    command,
    description: command.description ?? command.id,
    group: groupLabelForResult(result, drillParent),
    result,
    shortcut: command.shortcut,
  };
}

function groupLabelForResult(
  result: RankedCommandResult,
  drillParent?: CommandContribution,
) {
  if (drillParent) {
    return `${drillParent.title} actions`;
  }

  if (result.isRecent) {
    return "Recent";
  }

  return `${result.source.label} - ${ringLabel(result.source.ring)}`;
}

function ringLabel(ring?: string) {
  if (ring === "feature") return "Feature";
  if (ring === "app") return "App";
  if (ring === "product") return "Product";
  return "Platform";
}
