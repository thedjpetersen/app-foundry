# Architecture

## One framework, replaceable presentation

App Foundry is the durable center of a three-library architecture. It defines application contracts and runtime behavior without choosing a component system.

```text
Host product
  ├── App Foundry
  │     ├── core contracts and lifecycle
  │     ├── headless React feature models
  │     ├── Worker helpers
  │     └── neutral generator mechanics
  ├── one UI kit
  │     ├── AstryxKit
  │     └── LedgerKit
  └── App Modules grouped by business capability
```

## Ownership rules

If a decision depends on a customer, workspace, deployment, binding, schema, or authorization policy, it belongs to the host product.

If it is a reusable lifecycle or collaboration rule, it belongs to App Foundry. If it is visual, it belongs to the selected UI kit.

An App Module owns one business capability. It declares what the host needs to know through a manifest and binds runtime behavior during activation.

## Stable collaboration

Commands, preferences, events, entities, and capabilities are namespaced by their owning App Module. The host can aggregate them without importing module internals.

Activation returns disposable work. When the active module changes, the host removes app-scoped handlers and listeners instead of leaving hidden shared state behind.

## Compatibility

AstryxKit `0.x` retains deprecated `core` and `worker` re-exports for migration. New application code should import durable contracts directly from App Foundry.
