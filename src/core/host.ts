// If the shell SDK is the nervous system, `ShellHost` is the spine: it
// holds the manifest catalog, decides which single app is active, and
// guarantees that everything an app contributed while active — commands,
// handlers, nav mounts, subscriptions — is disposed the moment it stops
// being active. One app at a time is a deliberate constraint; it keeps
// "who owns the current surface" answerable at every moment.

import type { ReactNode } from "react";
import {
  buildWorkspaceEntityIndex,
  type WorkspaceEntityIndex,
  type WorkspaceEntityKind,
  type WorkspaceEntitySource,
} from "./entities.js";
import {
  DisposableStore,
  assertSingleShellInstance,
  shell,
  type CommandContribution,
  type CommandSourceContribution,
  type Disposable,
  type PreferenceRing,
  type PreferenceSchema,
  type PreferenceValue,
  type RankedCommandResult,
  type SettingsGroup,
  type ShellEvent,
  type ShellSDK,
} from "./shell-sdk.js";

// The two context objects every app render receives: which workspace the
// user is in, and which route the shell matched to mount the app. Kept
// deliberately thin — tenancy, membership, and permissions are host
// product data, not shell data.
export type WorkspaceContext = {
  name: string;
  slug: string;
};

export type MicroAppRoute = {
  pathname: string;
  slug: string;
};

// A feature is a named toggle bound to a context key: flipping it through
// `setFeatureEnabled` re-evaluates every `when` clause that mentions the
// key, so commands and preferences appear and disappear with the feature.
export type ShellFeatureContribution = {
  id: string;
  label: string;
  contextKey: string;
  description?: string;
};

export type ShellPreferenceDefault = {
  key: string;
  ring: PreferenceRing;
  value: PreferenceValue;
};

// The manifest is the contract an app signs before any of its code loads:
// identity and routing (`id`, `route`, `entryUrl`), declared-up-front
// contributions (`commands`, `preferences`, `entitySources`, `features`),
// and one lazy `load()` that resolves the real module on first activation.
// Everything the shell renders pre-activation comes from this object.
export type ShellAppManifest = {
  id: string;
  name: string;
  entryUrl: string;
  ownerTeam: string;
  route: string;
  commands: CommandContribution[];
  description?: string;
  entitySources?: WorkspaceEntitySource[];
  features?: ShellFeatureContribution[];
  icon?: string;
  load: () => Promise<ShellAppModule>;
  preferenceDefaults?: ShellPreferenceDefault[];
  preferences?: PreferenceSchema[];
};

// Nav mounts let the active app project UI into chrome the host owns —
// a presence indicator in the top nav, a filter tree in the side nav —
// without owning the frame. Mounts registered with an `appId` are removed
// automatically on deactivation, so chrome can never leak across apps.
export type ShellTopNavMountArea = "header" | "start" | "center" | "end";

export type ShellTopNavMountContribution = {
  area: ShellTopNavMountArea;
  content: ReactNode;
  id: string;
  appId?: string;
  order?: number;
};

export type ShellSideNavMountContribution = {
  content: ReactNode;
  id: string;
  appId?: string;
  order?: number;
};

export type ShellAppRenderProps = {
  host: ShellHost;
  manifest: ShellAppManifest;
  route: MicroAppRoute;
  shell: ShellSDK;
  workspace: WorkspaceContext;
  navigate: (href: string) => void;
};

export type ShellAppInstance = Disposable & {
  render?: (props: ShellAppRenderProps) => ReactNode;
};

// What `manifest.load()` must resolve to: a module with one `activate`
// function. Activation receives the host, the shared SDK, and
// `disposeWithApp` — the hook that ties every handler and subscription the
// app makes to its own lifetime.
export type ShellAppModule = {
  activate: (
    context: ShellAppActivationContext,
  ) => Promise<ShellAppInstance> | ShellAppInstance;
};

export type ShellAppActivationContext = {
  app: ShellAppManifest;
  disposeWithApp: <TDisposable extends Disposable>(
    disposable: TDisposable,
  ) => TDisposable;
  host: ShellHost;
  shell: ShellSDK;
};

