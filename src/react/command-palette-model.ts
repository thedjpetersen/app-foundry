// Responsibility: A command palette is interaction-heavy but should not be UI-kit-specific.
// This model owns search results, grouping, keyboard movement, drill-in
// state, and execution. A presentation adapter only renders the returned
// items and wires its input/list primitives to this controller, keeping
// command behavior consistent across otherwise independent visual systems.

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
  isApproximate?: boolean;
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
  isApproximateResults: boolean;
  items: ShellCommandPaletteItem[];
  placeholder: string;
  query: string;
  selectedIndex: number;
  setQuery: (query: string) => void;
};

// API contract: This interaction controller is shared by every UI kit's command palette. Visible
// commands come from the host registry, which already applies context and
// feature gates before anything reaches presentation.
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
  const exactItems = useMemo(
    () => buildCommandItems(host, query, drillParent),
    [drillParent, host, query, visibleCommands],
  );
  const approximateItems = useMemo(
    () =>
      exactItems.length === 0 && !drillParent && query.trim().length > 1
        ? buildApproximateCommandItems(host, query)
        : [],
    [drillParent, exactItems.length, host, query, visibleCommands],
  );
  const items = exactItems.length > 0 ? exactItems : approximateItems;
  const groups = useMemo(() => groupCommandItems(items), [items]);

  // Opening is a fresh search session. Closing also exits any child-command
  // drill so the next open always begins at the product-wide command level.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    } else {
      setDrillParent(undefined);
    }
  }, [isOpen]);

  // Registry and query changes can shrink the result set. Clamp selection
  // here so Enter can never address a stale row index.
  useEffect(() => {
    setSelectedIndex((currentIndex) =>
      items.length === 0 ? 0 : Math.min(currentIndex, items.length - 1),
    );
  }, [items.length]);

  // Execution has three mutually exclusive paths: synthetic back rows move
  // up, parents drill down, and leaf commands close the palette before the
  // host runs the handler. Presentation never needs to distinguish them.
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

  // Keyboard behavior belongs beside selection state, not inside a visual
  // list component. Arrow keys stay bounded; Left and empty Backspace leave
  // a drill; Escape leaves the drill before it closes the whole palette.
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

    if (
      event.key === "ArrowRight" &&
      items[selectedIndex]?.command.children?.length
    ) {
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

    // Decision: Enter executes the selected model row; Escape first unwinds
    // one drill level and only then closes the surface. That two-stage escape
    // makes nested command groups behave like navigation rather than dialogs.
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
    isApproximateResults: exactItems.length === 0 && approximateItems.length > 0,
    items,
    placeholder: drillParent
      ? `Search ${drillParent.title} actions`
      : "Search actions, pages, entities",
    query,
    selectedIndex,
    setQuery,
  };
}

// Approximation is intentionally a fallback over the same visible registry.
// It never displaces an exact ranked result and never bypasses context gates.
export function buildApproximateCommandItems(
  host: ShellHost,
  query: string,
  limit = 3,
): ShellCommandPaletteItem[] {
  const seen = new Set<string>();

  return host
    .paletteItems()
    .map((command) => ({ command, score: approximateCommandScore(command, query) }))
    .filter(({ command, score }) => {
      if (seen.has(command.id) || score < 0.42) {
        return false;
      }
      seen.add(command.id);
      return true;
    })
    .sort((left, right) => right.score - left.score || left.command.title.localeCompare(right.command.title))
    .slice(0, limit)
    .map(({ command }) => ({
      id: command.id,
      label: command.title,
      command,
      description: command.description ?? command.id,
      group: "Close matches",
      isApproximate: true,
      shortcut: command.shortcut,
    }));
}

function approximateCommandScore(command: CommandContribution, query: string) {
  const queryTokens = tokenizeForApproximation(query);
  const titleTokens = tokenizeForApproximation(command.title);
  const supportingTokens = tokenizeForApproximation(
    [command.category, command.description, ...(command.keywords ?? [])]
      .filter(Boolean)
      .join(" "),
  );

  if (queryTokens.length === 0 || titleTokens.length === 0) {
    return 0;
  }

  const tokenScores = queryTokens.map((queryToken) => {
    const titleScore = Math.max(
      0,
      ...titleTokens.map((candidate) => tokenSimilarity(queryToken, candidate)),
    );
    const supportingScore = Math.max(
      0,
      ...supportingTokens.map((candidate) => tokenSimilarity(queryToken, candidate) * 0.72),
    );
    return Math.max(titleScore, supportingScore);
  });

  return tokenScores.reduce((total, score) => total + score, 0) / tokenScores.length;
}

function tokenizeForApproximation(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length > 2 && (left.startsWith(right) || right.startsWith(left))) return 0.82;

  const longest = Math.max(left.length, right.length);
  if (longest === 0 || Math.abs(left.length - right.length) > Math.ceil(longest / 2)) return 0;

  return 1 - levenshteinDistance(left, right) / longest;
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

// Decision: Search is delegated to the registry so ranking, recent history, context
// gates, and dynamic sources remain authoritative. Drilling only changes
// which registry query supplies the rows and prepends one synthetic back row.
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

// Invariant: Preserve first-seen group order from ranked results. Sorting again here
// would quietly discard ranking decisions already made by the registry.
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
  // Decision: Drill navigation is represented as a synthetic command rather
  // than a presentation-only button. Keyboard selection, accessibility, and
  // UI-kit adapters can therefore treat it like every other palette row.
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
  // API contract: Adapters consume one deliberately boring row shape. The
  // ranked result remains attached for match highlighting, while labels and
  // grouping are resolved here so visual kits do not reinterpret semantics.
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
  // Invariant: Recent history and drill context outrank ownership labels.
  // This mirrors the registry's ranking hierarchy and prevents an adapter
  // from making the same command appear to change provenance as users type.
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
