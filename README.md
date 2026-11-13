# Sand to Mind

A strategy tycoon about building an AI company where chips and models are designed together.
Design docs live in [docs/](docs/).

## Setup
```bash
npm install
```

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | Run the game in a browser at http://localhost:5173 |
| `npm run desktop:dev` | Open the running dev server in the Electron window (start `npm run dev` first) |
| `npm run desktop` | Build and run the packaged-style desktop app |
| `npm test` | Simulation tests |
| `npm run typecheck` | TypeScript check across all packages |

## Saves
- **Desktop (Electron):** one JSON file per save in `%APPDATA%\Sand to Mind\saves` (plus a `.meta.json` for the load screen). Writes are atomic.
- **Browser (dev):** `localStorage`, keys starting with `stm.saves/`.
- Saves carry a version; `packages/sim/src/migrate.ts` upgrades older saves. Bump `SAVE_VERSION` and add a migration whenever `GameState` changes shape.

## Layout
```
packages/content   game data (chips, architectures, rivals, events) + Zod schemas
packages/sim       pure TypeScript simulation, no DOM, deterministic
packages/app       React + React Three Fiber frontend; sim runs in a Web Worker
packages/desktop   Electron shell
```
