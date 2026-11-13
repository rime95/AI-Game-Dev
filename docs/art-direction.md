# Visual & UX Direction — Sand to Mind

How the look, the feel and the gameplay fit together. Written before any code so the scaffold is built for it.

## 1. What we take from the reference (and what we don't)
The reference screenshots get the *vibe* right for this genre. We borrow the **qualities**, not the look:

| Quality we want | How the reference does it | How we do it (our own) |
|---|---|---|
| Friendly, toy-like 3D world | Isometric low-poly city | Low-poly **campus diorama on a floating slab** that physically grows each era |
| Bright, optimistic, readable | White cards, saturated accents | Warm daylight palette + **one color per stack layer** (§3) |
| Characters with personality | Rounded 3D avatars | **Illustrated 2D portraits** with a fixed style sheet (cheaper, AI-friendly, distinct) |
| Drama from rivals | Newspaper headline card | **Different media per event deck:** news ticker, board memo, regulator letter, staff chat (§6) |
| Numbers you can trust | Effect chips on choices | Effect chips **colored by the layer they touch** |
| A hardware "wow" moment | Exploded GPU card render | **Die floorplan you paint**, extruding into a 3D chip (§5) |

We don't copy: the city map, the globe, the bottom tab bar, the avatar style, the newspaper format, the colors or the layouts. The PC landscape screen also forces a different layout anyway (§7).

## 2. Core concept: "Daylight & Blueprint"
Two visual modes, and the switch between them *is* the gameplay split:

- **Daylight mode = running the company.** The bright low-poly diorama: buildings, staff walking, racks blinking, trucks delivering chips, cooling towers steaming. You read the state of your company by looking at it.
- **Blueprint mode = designing things.** When you open a design tool (chip designer, model designer, site planner), the world **dissolves into blueprint**: white lines on deep blue, dimension labels, exploded views. It's the engineer's lens.

Why it works:
- Every switch tells the player "you're now making a decision that matters."
- Both modes come from the same models: blueprint is a **shader over the same geometry**, so no extra art.
- It's the game's signature screenshot: half the campus in daylight, half dissolving into blueprint.

## 3. Color is a system
Each layer of the stack has one color, used **everywhere** that layer appears: building trim, UI section headers, chart lines, effect chips, particles, notification icons.

| Layer | Color (working) | Appears as |
|---|---|---|
| Silicon (chips, fab) | Teal | Fab building, chip UI, hardware stats |
| Compute (data halls) | Electric blue | Racks, utilization lights, PF numbers |
| Power & environment | Amber / leaf green | Generation, cooling, water reclaim, carbon |
| Models (research, training) | Violet | Labs, training beams, eval scores |
| Products & users | Coral | Storefront, user counts, revenue |
| Trust (safety, compliance, reputation) | Slate + gold | Vault, legal office, license checklist |

Neutrals: warm cream background, soft charcoal ink text. Exact hex values get defined in a style tile and checked for contrast (see §10).

**Gameplay payoff:** an effect chip like `−8% serving cost` in blue+coral tells you at a glance it touches compute and products. A red pulse on the blue part of the stack = compute bottleneck.

## 4. The world shows the simulation
> The full tycoon layer (growth stages, room templates on a grid, server rooms and data halls, the fab, exploded design visuals) is specified in [world-and-facilities.md](world-and-facilities.md). The table below is the first-pass placeholder campus.

Rule: **every major system has a physical place, and its state is visible without opening a menu.**

