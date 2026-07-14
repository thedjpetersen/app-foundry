// The shell SDK is the seam between a host product and its micro-apps: one
// shared object holding four services — commands, context keys, events, and
// preferences. Everything in this file is framework-agnostic TypeScript.
// The React package subscribes to these services, and `ShellHost` composes
// them into an app registration and activation lifecycle.
//
// Two conventions run through the whole file. First, every mutation returns
// a `Disposable`, so any contribution can be unwound in reverse order —
// that is what makes app activation safely reversible. Second, every
// service keeps a monotonic version counter, so React can bind with
// `useSyncExternalStore` and never diff service state by hand.

// The unit of undo. Declaring a command, binding a handler, subscribing to
// an event — each hands back one of these, and disposing it removes exactly
// that contribution and nothing else.
export type Disposable = {
  dispose: () => void;
};

export type PreferenceValue = string | number | boolean;

// Rings are the ownership ladder that both commands and preferences climb:
// `platform` is the outermost (the whole install), then `product`, then a
// single `app`, then one `feature` inside an app. More specific rings win
// ties — a feature knows its context better than the platform does.
export type PreferenceRing = "platform" | "product" | "app" | "feature";

export type CommandRing = PreferenceRing;

export type CommandKind = "action" | "entity" | "help" | "page";

export type CommandVisibility = "self" | "product";

export type PreferenceScope =
  "default" | "platform" | "product" | "app" | "feature" | "user";

export type PreferenceValueLayer = "seed" | "user";

export type RingContext = {
  platform?: string;
  product?: string;
  app?: string;
  feature?: string;
  currentRing?: PreferenceRing;
};

export type ContextValue = string | number | boolean | null | undefined;

export type ContextSnapshot = ReadonlyMap<string, ContextValue>;

export type CommandExecutionContext = {
  command: CommandContribution;
  shell: ShellSDK;
};

export type CommandHandler = (
  context: CommandExecutionContext,
) => Promise<void> | void;

export type CommandShortcut = {
  key: string;
  modifiers?: Array<"alt" | "ctrl" | "meta" | "shift">;
};

export type CommandEntity = {
  id: string;
  label: string;
  description?: string;
};

// A command is declared as data long before any code is loaded: the palette
// can list, rank, and route to it while the owning app module is still a
// lazy import. `handler` is optional for exactly that reason — declaration
// and binding are separate steps (see `CommandRegistry.declare` and
// `bind`). `shortcodes` carry stable human-facing IDs like `T00000A`;
// `when` is a context expression that gates visibility; `children` turn a
// command into a drillable submenu in the palette.
export type CommandContribution = {
  id: string;
  appId: string;
  category: string;
  title: string;
  childCount?: number;
  children?: CommandContribution[];
  description?: string;
  entity?: CommandEntity;
  featureId?: string;
  handler?: CommandHandler;
  href?: string;
  icon?: string;
  kind?: CommandKind;
  keywords?: string[];
  paletteHidden?: boolean;
  parentId?: string;
  priority?: number;
  ring?: CommandRing;
  route?: string;
  section?: string;
  shortcodes?: string[];
  shortcut?: CommandShortcut;
  sourceId?: string;
  sourceLabel?: string;
  target?: "_blank" | "_self";
  visibility?: CommandVisibility;
  when?: string;
};

// A dynamic batch of commands owned by one contributor. Sources replace by
// id, so an app can re-register its source on every data change and the
// registry swaps the old batch out atomically.
export type CommandSourceContribution = {
  id: string;
  appId: string;
  label: string;
  commands: CommandContribution[];
  priority?: number;
  ring: CommandRing;
};

export type CommandPrefixMode = {
  filter: (command: CommandContribution) => boolean;
  icon?: string;
  label: string;
  placeholder?: string;
  prefix: string;
};

// Ranking output keeps its work visible: the scores, the matched character
// ranges (for underlining), the prefix mode in effect, and which source
// contributed the command. Palettes can render *why* something ranked, not
// just the ordering.
export type RankedCommandResult = {
  command: CommandContribution;
  isRecent: boolean;
  matchRanges: Array<[number, number]>;
  prefix?: CommandPrefixMode;
  ringScore: number;
  source: {
    id: string;
    label: string;
    ring: CommandRing;
  };
  textScore: number;
};

export type CommandHistoryEntry = {
  actionId: string;
  actionLabel: string;
  actionUrl?: string;
  icon?: string;
  invokedAt: number;
  ring: CommandRing;
  scope: string;
};

export type PreferenceOption = {
  label: string;
  value: PreferenceValue;
};

// A preference exists only if a schema declares it: typed, namespaced
// (`app.key`), carrying its own default, optional enum `options`, a `when`
// visibility clause, and a `migrations` map for renaming stored values
// across versions. Settings UI is generated from these — there is no
// second registration step.
export type PreferenceSchema = {
  key: string;
  appId: string;
  category: string;
  defaultValue: PreferenceValue;
  description?: string;
  featureId?: string;
  label: string;
  options?: PreferenceOption[];
  productId?: string;
  ring?: PreferenceRing;
  scope?: string;
  type: "boolean" | "enum" | "number" | "string";
  when?: string;
  migrations?: Record<string, PreferenceValue>;
  schemaVersion?: number;
};

export type PreferenceValueRecord = {
  key: string;
  ring: PreferenceRing;
  scope: string;
  value: PreferenceValue;
  layer?: PreferenceValueLayer;
  schemaVersion?: number;
};

export type PreferenceSource = {
  ring: PreferenceScope;
  scope: string;
  layer?: PreferenceValueLayer;
};

// The answer to "what is this preference right now, and why?" — value plus
// provenance: which ring supplied it, whether it was inherited from a
// wider ring, whether the user overrode it, and the per-ring `layers` so
// an inspector can show the whole cascade at once.
export type ResolvedPreference = {
  key: string;
  schema?: PreferenceSchema;
  value?: PreferenceValue;
  source: PreferenceSource;
  scope: PreferenceScope;
  isDefault: boolean;
  isInherited: boolean;
  hasUserOverride: boolean;
  layers: {
    app?: PreferenceValue;
    default?: PreferenceValue;
    feature?: PreferenceValue;
    platform?: PreferenceValue;
    product?: PreferenceValue;
    user?: PreferenceValue;
  };
};

