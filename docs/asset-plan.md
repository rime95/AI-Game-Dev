# Asset Plan — what's made how

Every visual in the game (built and planned), and where it comes from:
- **Code:** built procedurally in Three.js / SVG / CSS. 0 credits.
- **Free:** downloaded CC0 low-poly packs (Kenney.nl, Quaternius; Poly Pizza only for CC0 items). 0 credits.
- **Higgsfield:** generated and imported as GLB. Budget **~700 credits**.

Rule of thumb: **code** for anything driven by game data or repeated in bulk; **free** for generic set dressing; **Higgsfield** for the few landmark models players stare at.

> **Higgsfield is used only when the owner explicitly asks for it.** Until then, every item — including the 11 in §1 — is built with code or CC0 free packs. §1 is the plan for *when* that request comes; each of those 11 starts as a code/CC0 placeholder registered under the same asset ID, so swapping in the Higgsfield model later needs no code changes.

## How this fits the agreed build plan
This doc decides **where art comes from**; [world-and-facilities.md](world-and-facilities.md) §11 decides **what gets built and in what order** (HQ grid & garage/office → HQ server rooms → HQ building & campus → exploded chip card & model stack → data center campuses → fab → polish). Each build step uses the code and CC0 sources below for everything it adds. Higgsfield comes after a complete playable run, and only on request.
Everything goes through the asset registry, so any item can be upgraded to a better source later with no code changes (tech-stack.md, Art asset pipeline).

---

## 1. Higgsfield (11 models, ~700 credits) — only on request
Until requested, each of these is a code-built placeholder (simple shapes in the layer colors) or a CC0 model.
Pipeline per model: 3 concept images in GPT Image 2.5 (1.5 cr each) → Meshy 7 Image to 3D (38 cr), low poly, **untextured**. Our house shader adds the look.

| # | Model | Why it earns credits | Notes |
|---|---|---|---|
| 1 | **Garage** (suburban house + garage) | First thing every player sees | Exterior + shell; interior grid is code |
| 2 | **Office tower** | First big move | Exterior; you rent one floor (cutaway is code) |
| 3 | **HQ building** | Long-running home | Reused for HQ campus extra buildings with recolors |
| 4 | **Data hall module** | Repeated across every data center campus | One module, tiled 2–6 times per site |
| 5 | **Fab building** | Late-game landmark | Exterior; bays and lines inside are code + #8 |
| 6 | **AGI Program building** | Endgame centerpiece | Grows/pulses while the program runs |
| 7 | **Reactor dome** | Power level 5 landmark | Placed at sites |
| 8 | **Lithography tool** | Star of the fab | Repeated in every production line |
| 9 | **Chip package** (die on substrate) | Hero of the chip designer | Code scales it to the die size |
| 10 | **HBM stack** | Exploded card | Code repeats it per stack in the design |
| 11 | **Accelerator board + cold plate** | Exploded card base and cooling layer | Code scales and explodes the layers |

| Budget | Credits |
|---|---|
| 11 models × (3 images + ~1.3 Meshy tries) ≈ 54 | ~595 |
| Style test (2 images + 1 model) first | ~41 |
| Retry buffer | ~65 |
| **Total** | **~700** |

Order: style test → #1 garage (first impression) → #9–11 hardware → #2–5 locations → #6–8 heroes.

## 2. Code (procedural)

### World and buildings
| Item | Why code |
|---|---|
| Ground, lots, roads, slabs, expansion scaffolding | Simple shapes, sized by game data |
| Interior floors, walls (cutaway), room grid, doors | Must follow your layout |
| Room templates' base geometry (desk pod, labs, break room, boardroom, legal office, vault, server room) | Shape from template size; furniture filled from free packs (§3) |
| Data hall interiors | Grid of racks you placed |
| Fab bays, conveyor/overhead track, line stage markers | Driven by line state |
| Acquired companies' buildings | Recolored variants of #3 HQ building with company colors |
| Substation, solar fields, wind turbines, water reclaim pools, cooling yard | Repeated, simple, sized by license levels |
| Construction scaffolding and timelapse | Animation of the same geometry |
| Fiber lines, power lines, light flows (training beams) | Effects driven by state |
| World map (schematic globe, site pins, overlays) | Data-driven |

