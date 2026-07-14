# Contracts

## Let the host understand an app before loading it

An App Module begins with a manifest. The manifest exposes identity, route, owner, entry URL, commands, preferences, features, and a lazy loader.

This lets the host build shared product surfaces without importing the module’s implementation.

```ts
import type { ShellAppManifest } from "app-foundry/core";

export const catalogManifest: ShellAppManifest = {
  id: "catalog",
  name: "Catalog",
  ownerTeam: "Commerce",
  route: "/app/catalog",
  entryUrl: "/app/modules/catalog.js",
  icon: "archive",
  commands: [openCatalogCommand],
  preferences: [catalogDensityPreference],
  load: () => import("./activate.js"),
};
```

## Activation makes ownership explicit

The host activates a module only when its capability is needed. Activation receives the shared shell contract and returns the view the selected presentation adapter will render.

Handlers and listeners registered during activation belong to that module. App-scoped disposal removes them when the user leaves the capability.

```ts
export function activate(context: ShellAppActivationContext) {
  context.disposeWithApp(
    context.shell.commands.bind("catalog.refresh", refreshCatalog),
  );

  return { Component: CatalogApp };
}
```

## Collaboration uses registries, not shared state

Commands, preferences, events, entities, and capabilities are namespaced by the App Module that owns them.

The host aggregates those contributions through stable contracts. Modules do not reach into each other’s internal stores or import each other’s implementation files.

| Contract | What it lets modules contribute |
| --- | --- |
| Commands | Discoverable actions, pages, entities, and help entries |
| Preferences | Typed, namespaced settings with layered resolution |
| Events | Explicit notifications without shared mutable state |
| Entities | Workspace records for search, mentions, and references |
| Capabilities | Access-aware feature declarations |

## Package by feature

Keep the manifest, activation code, domain behavior, and first view close to the capability that owns them.

```text
src/apps/catalog/
  manifest.ts
  activate.ts
  commands.ts
  preferences.ts
  view.tsx
```

Shared technical folders are useful only when code truly has several owners. The default is a vertical package that can change or disappear without reshaping unrelated apps.

## Public exports

| Export | Responsibility |
| --- | --- |
| `app-foundry/core` | Contracts, lifecycle, collaboration registries, access control, and import maps |
| `app-foundry/react` | Headless feature models, bindings, App Module runtime, and Presentation Seam types |
| `app-foundry/worker` | Small HTTP, D1, short-link, capability, CSRF, and rate-limit helpers |
| `app-foundry/generator` | Naming, path containment, overwrite protection, dry runs, and deterministic writes |

Import from the layer that owns the decision. Presentation code should not become the accidental home of application behavior.
