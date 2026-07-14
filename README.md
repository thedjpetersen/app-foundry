# App Foundry

App Foundry organizes independently developed App Modules behind stable contracts. It owns application manifests, activation and disposal, commands, preferences, events, workspace entities, access control, Worker helpers, import maps, and headless React models.

App Foundry renders no product interface and imports no design system or CSS. Hosts choose one UI Kit, such as AstryxKit or LedgerKit.

```ts
import { ShellHost } from "app-foundry/core";
import { useShellAppOutlet } from "app-foundry/react";
```

The Presentation Seam is deliberately feature-level. UI kits implement a
frame, command palette, preferences surface, app outlet, and error boundary;
they do not mirror one another's primitive components.

Generator mechanics are also neutral:

```ts
import { runGenerator, toNameParts } from "app-foundry/generator";
```

Each UI kit supplies the file recipes and rendered code for its own design
language while App Foundry enforces path containment, overwrite safety, dry
runs, and shared naming rules.
