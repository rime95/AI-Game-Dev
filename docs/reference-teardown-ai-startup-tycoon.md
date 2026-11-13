# Mechanics Teardown — AI Startup Tycoon (reference game)

Sources: 7 player screenshots (late game, week 596), App Store listing (v1.1, Nov 2026), aistartuptycoon.com.
Confidence tags: **[seen]** visible in screenshots · **[stated]** from store/site text · **[inferred]** our deduction.

---

## 1. Time model
- **Turn-based by week.** "End week" button on every screen; date + week counter in HUD. [seen]
- Week 596 = Jun 1, 2037 → game starts ~Jan 2026, so the timeline tracks real-world AI history forward. ~52 turns/year. [inferred]
- All upkeep is quoted per week (data center: $1.3M/wk). [seen]
- Training, research and events have durations in weeks ("+5% sign-up odds · 2 wks"). [seen]

## 2. Resources
| Resource | Evidence | Role |
|---|---|---|
| Cash | $43.01B → $43.22B within the same week | Everything. Grows from users × pricing. |
| Research Points (RP) | 368,097 banked, +1,136/wk | Unlocks tree nodes; also sold as IAP. |
| Platform users | 942.41M, goal 1.00B | Main score/revenue driver; one shared pool across all models. Goals are milestone bars. |
| Staff | 18 total; Engineering 1, Research 3 | Department headcount gates throughput, not cash. |
| Compute (PF) | 24.74M PF at one site, 0% in use | Consumed by training + inference. |
| Reputation | event chips | Probably affects sign-ups, hiring, contracts. |
| Rival respect / hostility | event chips, per rival | Relationship meter with each competitor lab. |

[seen] values; roles [inferred].

**Balance observation:** late game has a huge surplus of cash and RP, and 0% compute utilization. The real bottleneck is **people and time** (1 engineer → one model at a time), not money. Money stops mattering late, which is a weak spot. [inferred]

## 3. Model pipeline
1. **Develop model** → pick type: Text / Image / Video / Audio / World. [stated/seen]
2. Pick **size, training data, compute**. [stated]
3. Runs through **stages**: core training → skills (reasoning, coding, math, languages, vision) → safety evals → fewer hallucinations. [stated]
4. **Release** → model is benchmarked; old models stay live while the next is built. [stated]
5. Engineers can also "bring your latest release to your platform" → models power **Platform & Modules** (apps, subscription tiers, API pricing). [seen/stated]

**Benchmark design (clever):**
- Scores are 0–100 on a named, versioned suite ("Suite v5"). Text Overall, plus sub-skills Knowledge/Coding/Math/… per modality. [seen]
- Tier labels on scores ("65.0 · Superhuman"). [seen]
- **Versioning the suite** keeps numbers in 0–100 forever while tech scales; when the suite saturates, a new version re-baselines everyone. Avoids number inflation. [inferred]
- Leaderboard holds 17 entries (labs can have several models). Your page shows "next to pass" plus the gap in points, so there's always a near-term target. [seen]
- At week 596 the player is #13 at 51.8 vs leader 65.6, so rivals scale hard and catching up is the core tension. [seen]

## 4. Rivals and events
- Parody labs (ClosedAI, Entropic, DeepBrain, Vox Systems, …) release on their own schedule, with version numbers ("v59"). [seen]
- Rival releases fire **press events**: a newspaper card, then a decision presented by one of your department characters (Sales Exec here). [seen]
- **Decision card format:** title, flavor line, then stat chips with exact effects:
  - cost ($300K), Reputation ±, Rival respect/hostility ±, timed buffs (sign-up odds +5% for 2 wks), probabilistic risks (25% chance · Reputation −1). [seen]
  - There's always a "do nothing" option. [seen]
- Event category tags ("PRESS · THE COMPETITION") suggest other decks: policy, contracts, staff, markets. [inferred]
- Also stated: government policy, contracts, stock market with listed rivals, valuation rankings. [stated]

## 5. Compute and data centers
**Geography:** world map with cities (HQ city, office cities) and compute sites at real data-center hubs, plus megaproject sites. Example counts: 4 cities · 8 compute sites · 3 megaprojects. [seen]