export type PreferenceInspection = ResolvedPreference;

export type SettingsGroup = {
  id: string;
  appId: string;
  category: string;
  featureId?: string;
  label: string;
  ring: PreferenceRing;
  scope: string;
  settings: PreferenceSchema[];
};

export type ShellEvent<TPayload = unknown> = {
  type: string;
  payload: TPayload;
  timestamp: number;
};

export type ShellSDKOptions = {
  instanceId?: string;
  platformId?: string;
};

// The whole SDK is these four services plus two identity strings. It is a
// plain object on purpose — no class, no lifecycle of its own — because
// its job is to be shared, and shared things should be boring.
export type ShellSDK = {
  commands: CommandRegistry;
  context: ContextKeyService;
  events: EventBus;
  instanceId: string;
  platformId: string;
  preferences: PreferencesStore;
};

type Listener = () => void;

type ContextChangeListener = (change: {
  key: string;
  nextValue: ContextValue;
  previousValue: ContextValue;
}) => void;

type CommandActivator = (command: CommandContribution) => Promise<void> | void;

const defaultPlatformId = "app-foundry";
const defaultShellInstanceId = "app-foundry-shell-sdk";

// Collects disposables so a whole scope — an activated app, a registered
// source — can be torn down with one call. The subtle invariant: adding to
// an already-disposed store disposes the newcomer immediately, which closes
// the race where an async activation finishes after its app was switched
// away from.
export class DisposableStore implements Disposable {
  private disposables = new Set<Disposable>();
  private isDisposed = false;

  add<TDisposable extends Disposable>(disposable: TDisposable): TDisposable {
    if (this.isDisposed) {
      disposable.dispose();
      return disposable;
    }

    this.disposables.add(disposable);
    return disposable;
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    const pending = Array.from(this.disposables);
    this.disposables.clear();

    for (const disposable of pending) {
      disposable.dispose();
    }
  }
}

// A flat key/value store that answers one question: "should this command or
// preference be visible right now?" Contributions carry `when` expressions
// — `appActive == 'tasks' && !tasks.readonly` — and this service evaluates
// them against live state. The grammar is deliberately tiny: `&&` clauses,
// `!` negation, `==`/`!=` against a literal, or a bare key for truthiness.
// Anything a product needs beyond that belongs in product code, not here.
export class ContextKeyService {
  private values = new Map<string, ContextValue>();
  private listeners = new Set<ContextChangeListener>();
  private version = 0;

  get<TValue extends ContextValue>(key: string): TValue | undefined {
    return this.values.get(key) as TValue | undefined;
  }

  set(key: string, value: ContextValue) {
    const previousValue = this.values.get(key);

    if (previousValue === value) {
      return;
    }

    // `undefined` is the delete sentinel: a cleared key and a never-set key
    // are indistinguishable, which is what `when` evaluation wants.
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }

    this.version += 1;
    this.emit({ key, nextValue: value, previousValue });
  }

  snapshot(): ContextSnapshot {
    return new Map(this.values);
  }

  snapshotVersion(): number {
    return this.version;
  }

  matches(expression?: string): boolean {
    if (!expression) {
      return true;
    }

    return expression
      .split("&&")
      .map((clause) => clause.trim())
      .every((clause) => this.matchesClause(clause));
  }

  subscribe(listener: ContextChangeListener): Disposable {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  private emit(change: {
    key: string;
    nextValue: ContextValue;
    previousValue: ContextValue;
  }) {
    for (const listener of this.listeners) {
      listener(change);
    }
  }

  private matchesClause(clause: string): boolean {
    if (clause.length === 0) {
      return true;
    }

    // `!key` negates truthiness…
    if (clause.startsWith("!")) {
      const key = clause.slice(1).trim();
      return !Boolean(this.values.get(key));
    }

    // …`key == literal` / `key != literal` compare strictly…
    const match = clause.match(/^([A-Za-z0-9_.:-]+)\s*(==|!=)\s*(.+)$/);

    // …and a bare key is a truthiness test. That is the entire grammar.
    if (!match) {
      return Boolean(this.values.get(clause));
    }

    const key = match[1] ?? "";
    const operator = match[2] ?? "==";
    const expected = parseContextLiteral(match[3] ?? "");
    const actual = this.values.get(key);
    const isEqual = actual === expected;

    return operator === "==" ? isEqual : !isEqual;
  }
}

// The command system's core move is the declare/bind split. `declare` puts
// a command's metadata in the palette immediately; `bind` attaches the
// handler later, usually during app activation. When an unbound command is
// executed, the registry asks its `activator` (installed by `ShellHost`) to
// load and activate the owning app first, then retries the handler lookup.
// The palette therefore shows a product's full capability surface without
// eagerly importing a single app module.
export class CommandRegistry {
  private activator?: CommandActivator;
  private commands = new Map<string, CommandContribution>();
  private handlers = new Map<string, CommandHandler>();
  private history: CommandHistoryEntry[] = [];
  private listeners = new Set<Listener>();
  private declareCount = 0;
  private sourceDisposables = new Map<string, Disposable>();
  private version = 0;

  constructor(private readonly getShell: () => ShellSDK) {}

  // Declaration makes a command searchable and rankable immediately.
  // Duplicate ids throw rather than overwrite — two contributors fighting
  // over one id is a bug worth surfacing at startup, not a race to
  // register last.
  declare(command: CommandContribution): Disposable {
    const normalizedCommand = normalizeCommand(command);

    assertNamespaced(
      normalizedCommand.id,
      normalizedCommand.appId,
      "Command id",
    );

    if (this.commands.has(normalizedCommand.id)) {
      throw new Error(`Command already declared: ${normalizedCommand.id}`);
    }

    this.commands.set(normalizedCommand.id, normalizedCommand);
    this.declareCount += 1;
    this.emit();

    return {
      dispose: () => {
        this.commands.delete(normalizedCommand.id);
        this.handlers.delete(normalizedCommand.id);
        this.emit();
      },
    };
  }