### Hardware and equipment
| Item | Why code |
|---|---|
| **Rack** | Boxy; lights show training / serving / idle / throttled |
| **Server tray** | Holds 8 × chip package (#9) |
| **Cooling units** (air fans, liquid manifold, immersion tank) | Simple shapes; type swaps with upgrades |
| **Power units (PDU)** | Simple box with indicator |
| **Exploded card assembly** | Places Higgsfield parts #9–11 by your design numbers, plus procedural interposer, power stages and fans |
| **Die floorplan** (Blueprint) | Already built; drawn from the area split |
| **Wafer reveal** at tape-out | Disc with dies lit by yield |

### Models (AI) and products
| Item | Why code |
|---|---|
| **Model layer stack** (dense blocks / MoE experts) | Built from parameter count and architecture |
| Loss curve, training fill | Live data |
| App phone mockup, API console | UI drawn in HTML/CSS inside a 3D frame |
| Enterprise clients lighting up the city | Lights on existing city buildings |

### People
| Item | Why code |
|---|---|
| Staff figures | Capsule bodies + head, colored by role; idle / walk / sit / slump animations by code |
| **Department lead portraits** (10 × 3 expressions) | Stylized SVG avatars (shapes + palette), mood changes the expression |

### UI (2D)
| Item | Why code |
|---|---|
| All panels, cards, tables, charts, chips | React + CSS (built) |
| Icons (nav rail, resources, room templates, tracks) | Inline stroke SVG in layer colors (built for nav; extend) |
| Event cards per deck (news ticker, memo, official letter, chat, alert) | CSS styling (built), no illustrations |
| Rival and startup logos | Generated SVG monograms in each company's color |
| Main menu background | Blueprint grid in CSS (built), with a slow 3D flyover of your HQ |
| Victory / game over / pause screens | CSS (built) |
| Overlays (heat, power, morale, crowding, utilization, yield) | Shader tints on the scene |
| Particles: steam plumes, sparks, data flows | Three.js point sprites |

## 3. Free CC0 packs
Downloaded once into `assets/vendor/<pack>/` with each pack's license file kept. All restyled by the house shader.

| Item | Suggested source |
|---|---|
| Office furniture: desks, chairs, monitors, whiteboards, sofas, plants, coffee machines, bookshelves | Kenney *Furniture Kit*, Quaternius office packs |
| Lab props: benches, oscilloscope-like gear, tool carts, storage cabinets | Kenney / Quaternius sci-fi & industrial packs |
| Kitchen / cafeteria props | Kenney *Furniture Kit* |
| Garage interior clutter (boxes, shelves, folding table, workbench) | Kenney / Quaternius |
| City buildings for the skyline and the office district | Kenney *City Kit* (commercial / suburban) |
| Cars, trucks (chip deliveries), forklifts | Kenney *Car Kit* |
| Trees, bushes, rocks, fences | Kenney *Nature Kit*, Quaternius nature packs |
| Street props: lamps, benches, signs | Kenney *City Kit* |

Rules: only CC0 (no attribution required, commercial OK); check every Poly Pizza item's license individually; keep a `CREDITS.md` anyway.

## 4. Audio (for completeness)
Not Higgsfield (out of scope for this budget). Use free CC0 sound packs (Kenney *Interface Sounds*, *UI Audio*), and pick or commission music later.

## 5. Not in this budget (decide later)
- Steam store capsule images and trailer: needed before launch. GPT Image 2.5 is cheap (1.5 cr) if we top up, or commission an artist.
- Upgrading any code-made item to a Higgsfield model: the rack and server tray are first in line if more credits come.
