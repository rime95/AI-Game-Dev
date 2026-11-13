# Tech Stack — Sand to Mind (PC, Three.js)

## Guiding constraints
- **Windows PC on Steam.** macOS/Linux are not targets.
- Team already knows **React, TypeScript and Three.js**.
- **Art comes later:** build with placeholders first, then swap in 3D models, images and video (e.g. AI-generated with Higgsfield) after the playable build. See [Art asset pipeline](#art-asset-pipeline).
- **Three.js** for rendering.
- The game is **UI-heavy** (tables, cards, charts, wizards) with **3D views** (The Stack, chip floorplan, data halls, world map).
- The **simulation is the product.** It must be deterministic, testable and fast enough to run thousands of headless playthroughs for balancing.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language for sim, UI, tools and desktop shell |
| Build / dev server | **Vite** | Fast hot reload, first-class TS, simple Electron integration |
| 3D | **Three.js** via **React Three Fiber** + **drei** | Three.js underneath; R3F lets 3D scenes and UI share state and components. Plain Three.js stays available for custom shaders/effects |
| Post-processing | `postprocessing` (pmndrs) | Bloom/glow for the blueprint + circuit art style |
| UI | **React** (DOM overlay on the canvas) | Dense panels, tables, forms, accessibility, text rendering: all far easier in DOM than in WebGL |
| UI styling | **CSS Modules** or **Tailwind** | Theme tokens for the blueprint look |
| UI state | **Zustand** | Tiny, works in and out of React, pairs with R3F |
| Charts | **uPlot** (time series) | Very fast and small; finance, users and benchmark history charts |
| Simulation core | **Pure TS package, no DOM/Three imports**, runs in a **Web Worker** | Keeps the UI at 60 fps during long turn processing; same code runs headless in Node |
| Content data | **JSON/YAML files + Zod schemas** | Chips, model architectures, events, research tree, rivals as data, validated at load. Designers edit data, not code |
| Randomness | Seeded PRNG (e.g. a small xoshiro/mulberry implementation) | Deterministic replays, reproducible bug reports, fair balance tests |
| Save system | Versioned JSON + migrations, compressed (`fflate`) | Forward-compatible saves; Steam Cloud syncs the files |
| Audio | **Howler.js** | Simple, reliable SFX/music |
| Desktop shell | **Electron** + **electron-builder** | Bundled Chromium gives the same WebGL behavior on every OS; mature Steam integration |
| Steam | **steamworks.js** | Achievements, Steam Cloud, overlay, rich presence |
| Unit/sim tests | **Vitest** | Formula tests, balance invariants, save migration tests |
| E2E tests | **Playwright** (Electron mode) | Smoke-test core flows: new game, train model, save/load |
| Balance tooling | Node CLI that runs the sim headless × N seeds → CSV/charts | Catch runaway economies and dead strategies early |
| Lint/format | ESLint + Prettier | Standard |
| Package manager | **npm workspaces** | Built into Node (pnpm isn't installed here); clean split between content, sim, app and desktop packages |
| CI | GitHub Actions | Tests + Windows build |
| Asset processing | **gltf-transform** CLI + **gltfjsx** | Compress/optimize 3D models; turn GLB files into typed R3F components |

## Repository layout
```
/packages
  /sim        pure TypeScript simulation: state, systems, formulas, AI rivals (no DOM)
  /content    data files (chips, archs, events, research) + Zod schemas
  /app        React + R3F frontend: screens, 3D scenes, UI components
  /desktop    Electron main process, Steam integration, file saves
  /tools      headless balance runner, content validators
/docs         design docs
```

## Architecture
```
 ┌──────────── Renderer process (Chromium) ────────────┐
 │  React UI  ◄──►  Zustand store  ◄──►  R3F / Three.js │
 │                     ▲   │                            │
 │        snapshots    │   │  player commands           │
 │                     │   ▼                            │
 │           ┌─── Web Worker ───┐                       │
 │           │  sim core (TS)   │  seeded, deterministic │
 │           └──────────────────┘                       │
 └──────────────────────┬───────────────────────────────┘
                        │ IPC (saves, Steam)
              Electron main process → filesystem, steamworks.js
```
- **Commands in, snapshots out.** The UI never mutates sim state. It sends commands (`StartTrainingRun`, `TapeOutChip`, `AdvanceWeek`) and receives read-only snapshots + an event log.
- **Previews are free:** the same sim functions compute "what if" previews (projected score, training weeks, risk %), so the legibility pillar comes from the architecture.
- **Determinism:** state + seed + command list = identical result. This enables replays, bug repro and save validation.

## Alternatives considered

| Option | Verdict |
|---|---|
| **Tauri** instead of Electron | On Windows-only, Tauri's webview (WebView2) is Chromium too, so rendering is no longer the issue. Still not chosen: Steam integration needs Rust code (steamworks-rs), a second language in the project. The smaller download matters little once art assets add hundreds of MB. Viable if you want Rust anyway. |
| **Vanilla Three.js** + separate UI | Works fine, but you'd write your own bridge between scene and UI state. R3F gives that for free. Plain Three.js can still be used inside R3F. |
| **Svelte/Solid** instead of React | Lighter and fast, but smaller 3D ecosystem (R3F/drei are React-only). |
| **WebGPU renderer** | Three.js has one, but WebGL2 is the safe default for the PC install base. Can switch later without rewriting scenes. |
| **Babylon.js / PlayCanvas** | Capable, but you chose Three.js, and its ecosystem fits a UI-led sim well. |
| **Unity / Godot** | Stronger for action games. For a UI-dense web-tech sim, they slow down UI iteration and don't match the Three.js choice. |

## Art asset pipeline
Goal: build the whole game with placeholder art, then swap in final art (including AI-generated 3D models, images and video, e.g. from Higgsfield) **without touching game code**.

### 1. Asset registry from day one
- Game code and content files reference **asset IDs** (`chip.asic.gen2`, `portrait.lead.research`, `event.press.rival_release`), never file paths.
- A single `assets/registry.json` maps each ID → file + metadata (type, scale, anchor/pivot, LOD, license/source).
- Every ID starts as a placeholder (primitive box, generated SVG icon, flat-color portrait). Replacing art = change one registry entry.
- A validator in `/tools` flags missing files, placeholders still in use and oversized assets.

### 2. 3D models
- **Format:** glTF binary (`.glb`) only. It's Three.js's native format and what most AI 3D generators export.
- **AI-generated meshes are usually heavy and messy:** high polygon counts, odd scale, off-center pivots, 4K textures. Every model goes through an import script:
  1. `gltf-transform` → weld, **simplify** (decimate to a triangle budget per asset type), resize textures (≤1K for small props), **KTX2/Basis** texture compression, **Meshopt** geometry compression.
  2. Normalize: scale to game units, center the pivot, face +Z.
  3. `gltfjsx` → generate a typed R3F component (optional, for models that need animated parts).
- **Budgets** (starting point): prop ≤ 5K triangles, building ≤ 30K, hero chip model ≤ 50K.
- Load with drei `useGLTF` + `Suspense`; the placeholder renders until the model arrives.

### 3. Keeping a consistent look
Assets from different sources (AI, store-bought, hand-made) rarely match. The defense is to **let our shaders define the style, not the asset**:
- Scenes can **override materials** with house materials: blueprint lines (edge detection), emissive trace glow, toon/flat shading with a fixed palette.
- The asset then mostly provides **shape**, and the look stays consistent no matter where the model came from.
- Per-asset option in the registry: `material: "house" | "original"` for assets that should keep their own textures.

### 4. 2D images and video
- **Images** (portraits, event illustrations, backgrounds): WebP; icons as SVG. Small UI images go into texture atlases for 3D use.
- **Video** (event cutscenes, trailers in menus): **WebM (VP9 or AV1)**, played in a DOM `<video>`; Electron supports it with no codec licensing concerns.
- Generate images at a fixed set of aspect ratios/sizes per slot (portrait 1:1, event card 16:9) so layouts never break.

### 5. Size and loading
- Load assets **per screen**, not all at startup; preload the next likely screen.
- Expect the install to be dominated by art (hundreds of MB). Electron's ~100 MB runtime overhead is minor next to it.

### 6. Licensing and Steam (check before shipping)
- Confirm Higgsfield's terms allow **commercial use** of generated assets on your plan, and keep the source/prompt per asset in the registry.
- Steam's content survey asks you to **disclose AI-generated content** (pre-generated art included). The registry's source field makes that disclosure easy and accurate.

## Performance notes
- The 3D views are schematic (lines, instanced boxes, glow), so they're cheap. Use **InstancedMesh** for racks/chips and keep draw calls low.
- Render on demand (`frameloop="demand"` in R3F) when nothing animates, so the GPU idles while you read menus. Good for laptops.
- Heavy turn processing goes to the Worker, so the UI never freezes.
