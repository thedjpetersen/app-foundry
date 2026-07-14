# Motivation

## Make the platform durable and the apps disposable

LLM-assisted development gets less reliable as decisions accumulate. A small mistake in infrastructure, state, or an API becomes context for the next decision.

The resulting degradation can have a power-law-like shape. One wrong assumption does not stay one mistake when later work treats it as a fact.

App Foundry narrows that chain of decisions. Framework layers settle recurring choices about lifecycle, commands, preferences, collaboration contracts, and Worker boundaries.

A selected UI kit settles presentation choices without pushing those choices back into the framework. The model working on an App Module does not need to redesign the platform or component system.

Inside those rails, domain-driven design and package-by-feature keep each business capability encapsulated. A mistaken assumption stays local instead of reshaping every app.

Apps can be developed independently while collaborating through stable contracts and APIs. Teams and models share the seams, not the implementation.

The same App Module can sit behind different UI kits without learning either component system. Parallel work does not require a shared pile of internal state.

The payoff is disposable leverage. We can bootstrap an app quickly, collaborate on it, learn from it, and throw it away without throwing away the platform.

Each framework layer removes choices from the layer below. By the time an LLM reaches product code, its responsibility is intentionally small: understand the domain and implement its behavior.