  // Dynamic sources re-register wholesale: a new registration with the same
  // id disposes the previous batch first. Children inherit the parent's
  // ring, source, and category, and default to `paletteHidden` — they are
  // reached by drilling into the parent, not by top-level search.
  registerSource(source: CommandSourceContribution): Disposable {
    this.sourceDisposables.get(source.id)?.dispose();

    const store = new DisposableStore();
    const registerCommand = (
      command: CommandContribution,
      parent?: CommandContribution,
    ) => {
      const normalizedCommand = normalizeCommand({
        ...command,
        appId: command.appId || source.appId,
        category: command.category || source.label,
        parentId: parent?.id ?? command.parentId,
        priority: command.priority ?? source.priority,
        ring: command.ring ?? source.ring,
        sourceId: command.sourceId ?? source.id,
        sourceLabel: command.sourceLabel ?? source.label,
      });

      store.add(this.declare(normalizedCommand));

      if (normalizedCommand.handler) {
        store.add(this.bind(normalizedCommand.id, normalizedCommand.handler));
      }

      // Children inherit identity from their parent and hide from the
      // top-level palette unless they explicitly opt in — they surface by
      // drilling into the parent.
      for (const child of normalizedCommand.children ?? []) {
        registerCommand(
          {
            ...child,
            appId: child.appId || normalizedCommand.appId,
            category: child.category || normalizedCommand.category,
            paletteHidden: child.paletteHidden ?? true,
            ring: child.ring ?? normalizedCommand.ring,
            sourceId: child.sourceId ?? normalizedCommand.sourceId,
            sourceLabel: child.sourceLabel ?? normalizedCommand.sourceLabel,
          },
          normalizedCommand,
        );
      }
    };

    for (const command of source.commands) {
      registerCommand(command);
    }

    const disposable = {
      dispose: () => {
        if (this.sourceDisposables.get(source.id) === disposable) {
          this.sourceDisposables.delete(source.id);
        }

        store.dispose();
      },
    };

    this.sourceDisposables.set(source.id, disposable);
    this.emit();

    return disposable;
  }

  // Binding attaches behavior to an already-declared command — the second
  // half of declare/bind. The disposal guard (`get === handler`) means a
  // stale disposer from a previous activation can never yank a newer
  // binding out from under the current one.
  bind(commandId: string, handler: CommandHandler): Disposable {
    if (!this.commands.has(commandId)) {
      throw new Error(`Cannot bind unknown command: ${commandId}`);
    }

    this.handlers.set(commandId, handler);
    this.emit();

    return {
      dispose: () => {
        if (this.handlers.get(commandId) === handler) {
          this.handlers.delete(commandId);
          this.emit();
        }
      },
    };
  }

  get(commandId: string): CommandContribution | undefined {
    return this.commands.get(commandId);
  }

  // Shortcode lookup backs short links and `#T00000A`-style queries. It is
  // exact-match only, case-insensitive, and tolerant of a leading `#`; when
  // several commands claim one code, the normal priority-then-ring ordering
  // picks the winner deterministically.
  findByShortcode(shortcode: string): CommandContribution | undefined {
    const normalizedShortcode = normalizeShortcodeForMatch(shortcode);

    if (!normalizedShortcode) {
      return undefined;
    }

    return Array.from(this.commands.values())
      .sort(compareCommands)
      .find((command) =>
        command.shortcodes?.some(
          (item) => normalizeShortcodeForMatch(item) === normalizedShortcode,
        ),
      );
  }

  isBound(commandId: string): boolean {
    return this.handlers.has(commandId);
  }

  // Visibility is two gates: the static `paletteHidden` flag (children and
  // internal commands) and the live `when` clause evaluated against
  // context. Everything else about palette order is `compareCommands`.
  paletteItems(context: ContextKeyService): CommandContribution[] {
    return Array.from(this.commands.values())
      .filter(
        (command) => !command.paletteHidden && context.matches(command.when),
      )
      .sort(compareCommands);
  }

  // The palette's main entry point. An empty query is the "just opened"
  // state, so recent history floats to the top with a ring-score bonus;
  // once the user types anything (or picks a prefix mode), recents step
  // aside and pure relevance takes over.
  rankedPaletteItems(
    query: string,
    context: ContextKeyService,
  ): RankedCommandResult[] {
    const { prefix, query: searchQuery } = parseCommandQuery(query);
    const commands = this.paletteItems(context).filter((command) =>
      prefix ? prefix.filter(command) : true,
    );
    const ranked = this.rankCommands(commands, searchQuery, prefix, context);

    if (searchQuery || prefix) {
      return ranked;
    }

    // Recents are re-resolved against the live registry on every read:
    // history entries whose commands were disposed or whose `when` clauses
    // now fail simply vanish, and duplicates collapse to their first
    // (most recent) appearance.
    const recent = this.history
      .map((entry) => this.commands.get(entry.actionId))
      .filter((command): command is CommandContribution =>
        Boolean(
          command && !command.paletteHidden && context.matches(command.when),
        ),
      )
      .filter(
        (command, index, commands) =>
          commands.findIndex((item) => item.id === command.id) === index,
      )
      .map((command) => ({
        command,
        isRecent: true,
        matchRanges: [],
        ringScore: ringScore(command.ring ?? "app") + 10,
        source: commandSourceForCommand(command),
        textScore: 1,
      }));

    return [...recent, ...ranked];
  }

  // The drilled-in view: ranking scoped to one parent's children. Children
  // are usually `paletteHidden`, so this is the only path that surfaces
  // them.
  rankedChildItems(
    parentId: string,
    query: string,
    context: ContextKeyService,
  ): RankedCommandResult[] {
    const parent = this.commands.get(parentId);

    if (!parent) {
      return [];
    }

    const childCommands = (parent.children ?? [])
      .map((child) => this.commands.get(child.id) ?? normalizeCommand(child))
      .filter((command) => context.matches(command.when));
    const { prefix, query: searchQuery } = parseCommandQuery(query);

    return this.rankCommands(
      childCommands.filter((command) =>
        prefix ? prefix.filter(command) : true,
      ),
      searchQuery,
      prefix,
      context,
    );
  }

  prefixModes(): CommandPrefixMode[] {
    return builtInCommandPrefixes;
  }

  // Execution is where lazy activation pays off: no handler yet means the
  // owning app has never run, so the activator loads it and the handler is
  // looked up once more. Pure navigation commands (`route`/`href`, no
  // handler) are legal — the host performs the navigation side.
  async execute(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);

