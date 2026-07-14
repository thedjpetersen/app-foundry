# App Foundry

[![CI](https://github.com/thedjpetersen/app-foundry/actions/workflows/ci.yml/badge.svg)](https://github.com/thedjpetersen/app-foundry/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-0d8626.svg)](LICENSE)

App Foundry is a design-system-neutral application framework for products made from independently developed App Modules.

It owns manifests, activation, disposal, commands, preferences, events, workspace entities, access control, import maps, Worker helpers, and headless React orchestration.

It renders no product interface and imports no design system or CSS. A host chooses a UI kit, supplies product policy, and keeps ownership of routes, bindings, schema, and deployment.

## Why It Exists

LLM-assisted development becomes less reliable as decisions accumulate. A small mistake becomes context for later work, so errors can compound with a power-law-like shape.

App Foundry settles recurring platform choices before an app asks a model to implement business behavior. Domain-driven boundaries and package-by-feature keep a wrong assumption local.

The result is disposable leverage: teams can bootstrap an app, collaborate through stable contracts, learn from it, and replace it without replacing the platform.

Read the full [Motivation](docs/motivation.md).

## Responsibility Boundary

| Owner | Responsibilities |
| --- | --- |
| App Foundry | Cross-app contracts, lifecycle, commands, preferences, events, entities, access control, neutral generators, and Worker helpers. |
| Host product | Product routes, customers, authorization policy, infrastructure bindings, persistence choices, and deployment. |
| App Module | One business capability, its manifest, activation code, commands, preferences, and domain behavior. |
| UI kit | Components, layout, icons, theme behavior, CSS, and presentation of App Foundry feature models. |

The dependency direction is one-way: host and App Modules depend on App Foundry; a selected UI kit implements its Presentation Seam; App Foundry depends on neither UI kit.

## Packages

| Export | Purpose |
| --- | --- |
| `app-foundry/core` | App manifests, host lifecycle, shell SDK, commands, preferences, events, entities, access control, and import maps. |
| `app-foundry/react` | Headless feature models, bindings, app runtime, and the UI-kit Presentation Seam. |
| `app-foundry/worker` | Small HTTP, D1, short-link, capability, CSRF, and rate-limit helpers. |
| `app-foundry/generator` | Naming, path containment, overwrite protection, dry runs, and filesystem mechanics. |

## Install

The source is versioned as the `0.1.0` release candidate. npm publication is pending; source installs can target the public repository.

```sh
npm install github:thedjpetersen/app-foundry#main react
```

After the npm release:

```sh
npm install app-foundry react
```

## First Host

```ts
import { ShellHost, createShellSDK } from "app-foundry/core";

const shell = createShellSDK({ platformId: "northstar" });

export const host = new ShellHost({
  shell,
  preferencesRoute: "/preferences",
  defaultDocsRoute: "/docs",
});

host.register({
  id: "catalog",
  name: "Catalog",
  ownerTeam: "Commerce",
  route: "/app/catalog",
  entryUrl: "/app/modules/catalog.js",
  icon: "archive",
  load: () => import("@app/catalog"),
});
```

The manifest is available before app code loads. Navigation, palette search, settings, and feature state can therefore work without eagerly importing every module.

## Package by Feature

Keep each App Module close to the domain capability it owns:

```text
src/
  shell/
    host.ts
    presentation.tsx
  apps/
    catalog/
      manifest.ts
      activate.ts
      commands.ts
      preferences.ts
      view.tsx
```

Modules collaborate through contracts and events, not shared implementation state. A host may replace one module or one UI kit without teaching every other module about that decision.

## Presentation Seam

The Presentation Seam is feature-level rather than primitive-level. A UI kit implements a frame, command palette, preferences surface, App Module outlet, and error boundary.

Supported UI kits:

- [AstryxKit](https://github.com/thedjpetersen/astryxkit) renders the seam with the Astryx design system.
- LedgerKit renders the seam with an independent editorial Tailwind and Radix language.

See [Presentation Seam](docs/presentation-seam.md) for the contract and ownership rules.

## Neutral Generators

App Foundry supplies naming and filesystem safety. A UI kit supplies branded recipes and rendered code.

```ts
import { runGenerator, toNameParts } from "app-foundry/generator";
```

See [Generator Engine](docs/generators.md).

## Documentation

- [Motivation](docs/motivation.md)
- [Architecture](docs/architecture.md)
- [Presentation Seam](docs/presentation-seam.md)
- [Generator Engine](docs/generators.md)

## Development

```sh
npm install
npm run validate
npm pack --dry-run
```

`npm run validate` type-checks and builds every public export. The repository CI runs the same gate on pushes and pull requests.

## License

MIT