| System | In the diorama |
|---|---|
| Compute utilization | Rack lights: dark = idle (visible waste), blue = serving, violet = training |
| Training run | Violet light flows from the data hall to the research lab; a progress ring sits above the hall |
| Chip production | Trucks from the fab (or the foundry partner's dock) to the data halls |
| Power | Solar fields, turbines, reactor domes; power lines brighten with load |
| Environmental | Water reclaim pools, steam plumes (thin when efficient), green roofs |
| Safety | A secure vault building; its shield glows when the safety level meets the current tier |
| Compliance | A legal office with stamped documents; markets show as flags on the HQ |
| Acquisitions | The acquired company's building moves onto your slab and gets "re-skinned" in your colors over a few weeks (integration progress) |
| Staff & morale | People walking between buildings; slumped/quick walk shows morale |
| Users | A city skyline at the edge of the slab: windows light up as users grow |

**License to Scale** is physical: the next slab expansion sits behind scaffolding with four signs (power, safety, compliance, environmental). Each sign turns green as you meet it, and you can see exactly what's missing.

## 5. The co-design moments (the hero screens)
These are where the game is unique, so they get the most polish:

1. **Chip designer (Blueprint mode):** a top-down die floorplan. You drag dividers to split area between compute, SRAM, memory interfaces and interconnect, and the blocks resize live. Stats update instantly. Then the die **extrudes into a 3D chip** and drops onto its package, with a satisfying thunk.
2. **Fit view (model ↔ chip):** your model's demand profile and the chip's profile shown as two overlaid shapes (a radar of the five stats). Overlap = efficiency. You *see* why your MoE model starves on a memory-poor chip.
3. **Tape-out:** a tense reveal: the wafer spins, dies light up green (good) or red (defects), and the yield % counts in.
4. **Training run start:** the data hall racks switch to violet in a wave.
5. **Release:** the eval score lands on a leaderboard with a camera move to your lab.

## 6. Events: the medium is the message
Each event deck has its own presentation, so players know what kind of decision it is before reading:

| Deck | Medium |
|---|---|
| Press / rivals | Breaking-news ticker + article card |
| Board / investors | Typed memo on letterhead |
| Regulation / compliance | Official letter with a seal |
| Talent | Chat messages from staff |
| Supply chain | Logistics dashboard alert |
| Incidents | Red alert overlay with a timer |

All of them end in the same consistent **choice cards with colored effect chips**, so the decision UI stays familiar.

## 7. PC screen layout (landscape, mouse + keyboard)
```
┌──────────────────────────────────────────────────────────────┐
│ Resource bar: cash · team capacity · compute · power · rep   │  ← always visible
├────┬───────────────────────────────────────────┬─────────────┤
│Nav │                                           │  Context    │
│rail│        3D diorama (daylight)              │  panel      │
│    │        or blueprint tool                  │  (selected  │
│    │                                           │  building / │
│    │                                           │  task)      │
├────┴───────────────────────────────────────────┴─────────────┤
│ Event feed / ticker                  [ Advance week ▶ ]      │
└──────────────────────────────────────────────────────────────┘
```
- Nav rail on the left (icons in layer colors), context panel on the right, diorama in the middle. Very different from a phone's bottom tabs.
- Click a building = open its panel. Every screen is also reachable from the nav rail and hotkeys.
- Tooltips everywhere with the formula behind each number (legibility pillar).

## 8. Characters
- Department leads are named characters with **illustrated 2D portraits** in one consistent style (shape language + palette defined in a character sheet before generating any).
- 3 expressions each (neutral, happy, worried) for reacting to events.
- In the diorama, staff are tiny simple figures, so no detailed 3D characters are needed.

## 9. Motion & audio
- **Motion:** springy, quick UI (≤200 ms); slow ambient world motion; big moments get a short camera move. Nothing blocks input for more than a second.
- **Audio:** warm synth/lo-fi music that **adds layers each era** (garage = sparse, frontier = full). Distinct sounds per layer color (silicon = crisp clicks, power = hums, models = soft chimes).

## 10. Production plan (art fits the tech stack)
- **Low-poly + flat colors + house toon shader** means AI-generated models (e.g. Higgsfield) get re-skinned by our materials and always match. This is the same "shaders define the style" rule as in [tech-stack.md](tech-stack.md#art-asset-pipeline).
- Blueprint mode is a second shader on the same models: zero extra assets.
- **Before coding the full UI**, produce a **style tile** (palette, type, effect chips, one card, one icon set) and **one target mockup** of the main screen. Everything else follows from those two.
- Placeholder phase: buildings are colored boxes **in their layer color**, so the color system works from the first playable build.

## 11. Open questions
1. Does "Daylight & Blueprint" match the vibe you want, or should it lean even cozier (or more serious)?
2. Camera: fixed isometric angle (classic, easy to read), or free orbit (more 3D wow, harder UX)? Recommendation: isometric with limited rotation in 90° steps.
3. Portrait style: semi-realistic illustration, flat vector, or stylized painterly?