    if (!command) {
      throw new Error(`Unknown command: ${commandId}`);
    }

    let handler = this.handlers.get(commandId);

    // No handler means the owning app has never activated. Ask the host to
    // load it, then look once more — activation should have called `bind`.
    if (!handler && this.activator) {
      await this.activator(command);
      handler = this.handlers.get(commandId);
    }

    // Still nothing is only an error for action commands; pure navigation
    // commands legitimately have no handler and are executed by the host's
    // navigate step instead.
    if (!handler && !command.route && !command.href) {
      throw new Error(`Command has no bound handler: ${commandId}`);
    }

    await handler?.({ command, shell: this.getShell() });
    this.recordHistory(command);
  }

  // One activator, installed by `ShellHost` at construction: given an
  // unbound command, load and activate the app that owns it. Registries
  // without a host (tests, servers) simply have no lazy-activation path.
  setActivator(activator: CommandActivator): Disposable {
    this.activator = activator;

    return {
      dispose: () => {
        if (this.activator === activator) {
          this.activator = undefined;
        }
      },
    };
  }

  subscribe(listener: Listener): Disposable {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  // Plain counters for tests and support tooling — cheap to read, safe to
  // log, and enough to answer "did disposal actually clean up?"
  debugSnapshot() {
    return {
      boundHandlers: this.handlers.size,
      declaredCommands: this.commands.size,
      declareCalls: this.declareCount,
      dynamicSources: this.sourceDisposables.size,
      historyEntries: this.history.length,
    };
  }

  snapshotVersion(): number {
    return this.version;
  }

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private rankCommands(
    commands: CommandContribution[],
    query: string,
    prefix: CommandPrefixMode | undefined,
    context: ContextKeyService,
  ): RankedCommandResult[] {
    return commands
      .filter((command) => context.matches(command.when))
      .map((command) => {
        const match = fuzzyCommandMatch(command, query);

        return {
          command,
          isRecent: false,
          matchRanges: match.ranges,
          prefix,
          ringScore: ringScore(command.ring ?? "app"),
          source: commandSourceForCommand(command),
          textScore: match.score,
        };
      })
      .filter((result) => query.length === 0 || result.textScore > 0)
      .sort(compareRankedCommands);
  }

  // History is tiny on purpose — five entries, newest first, one per
  // command id. It exists to make the empty palette useful, not to be an
  // audit log.
  private recordHistory(command: CommandContribution) {
    this.history = [
      {
        actionId: command.id,
        actionLabel: command.title,
        actionUrl: command.route ?? command.href,
        icon: command.icon,
        invokedAt: Date.now(),
        ring: command.ring ?? "app",
        scope: command.sourceId ?? command.appId,
      },
      ...this.history.filter((entry) => entry.actionId !== command.id),
    ].slice(0, 5);
    this.emit();
  }
}

// An immutable read view over both value layers. Within any single ring,
// a user's explicit choice always beats a contributed seed value — that
// single line in `get` is the whole "your settings survive product
// defaults" guarantee.
export class PreferenceSnapshot {
  private seedValues: ReadonlyMap<string, PreferenceValueRecord>;
  private userValues: ReadonlyMap<string, PreferenceValueRecord>;

  constructor({
    seedValues,
    userValues,
  }: {
    seedValues?: ReadonlyMap<string, PreferenceValueRecord>;
    userValues?: ReadonlyMap<string, PreferenceValueRecord>;
  } = {}) {
    this.seedValues = seedValues ?? new Map();
    this.userValues = userValues ?? new Map();
  }

  get(
    ring: PreferenceRing,
    scope: string,
    key: string,
  ): PreferenceValueRecord | null {
    const id = preferenceRecordId(ring, scope, key);
    return this.userValues.get(id) ?? this.seedValues.get(id) ?? null;
  }
}

// Resolution is a walk from the most specific ring outward: feature, then
// app, then product, then platform, falling back to the schema default.
// The first ring with a stored value wins. Exported as a pure function so
// tests and server code can resolve against any snapshot without standing
// up a store.
export function resolvePreference(
  snapshot: PreferenceSnapshot,
  schema: PreferenceSchema,
  context: RingContext,
  platformId = defaultPlatformId,
): ResolvedPreference {
  const normalizedSchema = normalizePreferenceSchema(schema, platformId);

  // Most specific ring first — a feature's stored value beats its app's,
  // which beats the product's, which beats the platform's.
  const rings = [
    { ring: "feature", scope: context.feature },
    { ring: "app", scope: context.app },
    { ring: "product", scope: context.product },
    { ring: "platform", scope: context.platform ?? platformId },
  ] as const;

  for (const { ring, scope } of rings) {
    if (!scope) {
      continue;
    }

    const stored = snapshot.get(ring, scope, schema.key);

    if (stored) {
      const migrated = migratePreferenceValue(stored.value, schema);
      const source = {
        ring,
        scope,
        layer: stored.layer,
      };

      return {
        key: schema.key,
        schema,
        value: migrated,
        source,
        scope: stored.layer === "user" ? "user" : ring,
        isDefault: false,
        isInherited: context.currentRing
          ? ring !== context.currentRing
          : ring !== normalizedSchema.ring,
        hasUserOverride: stored.layer === "user",
        layers: {},
      };
    }
  }

  // No ring spoke: the schema's own default answers, and the result says
  // so honestly (`isDefault`) instead of pretending a ring supplied it.
  return {
    key: schema.key,
    schema,
    value: normalizedSchema.defaultValue,
    source: {
      ring: "default",
      scope: normalizedSchema.scope,
    },
    scope: "default",
    isDefault: true,
    isInherited: true,
    hasUserOverride: false,
    layers: {},
  };
}

// The writable side of preferences. Schemas declare what exists (typed,
// namespaced `app.key` ids, enum options, migrations); values live in two
// layers — `seed` values contributed by manifests and products, and `user`
// values set from settings UI. Keeping the layers separate is what lets
// "Reset" mean "remove my override" instead of "hope the old default was
// saved somewhere".
export class PreferencesStore {
  private listeners = new Set<Listener>();
  private schemas = new Map<string, PreferenceSchema>();
  private schemaDeclareCount = 0;
  private seedValues = new Map<string, PreferenceValueRecord>();
  private userValues = new Map<string, PreferenceValueRecord>();
  private version = 0;

