# Algrith Styledwind

## A Tailwind-native `styled()` utility for React and Next.js — with nested selectors, `variants()`, merge-aware override precedence, and a live dev-time invalid-class validator with an in-browser overlay.

[![Algrith Styledwind is released under the MIT license.](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/algrith/styledwind/blob/main/LICENSE)
[![npm downloads/month](https://img.shields.io/npm/dm/@algrith/styledwind)](https://www.npmjs.com/package/@algrith/styledwind)

## Why this exists

[twin.macro](https://github.com/ben-rogerson/twin.macro) was the standard
way to combine Tailwind utility classes with `styled-components`-style
CSS-in-JS — but it depends on `babel-plugin-macros` to do its work at
build time. Next.js's Turbopack bundler doesn't support Babel plugins or
macros at all, and Turbopack has moved from an opt-in flag to the default
(and, from Next.js 16 onward, effectively the only supported) bundler.
That leaves twin.macro with no way to run in a current Next.js app.

Styledwind exists to fill that gap: a Tailwind-native `styled()` API that
needs no Babel macro, no custom webpack loader, and no bundler-specific
integration at all — just plain tagged template literals, evaluated at
runtime.

## Features

- **`styled.div`, `styled.button`, `styled(Component)`** — works on any
  intrinsic HTML tag or any ref-forwarding React component (including
  third-party ones, e.g. Ant Design, MUI).
- **Nested selectors** — `.child { ... }`, comma-separated selectors
  (`.a, .b { ... }`), and `&`-compounding (`&.active { ... }`,
  `&:hover { ... }`) resolve against the component's own root at runtime.
- **Override precedence that matches CSS** — a nested block declared after
  (or inside) its parent correctly wins any conflicting Tailwind class,
  instead of falling back to Tailwind's arbitrary internal stylesheet
  order.
- **`tw` template tag** — merges Tailwind classes via `tailwind-merge`,
  so conflicting utilities resolve predictably.
- **`variants()` helper** — prop-driven class selection that keeps every
  possible class as literal, scanner-visible text, so Tailwind's
  production build never silently drops a class assembled at runtime.
- **Live class validation (optional)** — a dev-only watcher checks every
  static `tw\`...\`` call against Tailwind v4's real compiler and shows a
  full-screen overlay (plus a terminal warning) the instant an invalid
  class is saved.
- **No Babel, no macros, no bundler plugin required** — works identically
  under Webpack, Turbopack, Vite, or any other bundler, since there's no
  build-time transform for anything to break.

## Framework support

| Feature                                  | Next.js | Vite / CRA / plain React |
| ----------------------------------------- | :-----: | :-----------------------: |
| `styled`, `tw`, `variants`                | ✅      | ✅                         |
| Live validator + overlay (auto-wired)     | ✅      | —                          |
| Live validator + overlay (manual script)  | ✅      | ✅                         |

The core `styled` API has no Next.js-specific code in it at all — it's
plain React plus `clsx`/`tailwind-merge`, so it works the same way in any
React 18+ project with Tailwind CSS configured, Next.js or not. The live
validator auto-spawns via `withStyledwindGuard()` in `next.config.ts`
specifically because that's the one hook every Next.js app already has;
outside of Next.js, run it as a standalone CLI process instead — see
[Live class validation](#live-class-validation) below.

## Install

```bash
npm install @algrith/styledwind
```

```bash
yarn add @algrith/styledwind
```

```bash
pnpm add @algrith/styledwind
```

**Requirements:** React 18+, Tailwind CSS v4+. Next.js 15+ only if you
want the live validator auto-wired — see below for using it without
Next.js.

## Quick start

```tsx
import { styled, tw } from '@algrith/styledwind';

export const Card = styled.div`
  ${tw`flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm`};

  h1 {
    ${tw`text-xs font-semibold tracking-[0.1em] text-zinc-500`};
  }

  .step {
    ${tw`text-zinc-500`};

    &.done {
      ${tw`text-zinc-900`};
    }
  }
`;
```

Nested selectors are resolved against DOM elements rendered inside the
component after mount, so `.step` and `&.done` above just need to exist as
literal `className`s somewhere in `Card`'s children.

This works exactly the same whether `Card` is rendered inside a Next.js
app, a Vite app, Create React App, Remix, or any other React 18+ setup —
`styled`, `tw`, and `variants` have no framework dependency.

### Third-party components

```tsx
import { Button } from 'antd';
import { styled, tw } from '@algrith/styledwind';

export const PrimaryButton = styled(Button)`
  ${tw`rounded-full px-6 font-medium`};
`;
```

Works with any component that forwards its `ref` and spreads unknown props
onto its root DOM node (the same requirement `styled-components` and
`emotion` place on wrapped components). In development, `styledwind` warns
in the console if a component with nested selectors never attaches a ref,
so a silent styling failure doesn't go unnoticed.

### Prop-driven variants

```tsx
import { styled, variants } from '@algrith/styledwind';

type BadgeProps = { color?: 'red' | 'blue' };

export const Badge = styled.span<BadgeProps>`
  ${(props) =>
    variants(props.color, {
      red: 'bg-red-100 text-red-700',
      blue: 'bg-blue-100 text-blue-700',
    })}
`;
```

Always spell out full class names inside the `map` object — Tailwind's
build-time scanner reads literal source text, not runtime values, so a
dynamically-constructed class (e.g. `` `bg-${color}-100` ``) is invisible
to it and silently produces no CSS in production.

## Live class validation

Catch typos and invalid Tailwind classes the moment you save — not after a
production build silently drops them.

### With Next.js

**1. Wrap your Next.js config:**

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withStyledwindGuard } from '@algrith/styledwind/next';

const nextConfig: NextConfig = {
  /* ... */
};

export default withStyledwindGuard(nextConfig, {
  entryCss: 'app/globals.css', // optional — auto-detected if omitted
});
```

`withStyledwindGuard` spawns the watcher process alongside `next dev`
automatically — no separate script or terminal tab needed.

### With Vite, Create React App, or any other setup

There's no `next.config.ts` hook to spawn the watcher from outside of
Next.js, so run it as its own process instead, using the CLI the package
ships:

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"styledwind-watch\""
  }
}
```

(`concurrently` — or `npm-run-all`, or two terminal tabs — just needs to
run your normal dev server and `styledwind-watch` side by side.) Configure
it with the same environment variables `withStyledwindGuard` sets
internally:

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"STYLEDWIND_ENTRY_CSS=src/index.css STYLEDWIND_GUARD_PORT=47821 styledwind-watch\""
  }
}
```

Both variables are optional — `STYLEDWIND_ENTRY_CSS` is auto-detected
against common Vite/CRA paths (`src/index.css`, `src/App.css`,
`src/main.css`, etc.) the same way it auto-detects Next.js's `globals.css`,
and `STYLEDWIND_GUARD_PORT` defaults to `47821`.

### Mounting the overlay (both setups)

Mount `<StyledwindGuardOverlay />` once, near the root of your app:

```tsx
import { StyledwindGuardOverlay } from '@algrith/styledwind/overlay';

export default function App() {
  return (
    <>
      {/* ...your app... */}
      <StyledwindGuardOverlay />
    </>
  );
}
```

With this in place, saving a file containing an invalid Tailwind class
(inside a static `tw\`...\`` call) logs it to your terminal and shows a
full-screen overlay in the browser until it's fixed. Classes inside
interpolated `${...}` expressions can't be statically checked and are
skipped.

### Config options

| Option     | Env var (standalone CLI)     | Default        | Description                                                                |
| ---------- | ------------------------------ | -------------- | --------------------------------------------------------------------------- |
| `entryCss` | `STYLEDWIND_ENTRY_CSS`         | auto-detected  | Path to your Tailwind entry CSS, relative to the project root.              |
| `port`     | `STYLEDWIND_GUARD_PORT`        | `47821`        | WebSocket port. Must match between the watcher and `<StyledwindGuardOverlay port={...} />`. |

## API reference

| Export                    | Import from                    | Description                                                     |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `styled`                  | `@algrith/styledwind`             | Tagged-template factory — `styled.div`, `styled(Component)`.    |
| `tw`                      | `@algrith/styledwind`             | Merges Tailwind classes via `tailwind-merge`.                   |
| `variants`                | `@algrith/styledwind`             | Prop-driven, scanner-safe class selection.                      |
| `withStyledwindGuard`     | `@algrith/styledwind/next`        | Next.js config wrapper — spawns the dev-time watcher.           |
| `StyledwindGuardOverlay`  | `@algrith/styledwind/overlay`     | Client component — renders the invalid-class overlay.           |
| `styledwind-watch`        | CLI (via `npx` or a script)      | Standalone watcher process for non-Next.js setups.               |

## Limitations

- The validator only checks **statically-written** `tw\`...\`` calls.
  Anything containing `${...}` interpolation is skipped, since there's no
  literal string to check without evaluating the component at runtime.
- Nested-selector styling is applied via `document.querySelectorAll`
  after mount — it does not affect server-rendered HTML before hydration.
- The overlay is advisory, not blocking: your app keeps running and
  serving requests even while an invalid class is showing.

## Contributing

- Missing something or found a bug? [Report here](https://github.com/algrith/styledwind/issues).
- Local setup, project layout, and how to test changes against a real app
  before opening a pull request: see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
