# Annotated source

App Foundry keeps its architecture legible in the source itself. Comments explain why a boundary exists; the adjacent code shows the exact contract that enforces it.

## Read by responsibility

Start with `core/host.ts` for App Module registration and lifecycle. Continue to `core/shell-sdk.ts` for collaboration registries and app-scoped disposal.

The React modules turn framework state into headless feature models. The Worker modules keep request and persistence helpers deliberately small. The generator module owns only neutral filesystem mechanics.

## Follow the dependency direction

Core contracts do not import React, Workers, or a UI kit. React consumes core contracts. Presentation adapters consume React models. Worker helpers remain independent of presentation.

The source pages preserve that order so an application or an LLM can enter through the smallest relevant boundary.

## Comments are part of the contract

The annotation rail is generated from full-line comments in each public module. Code remains the repository source, not a copied documentation sample.

Use the exported-symbol links on each page to jump directly to a type, function, or class.