  constructor(private readonly platformId = defaultPlatformId) {}

  declare(schema: PreferenceSchema): Disposable {
    const normalizedSchema = normalizePreferenceSchema(schema, this.platformId);
    assertNamespaced(
      normalizedSchema.key,
      normalizedSchema.appId,
      "Preference key",
    );

    if (this.schemas.has(normalizedSchema.key)) {
      throw new Error(`Preference already declared: ${normalizedSchema.key}`);
    }

    this.schemas.set(normalizedSchema.key, normalizedSchema);
    this.schemaDeclareCount += 1;
    this.emit();

    return {
      dispose: () => {
        this.schemas.delete(normalizedSchema.key);
        this.deleteValuesForKey(normalizedSchema.key);
        this.emit();
      },
    };
  }

  // Seed contributions are reversible like everything else: disposing one
  // restores whatever seed value it displaced, so app registration and
  // disposal round-trip cleanly even when two contributors touched the
  // same key.
  contributeValue(
    key: string,
    value: PreferenceValue,
    scope: Exclude<PreferenceScope, "default" | "user">,
  ): Disposable {
    const target = this.valueTargetForKey(key, scope);
    const recordId = preferenceRecordId(target.ring, target.scope, key);
    const hadPreviousValue = this.seedValues.has(recordId);
    const previousValue = this.seedValues.get(recordId);

    this.validateValue(key, value);
    this.seedValues.set(recordId, {
      key,
      ring: target.ring,
      scope: target.scope,
      value,
      layer: "seed",
      schemaVersion: this.schemas.get(key)?.schemaVersion,
    });
    this.emit();

    return {
      dispose: () => {
        if (hadPreviousValue && previousValue) {
          this.seedValues.set(recordId, previousValue);
        } else {
          this.seedValues.delete(recordId);
        }

        this.emit();
      },
    };
  }

  // `set` writes the user layer; passing `"user"` targets the schema's own
  // ring, while naming a ring writes a user value at that ring instead.
  // Validation runs before the write, so an enum can never store a value
  // its options do not list.
  set(
    key: string,
    value: PreferenceValue,
    scope: Exclude<PreferenceScope, "default">,
  ) {
    const target = this.valueTargetForKey(
      key,
      scope === "user" ? undefined : scope,
    );
    this.validateValue(key, value);
    this.userValues.set(preferenceRecordId(target.ring, target.scope, key), {
      key,
      ring: target.ring,
      scope: target.scope,
      value,
      layer: "user",
      schemaVersion: this.schemas.get(key)?.schemaVersion,
    });
    this.emit();
  }

  // Reset deletes only the user record — the seed value underneath (if
  // any) becomes visible again. "Back to default" is really "back to
  // whatever the rings say without me".
  reset(key: string, scope: Exclude<PreferenceScope, "default">) {
    const target = this.valueTargetForKey(
      key,
      scope === "user" ? undefined : scope,
    );
    this.userValues.delete(preferenceRecordId(target.ring, target.scope, key));
    this.emit();
  }

  inspect(key: string): PreferenceInspection {
    const schema = this.schemas.get(key);

    if (!schema) {
      return {
        key,
        source: { ring: "default", scope: "unknown" },
        scope: "default",
        isDefault: true,
        isInherited: true,
        hasUserOverride: false,
        layers: {},
      };
    }

    return this.inspectWithContext(
      key,
      contextForSchema(schema, this.platformId),
    );
  }

  // Inspection powers settings UI: beyond the resolved value it reports
  // which ring supplied it, whether it is inherited from a wider ring,
  // whether a user override exists, and the per-ring values — enough to
  // render VS Code-style "modified elsewhere" affordances.
  inspectWithContext(key: string, context: RingContext): PreferenceInspection {
    const schema = this.schemas.get(key);

    if (!schema) {
      return {
        key,
        source: { ring: "default", scope: "unknown" },
        scope: "default",
        isDefault: true,
        isInherited: true,
        hasUserOverride: false,
        layers: {},
      };
    }

    const snapshot = this.snapshot();
    const resolved = resolvePreference(
      snapshot,
      schema,
      context,
      this.platformId,
    );
    const layers = this.layersForKey(key, context, schema);
    const userTarget = this.valueTargetForKey(key);
    const hasUserOverride = this.userValues.has(
      preferenceRecordId(userTarget.ring, userTarget.scope, key),
    );

    return {
      ...resolved,
      key,
      schema,
      scope: resolved.source.layer === "user" ? "user" : resolved.scope,
      hasUserOverride,
      layers,
    };
  }

  snapshot(): PreferenceSnapshot {
    return new PreferenceSnapshot({
      seedValues: this.seedValues,
      userValues: this.userValues,
    });
  }

