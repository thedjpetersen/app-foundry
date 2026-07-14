# A durable framework for disposable apps

App Foundry organizes products as independently developed App Modules that collaborate through stable contracts.

It settles recurring platform decisions before an app asks a person or an LLM to implement business behavior.

## Why the boundary matters

LLM mistakes compound when one wrong assumption becomes context for later work. The larger the shared implementation surface becomes, the farther that mistake can travel.

App Foundry limits the blast radius. Domain-driven boundaries and package-by-feature keep a mistaken assumption inside the capability that owns it.

The goal is disposable leverage. Teams can bootstrap an app, collaborate on it, learn from it, and replace it without replacing the contracts that let the product work as a whole.

[Read the full motivation](./motivation/).

## What App Foundry owns

App Foundry owns the parts that every App Module must agree on:

- manifests, registration, activation, and disposal;
- commands, preferences, events, entities, and access control;
- headless React models and the Presentation Seam;
- Worker request and data-boundary helpers; and
- neutral naming and filesystem-safe generator mechanics.

It renders no product interface and imports no design system or CSS.

## What stays outside

The host owns customer policy, routes, authorization, infrastructure bindings, persistence, schema, and deployment.

A UI kit owns components, layout, icons, tokens, CSS, theme behavior, and the presentation of App Foundry models.

An App Module owns one business capability and depends on framework contracts instead of another module’s implementation.

## The dependency direction

```text
Host product
  ├── App Foundry
  ├── one presentation adapter
  └── App Modules grouped by business capability
```

The host and App Modules depend on App Foundry. A UI kit implements the Presentation Seam. App Foundry depends on neither UI kit.

## Start with the contracts

```ts
import { ShellHost } from "app-foundry/core";

const host = new ShellHost({
  defaultDocsRoute: "/docs",
  preferencesRoute: "/preferences",
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

The manifest is available before module code loads. Navigation, search, settings, and feature state can work without eagerly importing every business capability.

## Continue through the system

Read [Architecture](./architecture/) for ownership, [Contracts](./contracts/) for collaboration, and [Presentation Seam](./presentation/) for replaceable UI.
