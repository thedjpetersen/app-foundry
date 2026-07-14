# Generator Engine

## Neutral mechanics, branded recipes

App Foundry owns the parts of code generation that should behave the same for every UI kit:

- canonical name parsing;
- path containment;
- overwrite protection;
- dry-run output;
- directory creation;
- deterministic write results.

A UI kit owns the recipe names, target paths, imports, components, styling, and rendered source text.

```ts
import {
  runGenerator,
  toNameParts,
  type GeneratorRecipe,
} from "app-foundry/generator";
```

This boundary lets two UI kits scaffold the same application shape without sharing presentation code or forcing App Foundry to understand either design system.