export type ShellHostOptions = {
  defaultDocsRoute?: string;
  eventTypes?: string[];
  includeDefaultPlatformCommands?: boolean;
  navigate?: (href: string) => void;
  preferencesRoute?: string;
  shell?: ShellSDK;
};

export type ActiveShellApp = {
  instance: ShellAppInstance;
  manifest: ShellAppManifest;
  store: DisposableStore;
};

type HostListener = () => void;

export class ShellHost implements Disposable {
  private active?: ActiveShellApp;
  private listeners = new Set<HostListener>();
  private manifests = new Map<string, ShellAppManifest>();
  private navigateImpl: (href: string) => void;
  private registrations = new DisposableStore();
  private readonly shellSdk: ShellSDK;
  private readonly hostEvents: ShellEvent[] = [];
  private readonly topNavMountsById = new Map<
    string,
    ShellTopNavMountContribution
  >();
  private readonly sideNavMountsById = new Map<
    string,
    ShellSideNavMountContribution
  >();
  private readonly entitySourcesById = new Map<
    string,
    WorkspaceEntitySource
  >();
  private version = 0;

  // Construction wires the host into the SDK: it installs itself as the
  // command activator (lazy activation), re-emits on every service change
  // so one subscription covers all shell state, captures the event types
  // the product cares about into a newest-first feed, and contributes the
  // default platform commands unless the host opts out.
  constructor(options: ShellHostOptions = {}) {
    this.shellSdk = options.shell ?? shell();
    if (!options.shell) {
      assertSingleShellInstance(this.shellSdk);
    }
    this.navigateImpl = options.navigate ?? defaultNavigate;
    this.registrations.add(
      this.shellSdk.commands.setActivator(async (command) => {
        if (this.manifests.has(command.appId)) {
          await this.activate(command.appId);
        }
      }),
    );
    this.registrations.add(this.shellSdk.commands.subscribe(() => this.emit()));
    this.registrations.add(
      this.shellSdk.preferences.subscribe(() => this.emit()),
    );
    this.registrations.add(this.shellSdk.context.subscribe(() => this.emit()));

    for (const eventType of options.eventTypes ?? []) {
      this.registrations.add(
        this.shellSdk.events.on(eventType, (event) => {
          this.hostEvents.unshift(event);
          this.emit();
        }),
      );
    }

    if (options.includeDefaultPlatformCommands !== false) {
      this.registrations.add(
        this.shellSdk.commands.registerSource(
          createPlatformCommandSource({
            docsRoute: options.defaultDocsRoute,
            preferencesRoute: options.preferencesRoute,
          }),
        ),
      );
    }
  }

