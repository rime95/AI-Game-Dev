# World & Facilities — Sand to Mind

How the company grows from a garage to gigawatt sites, and how every room, rack and design is both a visual and a game mechanic.
Decisions locked in: **room templates on a grid**, **soft desk cap**, **cooling capacity per room**.
All numbers are first-pass placeholders for the balance runner.

---

## 1. Principles
1. **Every placed thing changes a number; every number shows up in the world.** No decorative-only rooms.
2. **Start small, become big.** Space is the first constraint you feel; outgrowing it is a decision, not an automatic upgrade.
3. **Same system everywhere.** Garage, office, campus, server room, data hall and fab all use one grid-and-template system, so later stages are cheap to add.
4. **Readable at a glance.** Overlays and hover cards explain every bonus and penalty with the exact formula.
5. **Our own look.** Genre conventions (isometric cutaway, room templates, site views) in the daylight/blueprint style and layer colors from [art-direction.md](art-direction.md). Nothing copied from the reference game's layouts or art.

## 2. Growth stages

| Stage | Space | How you get there | What it unlocks |
|---|---|---|---|
| **Garage** | 1 floor, 6×4 tiles | Start | Up to ~5 desks, 1 shelf rack, a box fan |
| **Office floor** | 1 floor, 14×10 tiles, rent $40K/wk | Series A *or* $20M cash | Real rooms, a small server room |
| **Campus building** | 3 floors × 20×14 tiles; build $60M or lease $250K/wk | Series B | Specialized labs, boardroom, cafeteria, larger server room |
| **Campus** | Several buildings on a lot | Series C | Extra buildings (acquired companies, chip lab, vault), on-site substation |
| **Data center sites** | Separate locations; each has 2–6 halls of 20×12 tiles | Power license level 3 | Large-scale owned compute, hall interiors, world map |
| **Fab** | Cleanroom of 12 bays | Series D / IPO money, Power level 4, 4+ hardware engineers | Your own chip production (§7) |

- **Moving is a choice** with a cost and a short move-in: a few days of lower productivity while people unpack.
- **Earlier locations aren't thrown away:** the garage becomes a memorial landmark on the campus, a nice nostalgia beat.
- **Transition moments:** the camera pulls back, a construction timelapse plays, and a news card announces the move ("We're out of the garage").

## 3. Views and camera
- **Location view** (default): an isometric cutaway with walls cut to knee height. Floors are switched with tabs on multi-floor buildings.
- **Site view:** the exterior of a data center or fab. Click a hall to enter its interior grid.
- **World map** (from the sites stage): a schematic globe with your sites, plus power-price and climate overlays.
- **Blueprint mode:** any design tool (chip, model, rack, site plan) turns the scene into blueprint, as in art-direction §2.

## 4. Rooms (templates on a grid)
You pick a template, drag it onto free tiles, and rotate it in 90° steps. Furniture fills in automatically. Each template has a footprint, a build cost, weekly upkeep and **seats** (staff it supports).

| Template | Footprint | Seats / capacity | What it does |
|---|---|---|---|
| **Desk pod** | 2×2 | 4 desks | Generic desks. Every employee needs one (§5) |
| **Research lab** | 4×3 | 6 researchers | Researchers give their compute bonus only while seated in a lab |
| **Hardware lab** | 4×3 | 4 benches | Needed to start a tape-out; each staffed bench cuts bug risk |
| **Ops room** | 3×3 | 4 ops engineers | Ops bonuses (hardware failures, culture clash) need seats here |
| **Product studio** | 3×3 | 4 product managers | App conversion and enterprise account capacity need seats here |
| **Break room** | 3×2 | serves 20 staff | Morale |
| **Cafeteria** | 4×4 | serves 60 staff | Morale (bigger) |
| **Boardroom** | 3×3 | — | Required before Series B+ investors will meet you |
| **Legal office** | 2×2 | — | Required for Compliance level 3+ |
| **Secure vault** | 2×2 | — | Required for Safety level 3+ (weight security) |
| **Server room** | min 4×3, any size | racks inside (§6) | Houses owned chips at HQ |

Rules:
- A staff member without the right room still works, but **only generic work**. For example, an unseated researcher adds nothing to compute. The hover card says exactly why.
- Rooms can be **upgraded in place** through 3 tiers. Better equipment adds +10% / +20% to the room's effect, and the furniture visibly changes.
- **Adjacency bonus (light touch):** labs next to a break room +5% morale for that team. One rule only, to keep it readable.

## 5. Staff, desks and morale (soft cap)
- **Desk capacity** = desks + seats in specialized rooms.
- **Crowding** = staff ÷ desk capacity. Above 1.0:
  - **Productivity** × `1 / crowding²` for everyone (110% crowded → −17%, 130% → −41%).
  - **Morale** drops 2 points a week while overcrowded.
- **Morale** (0–100) comes from break space per person, crowding and recent events (wins, incidents, layoffs). It multiplies productivity from ×0.8 to ×1.1.
- **Productivity** scales staff-driven effects: research bonus, tape-out risk reduction, ops and product bonuses, training cluster size per engineer.
- **Visible:** people sit, walk and gather in break rooms. Overcrowded staff stand or share desks, and low morale shows as slumped posture plus a small cloud icon. The top bar shows desks as **used / total** in the style of a desk counter.

## 6. Server rooms and data halls
Same template system, with equipment instead of furniture:

| Object | Footprint | Capacity |
|---|---|---|
| **Rack** | 1×2 | 32 chips (any one chip type) |
| **Cooling unit** | 1×1 | air 60 kW · liquid 250 kW · immersion tank 600 kW (also holds 32 chips) |
| **Power unit (PDU)** | 1×1 | 200 kW |