  // Settings UI is generated from declarations: schemas that pass their
  // `when` clause are bucketed by `ring:scope:category`, and each bucket
  // becomes one card in the preferences panel, settings alphabetized.
  settingsGroups(context: ContextKeyService): SettingsGroup[] {
    const groups = new Map<string, SettingsGroup>();

    for (const schema of this.schemas.values()) {
      if (!context.matches(schema.when)) {
        continue;
      }

      const normalizedSchema = normalizePreferenceSchema(
        schema,
        this.platformId,
      );
      const id = `${normalizedSchema.ring}:${normalizedSchema.scope}:${normalizedSchema.category}`;
      const existingGroup = groups.get(id);

      if (existingGroup) {
        existingGroup.settings.push(schema);
      } else {
        groups.set(id, {
          id,
          appId: schema.appId,
          category: schema.category,
          featureId: schema.featureId,
          label: schema.category,
          ring: normalizedSchema.ring,
          scope: normalizedSchema.scope,
          settings: [schema],
        });
      }
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      settings: group.settings.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }

  subscribe(listener: Listener): Disposable {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  debugSnapshot() {
    return {
      declaredPreferences: this.schemas.size,
      seedValues: this.seedValues.size,
      schemaDeclareCalls: this.schemaDeclareCount,
      userValues: this.userValues.size,
    };
  }

  snapshotVersion(): number {
    return this.version;
  }

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private deleteValuesForKey(key: string) {
    for (const recordId of this.seedValues.keys()) {
      if (recordId.endsWith(`:${key}`)) {
        this.seedValues.delete(recordId);
      }
    }

    for (const recordId of this.userValues.keys()) {
      if (recordId.endsWith(`:${key}`)) {
        this.userValues.delete(recordId);
      }
    }
  }

  // The inspector's cascade view: walk outermost-in (platform toward
  // feature) collecting each ring's stored value, surfacing the user layer
  // separately when it is the one that won.
  private layersForKey(
    key: string,
    context: RingContext,
    schema: PreferenceSchema,
  ): PreferenceInspection["layers"] {
    const layers: PreferenceInspection["layers"] = {
      default: schema.defaultValue,
    };
    const rings = [
      { ring: "platform", scope: context.platform ?? this.platformId },
      { ring: "product", scope: context.product },
      { ring: "app", scope: context.app },
      { ring: "feature", scope: context.feature },
    ] as const;

    for (const { ring, scope } of rings) {
      if (!scope) {
        continue;
      }

      const record = this.snapshot().get(ring, scope, key);

      if (!record) {
        continue;
      }

      layers[ring] = record.value;

      if (record.layer === "user") {
        layers.user = record.value;
      }
    }

    return layers;
  }

  private valueTargetForKey(
    key: string,
    ringOverride?: Exclude<PreferenceScope, "default" | "user">,
  ): { ring: PreferenceRing; scope: string } {
    const schema = this.schemas.get(key);

    if (!schema) {
      throw new Error(`Unknown preference: ${key}`);
    }

    const normalizedSchema = normalizePreferenceSchema(schema, this.platformId);
    const ring = ringOverride ?? normalizedSchema.ring;

    return {
      ring,
      scope: scopeForRing(normalizedSchema, ring, this.platformId),
    };
  }

  // The write-side type gate: enums check membership in `options`,
  // everything else checks `typeof` against the declared type. Throwing
  // here keeps bad values out of storage entirely instead of sanitizing
  // them on the way back out.
  private validateValue(key: string, value: PreferenceValue) {
    const schema = this.schemas.get(key);

    if (!schema) {
      throw new Error(`Unknown preference: ${key}`);
    }

    if (schema.type === "enum") {
      const allowedValues = schema.options?.map((option) => option.value) ?? [];

      if (!allowedValues.includes(value)) {
        throw new Error(
          `Preference ${key} does not allow value ${String(value)}`,
        );
      }

      return;
    }

    if (typeof value !== schema.type) {
      throw new Error(
        `Preference ${key} expects ${schema.type}; received ${typeof value}`,
      );
    }
  }
}

// Deliberately minimal pub/sub: typed payloads, timestamps, no wildcard
// subscriptions, no replay. Apps that need durable messaging should use
// product infrastructure; this bus is for "the shell should react to what
// just happened" moments like toasts and activity feeds.
export class EventBus {
  private listeners = new Map<string, Set<(event: ShellEvent) => void>>();

  emit<TPayload>(type: string, payload: TPayload) {
    const event: ShellEvent<TPayload> = {
      type,
      payload,
      timestamp: Date.now(),
    };
    const listeners = this.listeners.get(type);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  on<TPayload>(
    type: string,
    listener: (event: ShellEvent<TPayload>) => void,
  ): Disposable {
    const listeners =
      this.listeners.get(type) ?? new Set<(event: ShellEvent) => void>();
    const wrapped = listener as (event: ShellEvent) => void;

    listeners.add(wrapped);
    this.listeners.set(type, listeners);

    return {
      dispose: () => {
        listeners.delete(wrapped);

        if (listeners.size === 0) {
          this.listeners.delete(type);
        }
      },
    };
  }
}

// Micro-app architectures ship modules independently, which means two
// copies of this file can end up loaded at once — one bundled with the
// host, one with an app. If each copy had its own SDK, commands would
// register into a registry nobody reads. Stashing the singleton on
// `globalThis` makes every copy resolve to the same instance; the import
// map's `@app-foundry/sdk` pin exists for the same reason.
type ShellGlobal = typeof globalThis & {
  __appFoundryShellSdk?: ShellSDK;
  /** @deprecated App Foundry keeps this alias during the AstryxKit 0.x migration. */
  __astryxkitShellSdk?: ShellSDK;
};

// `CommandRegistry` needs a back-reference to the SDK that owns it (for
// handler execution contexts), so construction threads a lazy `getShell`
// through instead of a value that does not exist yet.
export function createShellSDK(options: ShellSDKOptions = {}): ShellSDK {
  const platformId = options.platformId ?? defaultPlatformId;
  let sdk = undefined as ShellSDK | undefined;
  const commands = new CommandRegistry(() => {
    if (!sdk) {
      throw new Error("Shell SDK is not initialized.");
    }

    return sdk;
  });

  sdk = {
    commands,
    context: new ContextKeyService(),
    events: new EventBus(),
    instanceId: options.instanceId ?? defaultShellInstanceId,
    platformId,
    preferences: new PreferencesStore(platformId),
  };

  return sdk;
}

// `shell()` is get-or-create and safe to call from anywhere; `configureShell`
// force-replaces the singleton and belongs only at host startup;
// `resetShellForTests` is the same operation under an honest name.
export function shell(options: ShellSDKOptions = {}): ShellSDK {
  const globalScope = globalThis as ShellGlobal;

  if (!globalScope.__appFoundryShellSdk) {
    globalScope.__appFoundryShellSdk =
      globalScope.__astryxkitShellSdk ?? createShellSDK(options);
  }

  globalScope.__astryxkitShellSdk = globalScope.__appFoundryShellSdk;
  return globalScope.__appFoundryShellSdk;
}

export function configureShell(options: ShellSDKOptions = {}): ShellSDK {
  const globalScope = globalThis as ShellGlobal;
  const sdk = createShellSDK(options);
  globalScope.__appFoundryShellSdk = sdk;
  globalScope.__astryxkitShellSdk = sdk;
  return sdk;
}

export function resetShellForTests(options: ShellSDKOptions = {}): ShellSDK {
  return configureShell(options);
}

export function assertSingleShellInstance(candidate: ShellSDK = shell()) {
  if (candidate !== shell()) {
    throw new Error("A second shell SDK instance was detected.");
  }
}

// Command ids and preference keys must start with their owning `appId.` —
// enforced at declaration time so collisions surface as loud errors during
// development, not as two apps silently fighting over one key.
function assertNamespaced(value: string, appId: string, label: string) {
  if (!value.startsWith(`${appId}.`)) {
    throw new Error(`${label} must be namespaced with ${appId}.`);
  }
}

// Palette prefix modes reserve one mental model per sigil, following the
// editor-palette tradition: `>` runs actions, `/` goes to pages, `@` finds
// entities, `?` searches help. Typing a sigil narrows the candidate set
// before any text matching happens.
const builtInCommandPrefixes: CommandPrefixMode[] = [
  {
    filter: (command) => commandKind(command) === "action",
    icon: "wrench",
    label: "Actions",
    placeholder: "Search actions",
    prefix: ">",
  },
  {
    filter: (command) => commandKind(command) === "page",
    icon: "externalLink",
    label: "Pages",
    placeholder: "Go to page",
    prefix: "/",
  },
  {
    filter: (command) => commandKind(command) === "entity",
    icon: "search",
    label: "Entities",
    placeholder: "Search entities",
    prefix: "@",
  },
  {
    filter: () => true,
    icon: "check",
    label: "Help",
    placeholder: "Search help",
    prefix: "?",
  },
];

// Normalization fills every inferable field at declaration time — ring
// from `featureId` or the reserved `platform`/`product` app ids, kind from
// the shape (`entity` beats `route`/`href` beats plain action), deduped
// shortcodes — so ranking and rendering never re-derive them per keystroke.
function normalizeCommand(command: CommandContribution): CommandContribution {
  const ring =
    command.ring ??
    (command.featureId ? "feature" : defaultCommandRing(command));
  const kind = command.kind ?? commandKind({ ...command, ring });
  const shortcodes = normalizeShortcodes(command.shortcodes);

  return {
    ...command,
    childCount: command.childCount ?? command.children?.length,
    kind,
    ring,
    section: command.section ?? command.category,
    shortcodes,
    sourceId: command.sourceId ?? `${ring}:${command.appId}`,
    sourceLabel: command.sourceLabel ?? command.category,
  };
}

// Shortcodes dedupe case-insensitively but keep their display casing —
// `T00000A` and `#t00000a` are one code, shown the way the app wrote it.
function normalizeShortcodes(
  shortcodes: string[] | undefined,
): string[] | undefined {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const shortcode of shortcodes ?? []) {
    const trimmed = shortcode.trim();
    const key = normalizeShortcodeForMatch(trimmed);

    if (!trimmed || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeShortcodeForMatch(shortcode: string): string {
  return shortcode.trim().replace(/^#/, "").toLowerCase();
}

// `platform` and `product` are reserved app ids that map straight to their
// rings; every real app defaults to the `app` ring unless it says
// otherwise.
function defaultCommandRing(command: CommandContribution): CommandRing {
  if (command.appId === "platform") {
    return "platform";
  }

  if (command.appId === "product") {
    return "product";
  }

  return "app";
}

// Kind inference follows the shape of the contribution: an `entity` makes
// it an entity, a `route`/`href` makes it a page, and anything left is an
// action. Kinds matter because the palette's prefix modes filter on them.
function commandKind(command: CommandContribution): CommandKind {
  if (command.kind) {
    return command.kind;
  }

  if (command.entity) {
    return "entity";
  }

  if (command.route || command.href) {
    return "page";
  }

  return "action";
}

// Splits a raw palette query into an optional sigil mode and the text to
// match — `">dep"` becomes the Actions filter plus `"dep"`.
function parseCommandQuery(query: string): {
  prefix?: CommandPrefixMode;
  query: string;
} {
  const trimmed = query.trimStart();
  const prefix = builtInCommandPrefixes.find((mode) =>
    trimmed.startsWith(mode.prefix),
  );

  if (!prefix) {
    return { query: query.trim() };
  }

  return {
    prefix,
    query: trimmed.slice(prefix.prefix.length).trim(),
  };
}

function commandSourceForCommand(command: CommandContribution) {
  const ring = command.ring ?? "app";

  return {
    id: command.sourceId ?? `${ring}:${command.appId}`,
    label: command.sourceLabel ?? command.category,
    ring,
  };
}

// Specificity order for ranking: feature > app > product > platform. The
// closer a command sits to what the user is doing, the earlier it sorts.
function ringScore(ring: CommandRing): number {
  if (ring === "feature") {
    return 4;
  }

  if (ring === "app") {
    return 3;
  }

  if (ring === "product") {
    return 2;
  }

  return 1;
}

// Text relevance is a ladder of match qualities, each tier scoring above
// the whole tier below it: exact shortcode (1500), shortcode prefix
// (~1200), substring of the title (1000 minus position), word-start (750),
// spread subsequence (~450, contiguity-weighted), and finally a substring
// anywhere in ids, keywords, or descriptions (300). Match ranges come back
// with the score so the palette can underline exactly what matched.
function fuzzyCommandMatch(
  command: CommandContribution,
  query: string,
): { ranges: Array<[number, number]>; score: number } {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedShortcodeQuery = normalizeShortcodeForMatch(query);

  if (!normalizedQuery) {
    return {
      ranges: [],
      score: 1,
    };
  }

  // Tier 1 — shortcodes. Typing a record id should feel like a jump, so an
  // exact or prefix shortcode hit outranks every text match.
  const shortcodeScore = scoreShortcodeMatch(command, normalizedShortcodeQuery);

  if (shortcodeScore > 0) {
    return {
      ranges: [],
      score: shortcodeScore,
    };
  }

  // Tier 2 — the query appears verbatim in the title; earlier is better,
  // and the matched range comes back for underlining.
  const label = command.title;
  const labelLower = label.toLowerCase();
  const exactIndex = labelLower.indexOf(normalizedQuery);

  if (exactIndex >= 0) {
    return {
      ranges: [[exactIndex, exactIndex + normalizedQuery.length]],
      score: 1000 - exactIndex,
    };
  }

  // Tier 3 — some word in the title starts with the query ("cat" finding
  // "Open Catalog").
  const wordStartIndex = labelLower
    .split(/\s+/)
    .findIndex((word) => word.startsWith(normalizedQuery));

  if (wordStartIndex >= 0) {
    return {
      ranges: [],
      score: 750,
    };
  }

  // Tier 4 — scattered-but-ordered characters, weighted toward tight runs.
  const subsequence = scoreSubsequence(labelLower, normalizedQuery);

  if (subsequence.score > 0) {
    return subsequence;
  }

  // Tier 5 — last resort: a substring hit anywhere in the id, category,
  // description, keywords, or shortcodes.
  const keywordText = [
    command.id,
    command.appId,
    command.category,
    command.description,
    command.entity?.label,
    ...(command.keywords ?? []),
    ...(command.shortcodes ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (keywordText.includes(normalizedQuery)) {
    return {
      ranges: [],
      score: 300,
    };
  }

  return {
    ranges: [],
    score: 0,
  };
}

function scoreShortcodeMatch(
  command: CommandContribution,
  normalizedQuery: string,
): number {
  if (!normalizedQuery) {
    return 0;
  }

  for (const shortcode of command.shortcodes ?? []) {
    const normalizedShortcode = normalizeShortcodeForMatch(shortcode);

    if (normalizedShortcode === normalizedQuery) {
      return 1500;
    }

    if (normalizedShortcode.startsWith(normalizedQuery)) {
      return (
        1200 -
        Math.min(normalizedShortcode.length - normalizedQuery.length, 100)
      );
    }
  }

  return 0;
}

// Classic fuzzy scoring: every query character must appear in order, and
// the score rewards long contiguous runs while penalizing how far the
// match spreads across the title — "tsk" should light up "Tasks", not a
// scattering across three words.
function scoreSubsequence(
  value: string,
  query: string,
): { ranges: Array<[number, number]>; score: number } {
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let previousMatch = -2;
  let contiguousRun = 0;
  let bestRun = 0;
  const ranges: Array<[number, number]> = [];

  for (
    let index = 0;
    index < value.length && queryIndex < query.length;
    index += 1
  ) {
    if (value[index] !== query[queryIndex]) {
      continue;
    }

    if (firstMatch === -1) {
      firstMatch = index;
    }

    if (previousMatch === index - 1) {
      contiguousRun += 1;
    } else {
      contiguousRun = 1;
    }

    bestRun = Math.max(bestRun, contiguousRun);
    lastMatch = index;
    previousMatch = index;
    queryIndex += 1;
    ranges.push([index, index + 1]);
  }

  // Every query character must have matched, in order, or it is no match
  // at all.
  if (queryIndex !== query.length || firstMatch < 0) {
    return {
      ranges: [],
      score: 0,
    };
  }

  // The formula in words: a base worth less than a word-start match, plus
  // a bonus for the longest contiguous run, minus how far the match
  // sprawls across the title.
  return {
    ranges,
    score: 450 + bestRun * 12 - (lastMatch - firstMatch),
  };
}

// Schemas may omit ring and scope; normalization derives them — a
// `featureId` implies the feature ring, and `scopeForRing` picks the
// storage scope (`platformId`, product id, `app.feature`, or the app id).
// Stored records key on `ring:scope:key`, so this derivation *is* the
// storage layout.
function normalizePreferenceSchema(
  schema: PreferenceSchema,
  platformId: string,
): PreferenceSchema & {
  ring: PreferenceRing;
  scope: string;
} {
  const ring = schema.ring ?? (schema.featureId ? "feature" : "app");

  return {
    ...schema,
    ring,
    scope: schema.scope ?? scopeForRing(schema, ring, platformId),
  };
}

function contextForSchema(
  schema: PreferenceSchema,
  platformId: string,
): RingContext {
  const normalizedSchema = normalizePreferenceSchema(schema, platformId);

  return {
    platform: platformId,
    product: schema.productId,
    app: schema.appId,
    feature: schema.featureId
      ? `${schema.appId}.${schema.featureId}`
      : undefined,
    currentRing: normalizedSchema.ring,
  };
}

function scopeForRing(
  schema: PreferenceSchema,
  ring: PreferenceRing,
  platformId: string,
): string {
  if (ring === "platform") {
    return platformId;
  }

  if (ring === "product") {
    return schema.productId ?? "workspace";
  }

  if (ring === "feature") {
    return schema.featureId
      ? `${schema.appId}.${schema.featureId}`
      : schema.appId;
  }

  return schema.appId;
}

function preferenceRecordId(
  ring: PreferenceRing,
  scope: string,
  key: string,
): string {
  return `${ring}:${scope}:${key}`;
}

// Schemas can rename stored values over time (`"cozy" -> "comfortable"`)
// via a `migrations` map; stored values pass through it on every read, so
// old persisted data keeps working without a write-time migration pass.
function migratePreferenceValue(
  value: PreferenceValue,
  schema: PreferenceSchema,
): PreferenceValue {
  if (!schema.migrations) {
    return value;
  }

  return schema.migrations[String(value)] ?? value;
}

// Right-hand sides of `when` comparisons coerce the way an author would
// expect: quoted strings stay strings, `true`/`false`/`null` become
// themselves, bare numbers become numbers, and anything else is a string.
function parseContextLiteral(raw: string): ContextValue {
  const value = raw.trim();

  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "null") {
    return null;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric) && value !== "") {
    return numeric;
  }

  return value;
}

function compareCommands(
  first: CommandContribution,
  second: CommandContribution,
): number {
  return (
    (second.priority ?? 0) - (first.priority ?? 0) ||
    ringScore(second.ring ?? "app") - ringScore(first.ring ?? "app") ||
    first.title.localeCompare(second.title)
  );
}

// Sort key order encodes the ranking philosophy: context specificity
// (ring) beats text relevance, relevance beats declared priority, and an
// alphabetical tiebreak keeps the list stable between renders.
function compareRankedCommands(
  first: RankedCommandResult,
  second: RankedCommandResult,
): number {
  return (
    second.ringScore - first.ringScore ||
    second.textScore - first.textScore ||
    (second.command.priority ?? 0) - (first.command.priority ?? 0) ||
    first.command.title.localeCompare(second.command.title)
  );
}