**Campus components** (each upgradable): [seen]
| Component | Example value | Effect |
|---|---|---|
| Halls | 4 of 6, 300 MW IT | Linear capacity; 75 MW per hall |
| Chips | Custom inference ASIC, 74,131 PF/MW | PF per MW; "Refit" swaps chip generation |
| Cooling | Immersion, PUE 1.14 | Energy overhead → running cost |
| Power | Redundant (+3% compute) / grid / solar+storage | Bonus vs cost/green trade-off |
| Network | Dual fiber (+8% compute) | Multiplier |
| Campus | Hyperscale (largest) | Hall cap |

**Capacity formula, verified exactly against the screenshot:**
```
capacity_PF = IT_MW × chip_PF_per_MW × (1 + network_bonus) × (1 + power_bonus)
            = 300 × 74,131 × 1.08 × 1.03
            = 24.74M PF  ✓
```
Cooling (PUE) probably doesn't affect capacity, only cost: running cost ≈ base + IT_MW × PUE × energy_price. [formula verified; cost model inferred]

## 6. Chip design (GPU Fab megaproject)
7-step wizard (the website says 3 steps, so the design probably changed). Step 1 "Brief": [seen]
- **Name** the chip.
- **Lineage:** from scratch, or iterate on a previous design → +5% "learnings" carried over (tech tree inside the hardware line).
- **Process node:** 1.4 nm GAA → 0.7 nm sub-nanometer (each gen unlocks a node).
- **Workload target:** Training / Balanced / Inference (should map onto data-center chip roles).
- **Quality tier:** Prototype (fast) / Standard / Refined +12% PF / Flagship +25% PF, a time/cost vs performance trade.
- Steps 2–7 unseen; likely compute units, memory/HBM, interconnect, power/thermal, tape-out, production. [inferred]
- Output feeds back as **PF per MW** for data-center refits, closing the hardware → compute → model loop. Fab has 12 bays of production lines. [stated]

## 7. Megaprojects (late game, IAP-gated) [stated]
- **Semiconductor fab:** custom chips + 12-bay production.
- **Orbital launch site:** stack booster + upper stage + data-center payload; 15 orbit slots across 3 orbits; satellites = compute in orbit.
- **Fusion plant:** solar → small reactor → superconducting magnets → fusion; −80% power cost, ×2 capacity.

## 8. Company, HQ and finance [stated/seen]
- HQ grows garage → five-block campus; rooms (desks, break room/morale, research studio, server room, boardroom) with 3 upgrade levels each.
- City map shows HQ floors ("3F"), purchasable buildings ("SALE"), and points of interest.
- Hire, train and level researchers/engineers; each department has a portrait advisor who gives the current hint.
- Funding rounds → board seats → IPO bell → stock trading.
- Research tab: Projects (parallel), Benchmarks, Megaprojects. Tree runs from attention to trillion-param MoE.
- Data tab: marketplace to buy, collect and clean training data.

## 9. Monetization map
| Lever | What it sells |
|---|---|
| Cash IAP ($0.99–$39.99, named after funding rounds) | Skip the economy |
| RP IAP ($0.99–$19.99) | Skip research time |
| Unlocks ($9.99–$19.99) | Megaprojects / "Unlimited Lab" (likely removes caps) |
| Rewarded ads | Opt-in boosts |
| Referral | $5M + 1,000 RP for both players |

Save is local-only (deleting the app loses progress). No cloud save. [stated]

## 10. Strengths to learn from
1. **Transparent numbers.** Every choice shows exact deltas, so decisions are legible.
2. **Versioned 0–100 benchmarks** keep comparisons meaningful forever.
3. **Always a "next target"** (next rival to pass, next user milestone).
4. **Real-world grounding** (real DC towns, PUE, nm nodes) with parody brand names.
5. **Clean multiplicative compute formula** that's easy to reason about.
6. **Narrative events tied to the sim** (rival release → your response).

## 11. Weaknesses and openings for our game
1. **Late-game sink problem:** billions in cash, 368K RP and idle compute. Our game needs scaling sinks (power contracts, chip tape-outs, talent wars, regulation).
2. **Hardware is a paid side-quest.** Make hardware/software co-design the core loop instead, where chip design choices constrain which model architectures train well.
3. **Headcount as hidden hard cap** (1 engineer) feels arbitrary; make team capacity a visible, plannable resource.
4. **Compute utilization 0% with no penalty:** idle capacity should cost (or be sellable as cloud).
5. **Local-only saves, iPhone-only, English-only:** easy wins on platform reach.
6. **Workload target vs chip role is shallow:** expand into a real trade-off (training throughput vs inference cost per token vs memory).