- **Owned chips must be racked.** Buying chips without rack space puts them "in storage", where they do no work. Rented chips stay in the cloud and need no space.
- **Cooling capacity per room** (simplified, as decided):
  - Room heat = Σ chips × watts × PUE.
  - If heat > the room's cooling capacity, every chip in that room **throttles** to `capacity / heat`.
  - The heat overlay tints the room from blue to red as decoration only. It isn't a per-tile simulation.
- **Power per room:** racks beyond PDU capacity won't power on. Site power from the License to Scale track still caps the total.
- **Cooling tiers are visible:** air (fans and vents) → liquid (pipes and manifolds) → immersion (tanks). Moving up also lowers PUE, which cuts the power bill.
- **Rack lights:** violet = training, blue = serving, dark = idle, red blinking = throttled.
- **Data center sites** reuse this inside each hall. Outside, the site shows halls, cooling yards, substation, water reclaim and generation, all driven by the hall interiors and your license levels.

## 7. The fab (late game)
- **Cleanroom of 12 bays.** You place a **production line** in a bay. A line is a chain of 4 tool groups: **lithography → deposition/etch → test → advanced packaging**. The slowest stage sets the line's throughput.
- **Each line is built for one process node.** Retooling to a newer node costs cash and weeks of downtime.
- **Lines run continuously** on a chosen chip design. There are **no idle "waiting for orders" lines**:
  - Output goes straight into storage and your fleet.
  - Surplus can be **sold on the chip market**, so you become a supplier.
  - Idle lines still cost upkeep.
- **Yield learning curve:** new lines start at low yield and improve with wafers produced, so unit cost falls over time.
- **Bottlenecks:** HBM memory supply (bought from outside, weekly allocation) and packaging capacity are the classic chokepoints. They're visible as red stages on the line.
- **Fab incidents**, in the same format as training incidents: cleanroom contamination, a lithography tool breakdown, an HBM shortage, each with choices.
- **Heavy on resources:** a fab draws large power and water, so it ties into the Power and Environmental license tracks.
- **Visuals:** wafers move along an overhead track. Line lights show running, retooling, blocked or contaminated. Overlays show yield and utilization per line.
- **Full Stack win becomes:** your own fab supplies 50%+ of your fleet, plus Power level 5 and #1 on the eval.

## 8. Every design is a visual (Blueprint mode)
All of these are **generated from the design's actual numbers**, so they always match the game state:

| Design | Visual |
|---|---|
| **Chip** | Floorplan → extruded 3D die → package → **exploded accelerator card** (die, HBM stacks, interposer, power stages, cold plate). You can rotate it. The number of HBM stacks, die area split and precision units all reflect the design. A tape-out plays a wafer reveal. |
| **Server / rack** | An exploded server tray (8 chips, network cards, cooling plates) sliding into a rack. |
| **Model** | An exploded **layer stack**: dense blocks or MoE experts that light up per token. Height scales with parameter count. During training the stack fills in, with a live loss curve. |
| **Products** | An app mockup on a phone with your company name, an API console, and enterprise clients as lit buildings in the city. |
| **License upgrades** | Physical builds: solar fields, reactor domes, water reclaim pools, a vault, a legal office. |
| **Acquisitions** | The acquired company's building moves onto the campus and is re-skinned in your colors. |

## 9. Tycoon tools
- **Overlays:** heat, power, morale, crowding, utilization, and yield (fab).
- **Hover cards** on every room or object, with the exact effect and formula, e.g. "Research lab · 6/6 seated · +18% effective compute (6 × 3%)".
- **Build mode:** template palette, ghost preview turning green or red for valid placement, cost shown before placing, rotate with R, refund 50% on demolish.
- **Advisor nudges** when something is wrong in the world ("The server room is throttling: add cooling").

## 10. What changes in the simulation
New state:
- **Locations:** the current one plus history.
- **Buildings and floors:** a grid size per floor.
- **Placed rooms:** template, tier, position and rotation.
- **Placed equipment:** racks, cooling units and PDUs, with chip assignment per rack.
- **Morale.**
- **Sites:** location, power, halls.
- **Fab lines:** node, design, yield, wafers produced.

Systems that change:
- **Researcher, ops, product and hardware bonuses** become seat-based, scaled by productivity. Today they are simple per-head bonuses.
- **Owned chips** need rack space and are throttled by room cooling. Today only site power limits them.
- **License levels 3+ for Safety and Compliance** need the vault and legal office rooms.
- **Series B+ funding** needs a boardroom.

Unchanged: rented cloud chips, training math, eval suites, products, acquisitions and victory logic.

The simulation stays authoritative and testable. The layout is game state, and the 3D view only renders it.

## 11. Build order (each step playable)
1. **Grid + templates + garage/office:** build mode, desk pods, research lab and break room, soft desk cap, morale, seat-based research bonus. Garage → office move.
2. **Server rooms:** racks, cooling and PDUs, racked owned chips, throttling, rack lights, heat overlay.
3. **Campus building and campus:** multi-floor, remaining room templates, boardroom and vault/legal requirements, acquired buildings.
4. **Exploded chip card** and model layer stack in Blueprint mode.
5. **Data center sites, hall interiors and world map.**
6. **Fab:** lines, nodes, yield, HBM and packaging bottlenecks, selling surplus chips.
7. **Product visuals and polish:** transitions, the garage memorial, nudges.

Each step brings its own tests and a balance runner pass, like earlier features.