  // Registration is declaration, not activation: commands, preference
  // schemas, seed defaults, and entity sources all land immediately so the
  // palette, settings, and mention surfaces are complete — while `load()`
  // stays untouched. The returned disposable unwinds every one of those
  // contributions and deactivates the app if it happens to be running.
  register(manifest: ShellAppManifest): Disposable {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Micro-app already registered: ${manifest.id}`);
    }

    const store = new DisposableStore();
    this.manifests.set(manifest.id, manifest);

    for (const command of manifest.commands) {
      store.add(this.shellSdk.commands.declare(command));
    }

    for (const preference of manifest.preferences ?? []) {
      store.add(this.shellSdk.preferences.declare(preference));
    }

    for (const preferenceDefault of manifest.preferenceDefaults ?? []) {
      store.add(
        this.shellSdk.preferences.contributeValue(
          preferenceDefault.key,
          preferenceDefault.value,
          preferenceDefault.ring,
        ),
      );
    }

    for (const entitySource of manifest.entitySources ?? []) {
      store.add(this.registerEntitySource(entitySource));
    }

    this.emit();

    return {
      dispose: () => {
        if (this.active?.manifest.id === manifest.id) {
          this.deactivate(manifest.id);
        }

        store.dispose();
        this.manifests.delete(manifest.id);
        this.emit();
      },
    };
  }

  registerAll(manifests: ShellAppManifest[]): Disposable {
    const store = new DisposableStore();

    for (const manifest of manifests) {
      store.add(this.register(manifest));
    }

    return store;
  }

  setNavigate(navigate: (href: string) => void) {
    this.navigateImpl = navigate;
  }

  navigate(href: string) {
    this.navigateImpl(href);
  }

  getManifest(appId: string): ShellAppManifest | undefined {
    return this.manifests.get(appId);
  }

  // Route matching is exact-or-child-path (`/app/tasks` matches itself and
  // `/app/tasks/T1`, never `/app/tasks2`) — enough for app-level routing;
  // in-app routing belongs to the app.
  getManifestForPathname(pathname: string): ShellAppManifest | undefined {
    return Array.from(this.manifests.values()).find((manifest) =>
      isRouteMatch(manifest.route, pathname),
    );
  }

  getManifests(): ShellAppManifest[] {
    return Array.from(this.manifests.values());
  }

  getShell(): ShellSDK {
    return this.shellSdk;
  }

  // Mount/update/read make a tiny CRUD: register once, push fresh content
  // on re-render, read sorted by `order` then id. The React hooks in
  // `react-bindings` are thin wrappers over exactly these three calls.
  mountTopNav(contribution: ShellTopNavMountContribution): Disposable {
    if (this.topNavMountsById.has(contribution.id)) {
      throw new Error(`Top nav mount already registered: ${contribution.id}`);
    }

    this.topNavMountsById.set(contribution.id, contribution);
    this.emit();

    return {
      dispose: () => {
        if (!this.topNavMountsById.has(contribution.id)) {
          return;
        }

        this.topNavMountsById.delete(contribution.id);
        this.emit();
      },
    };
  }

  updateTopNavMount(contribution: ShellTopNavMountContribution) {
    if (!this.topNavMountsById.has(contribution.id)) {
      throw new Error(`Unknown top nav mount: ${contribution.id}`);
    }

    this.topNavMountsById.set(contribution.id, contribution);
    this.emit();
  }

  topNavMounts(area?: ShellTopNavMountArea): ShellTopNavMountContribution[] {
    return Array.from(this.topNavMountsById.values())
      .filter((contribution) => area == null || contribution.area === area)
      .sort(compareNavMounts);
  }

  mountSideNav(contribution: ShellSideNavMountContribution): Disposable {
    if (this.sideNavMountsById.has(contribution.id)) {
      throw new Error(`Side nav mount already registered: ${contribution.id}`);
    }

    this.sideNavMountsById.set(contribution.id, contribution);
    this.emit();

    return {
      dispose: () => {
        if (!this.sideNavMountsById.has(contribution.id)) {
          return;
        }

        this.sideNavMountsById.delete(contribution.id);
        this.emit();
      },
    };
  }

  updateSideNavMount(contribution: ShellSideNavMountContribution) {
    if (!this.sideNavMountsById.has(contribution.id)) {
      throw new Error(`Unknown side nav mount: ${contribution.id}`);
    }

    this.sideNavMountsById.set(contribution.id, contribution);
    this.emit();
  }

  sideNavMounts(): ShellSideNavMountContribution[] {
    return Array.from(this.sideNavMountsById.values()).sort(compareNavMounts);
  }

  // Entity sources usually arrive via manifests, but platform-level sources
  // (people derived across apps, say) can register directly. Either way the
  // host only aggregates — it never knows any app's API shape, which is the
  // entire point of the contribution model.
  registerEntitySource(source: WorkspaceEntitySource): Disposable {
    if (this.entitySourcesById.has(source.id)) {
      throw new Error(`Entity source already registered: ${source.id}`);
    }

    this.entitySourcesById.set(source.id, source);
    this.emit();

    return {
      dispose: () => {
        if (!this.entitySourcesById.has(source.id)) {
          return;
        }

        this.entitySourcesById.delete(source.id);
        this.emit();
      },
    };
  }

  entitySources(): WorkspaceEntitySource[] {
    return Array.from(this.entitySourcesById.values());
  }

  entityKinds(): WorkspaceEntityKind[] {
    const kindsById = new Map<string, WorkspaceEntityKind>();

    for (const source of this.entitySourcesById.values()) {
      for (const kind of source.kinds) {
        if (!kindsById.has(kind.id)) {
          kindsById.set(kind.id, kind);
        }
      }
    }

    return Array.from(kindsById.values());
  }

  listWorkspaceEntities(
    workspace: WorkspaceContext,
  ): Promise<WorkspaceEntityIndex> {
    return buildWorkspaceEntityIndex(this.entitySources(), { workspace });
  }

  activeApp(): ActiveShellApp | undefined {
    return this.active;
  }

  // The palette and settings methods are deliberate pass-throughs that
  // supply the SDK's own context service — so UI code holds one object
  // (the host) instead of threading context through every call.
  paletteItems(): CommandContribution[] {
    return this.shellSdk.commands.paletteItems(this.shellSdk.context);
  }

  paletteResults(query = ""): RankedCommandResult[] {
    return this.shellSdk.commands.rankedPaletteItems(
      query,
      this.shellSdk.context,
    );
  }

  paletteChildResults(parentId: string, query = ""): RankedCommandResult[] {
    return this.shellSdk.commands.rankedChildItems(
      parentId,
      query,
      this.shellSdk.context,
    );
  }

  commandForShortcode(shortcode: string): CommandContribution | undefined {
    return this.shellSdk.commands.findByShortcode(shortcode);
  }

  settingsGroups(): SettingsGroup[] {
    return this.shellSdk.preferences.settingsGroups(this.shellSdk.context);
  }

  // The captured event feed, newest first — the raw material for activity
  // panels and support diagnostics. Only the types named in
  // `ShellHostOptions.eventTypes` are kept.
  events(): ShellEvent[] {
    return [...this.hostEvents];
  }

  snapshotVersion(): number {
    return this.version;
  }

  // Activation: deactivate whoever holds the surface, flip the `appActive`
  // context key (so `when` clauses re-evaluate before the module even
  // resolves), then `load()` and run the module's `activate()`. Everything
  // the app binds through `disposeWithApp` lands in one store that
  // deactivation drains — apps clean up by construction, not by discipline.
  async activate(appId: string): Promise<ShellAppInstance> {
    if (this.active?.manifest.id === appId) {
      return this.active.instance;
    }

    const manifest = this.manifests.get(appId);

    if (!manifest) {
      throw new Error(`Unknown micro-app: ${appId}`);
    }

    // Surface handoff: evict the current occupant, then set `appActive`
    // *before* the module resolves so `when` clauses flip while the code
    // is still in flight.
    this.deactivate();
    this.shellSdk.context.set("appActive", manifest.id);

    // The only place `load()` is ever called — everything before this line
    // ran off manifest data alone.
    const store = new DisposableStore();
    const module = await manifest.load();
    const instance = await module.activate({
      app: manifest,
      disposeWithApp: (disposable) => store.add(disposable),
      host: this,
      shell: this.shellSdk,
    });

    store.add(instance);
    this.active = { instance, manifest, store };
    this.emit();

    return instance;
  }

  // Deactivation is the mirror image, and passing an `appId` makes it
  // conditional — "tear down tasks if it is still active" — which lets
  // racing activations resolve safely no matter which one finishes last.
  deactivate(appId?: string) {
    const current = this.active;

    if (!current) {
      this.shellSdk.context.set("appActive", undefined);
      return;
    }

    if (appId && current.manifest.id !== appId) {
      return;
    }

    // Feature gates fall closed so no `when` clause keeps passing on the
    // strength of an app that is no longer here…
    for (const feature of current.manifest.features ?? []) {
      this.shellSdk.context.set(feature.contextKey, false);
    }

    // …then the app-scoped store drains (handlers, sources, subscriptions,
    // the instance itself), and any chrome it projected is swept.
    current.store.dispose();
    this.deleteTopNavMountsForApp(current.manifest.id);
    this.deleteSideNavMountsForApp(current.manifest.id);
    this.active = undefined;
    this.shellSdk.context.set("appActive", undefined);
    this.emit();
  }

  setFeatureEnabled(appId: string, featureId: string, isEnabled: boolean) {
    const manifest = this.manifests.get(appId);
    const feature = manifest?.features?.find((item) => item.id === featureId);

    if (!feature) {
      throw new Error(`Unknown feature: ${appId}.${featureId}`);
    }

    this.shellSdk.context.set(feature.contextKey, isEnabled);
  }

  // The host-level command runner adds what the registry alone cannot do:
  // navigation. Route commands navigate in-shell, `href` commands respect
  // `target="_blank"`, and then execution falls through to the registry's
  // activate-then-run flow.
  async runCommand(commandId: string): Promise<void> {
    const command = this.shellSdk.commands.get(commandId);

    if (!command) {
      throw new Error(`Unknown command: ${commandId}`);
    }

    if (command.route) {
      this.navigate(command.route);
    }

    if (command.href) {
      if (command.target === "_blank") {
        window.open(command.href, "_blank", "noopener,noreferrer");
      } else {
        this.navigate(command.href);
      }
    }

    await this.shellSdk.commands.execute(commandId);
  }

  subscribe(listener: HostListener): Disposable {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  dispose() {
    this.deactivate();
    this.registrations.dispose();
    this.listeners.clear();
  }

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private deleteTopNavMountsForApp(appId: string) {
    for (const contribution of this.topNavMountsById.values()) {
      if (contribution.appId === appId) {
        this.topNavMountsById.delete(contribution.id);
      }
    }
  }

  private deleteSideNavMountsForApp(appId: string) {
    for (const contribution of this.sideNavMountsById.values()) {
      if (contribution.appId === appId) {
        this.sideNavMountsById.delete(contribution.id);
      }
    }
  }
}

function compareNavMounts(
  left: { id: string; order?: number },
  right: { id: string; order?: number },
) {
  const orderDiff = (left.order ?? 0) - (right.order ?? 0);

  if (orderDiff !== 0) {
    return orderDiff;
  }

  return left.id.localeCompare(right.id);
}

// The only commands the framework itself contributes: open preferences
// (and docs, when the host names a route). Hosts opt out with
// `includeDefaultPlatformCommands: false`; everything else in the palette
// belongs to the product and its apps.
export function createPlatformCommandSource({
  docsRoute,
  preferencesRoute = "/preferences",
}: {
  docsRoute?: string;
  preferencesRoute?: string;
} = {}): CommandSourceContribution {
  const commands: CommandContribution[] = [
    {
      id: "platform.openPreferences",
      appId: "platform",
      category: "Platform",
      title: "Open Preferences",
      description:
        "Review platform, product, application, and feature settings.",
      icon: "wrench",
      keywords: ["settings", "preferences", "configuration"],
      kind: "page",
      route: preferencesRoute,
      shortcut: {
        modifiers: ["meta"],
        key: ",",
      },
    },
  ];

  if (docsRoute) {
    commands.push({
      id: "platform.openDocs",
      appId: "platform",
      category: "Platform",
      title: "Open Documentation",
      description: "Open the platform documentation surface.",
      icon: "externalLink",
      kind: "page",
      keywords: ["docs", "help", "reference"],
      href: docsRoute,
    });
  }

  return {
    id: "platform:commands",
    appId: "platform",
    label: "Platform",
    ring: "platform",
    commands,
  };
}

// The default navigator is a minimal SPA pushState: same-origin URLs update
// history and announce themselves via an `app-foundry:navigate` event for the
// host router to observe; cross-origin URLs get a full document load. Hosts
// with real routers replace this wholesale via `ShellHostOptions.navigate`.
function defaultNavigate(href: string) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(href, window.location.origin);

  // Leaving the origin means leaving the SPA — hand over to the browser.
  if (url.origin !== window.location.origin) {
    window.location.assign(url.toString());
    return;
  }

  // Same-origin: push history and announce, so the host router re-renders
  // without a page load.
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event("app-foundry:navigate"));

  // Fragment targets still deserve their scroll even though no real
  // navigation happened.
  if (url.hash) {
    document.getElementById(url.hash.slice(1))?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }
}

function isRouteMatch(route: string, pathname: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}
