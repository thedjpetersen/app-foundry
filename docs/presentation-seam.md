# Presentation Seam

## Feature-level contract

The Presentation Seam connects App Foundry to a UI kit. It models complete shell features instead of mirroring design-system primitives.

A UI kit implements five surfaces:

1. A frame for product navigation and shared shell chrome.
2. A command palette driven by App Foundry command models.
3. A preferences surface driven by namespaced schemas and resolved values.
4. An App Module outlet that renders loading, ready, empty, and failure states.
5. An error boundary for failures inside independently loaded module views.

## What stays out

App Foundry does not define buttons, cards, spacing props, color tokens, icons, CSS, or theme persistence.

Those choices belong to the UI kit. A host selects one presentation adapter and keeps App Modules dependent on the framework contracts.

## Adapter shape

```ts
import type { PresentationAdapter } from "app-foundry/react";

declare const presentation: PresentationAdapter;

presentation.Frame;
presentation.CommandPalette;
presentation.Preferences;
presentation.AppOutlet;
presentation.AppErrorBoundary;
```

The adapter is broad enough to preserve a coherent design language and narrow enough to keep business behavior portable.
