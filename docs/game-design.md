# SAND TO MIND — Game Design Draft v0.1

*Working title. A strategy tycoon about building an AI company where the chips and the models are designed together.*

---

## 1. Pitch
Start with rented GPUs and three people. End with your own fab, your own power plants and a frontier model.
Every model you train runs on hardware you chose or designed, and every chip you design is only as good as the models it runs.
**Hardware–software co-design is the core loop, not a side quest.**

## 2. Design pillars
1. **Co-design is the game.** Chip specs and model architecture interact through a small set of readable formulas. The best players match them.
2. **Every number is legible.** Every choice previews its exact effect before you commit. No hidden multipliers.
3. **Success creates pressure.** Costs, rivals and scrutiny scale with you. There's no "$43B and nothing to spend it on" late game.
4. **Decisions over clicks.** Few actions per turn, each one meaningful. No idle tapping.

## 3. Structure
- **Turns = 1 week.** "Advance" runs week by week, or fast-forwards until the next decision (project done, event, threshold crossed).
- **Eras** gate scale and introduce new systems:

| Era | Compute | Hardware | Models | New systems |
|---|---|---|---|---|
| 1. Garage | Rent cloud GPUs by the hour | None, pick a cloud tier | Small text models | API, first hires |
| 2. Startup | Lease colo racks, buy vendor chips | Choose vendor SKUs, build clusters | Text + image | Funding rounds, data deals |
| 3. Scale-up | Own data centers | **First custom chip** via foundry partner | Multimodal, MoE | Consumer app, enterprise, power contracts |
| 4. Giant | Multi-site campuses | Advanced nodes, edge chips | Agents, world models | Own fab, regulation, IPO |
| 5. Frontier | Global compute + generation | Full vertical stack | AGI program | Endgame project, global policy |

## 4. Resources
| Resource | Notes |
|---|---|
| **Cash** | Revenue minus upkeep. Bankruptcy loses the game. |
| **Team capacity** | Staff produce *person-weeks* in 5 disciplines: Research, Model Eng, Hardware Eng, Product, Ops. Shown as a visible budget each turn, never a hidden cap. |
| **Compute** | Owned or leased capacity, described by a hardware profile (see §5), not a single number. |
| **Power (MW)** | Contracted supply per site. Hard ceiling on what you can run. |
| **Data** | Token pools by domain (web, code, science, multimodal, synthetic) with a quality score. |
| **Reputation** | Three meters: Public, Researchers (hiring), Government (regulatory treatment). |
| **Breakthroughs** | Research output. Not a bankable currency: research is staffed projects that take person-weeks + compute and finish with an unlock. Nothing to hoard. |

## 5. Hardware track

### 5.1 The hardware profile
Every chip (vendor or yours) is described by five stats:

| Stat | Unit | Matters for |
|---|---|---|
| Compute | TFLOPS (per precision: FP16 / FP8 / FP4) | Training, prefill |
| Memory bandwidth | TB/s | Inference decode, long context |
| Memory capacity | GB | Model size per chip, MoE |
| Interconnect | GB/s per link | Scaling across many chips |
| Power | W (TDP) | Site power budget, running cost |

Plus **unit cost** and **availability** (vendor allocation queue or your own production).

### 5.2 Chip design (Era 3+)
A design screen built around a **die area budget** (mm², set by process node):
- Split area between **compute cores**, **on-die SRAM**, **memory interfaces** (number of HBM stacks) and **interconnect links**.
- **Precision support:** adding FP8/FP4 units costs area but multiplies throughput for models that use them.
- **Target role:** training, inference, or edge (low power). This sets clock and power trade-offs.
- **Lineage:** iterating on a previous design is cheaper and less risky. A clean-sheet design costs more but has a higher ceiling.
- **Tape-out:** costs cash + Hardware Eng person-weeks + time. Rolls for **yield** and **bugs**, and a bad roll can force a costly respin. Risk is previewed as a % before you commit.
- **Process nodes** come from the research tree and from foundry partners. Later you can build your own fab.

### 5.3 Infrastructure
Chip → server → rack → hall → campus.
- **Site** choices: power price, renewable mix, climate (cooling), land, regulation, latency to users.
- **Cooling:** air / liquid / immersion. Sets PUE, so the site uses `IT_MW × PUE` from its power contract.
- **Cluster fabric:** the network tier sets how efficiently a training run scales over N chips.
- **Idle capacity is never free:** sell it on a **spot cloud market** at a fluctuating price, or pay full upkeep for nothing.

## 6. Software track

### 6.1 Model design
| Choice | Options | Effect |
|---|---|---|
| Architecture | Dense, MoE, hybrid (state-space), diffusion (image/video) | Each has its own demand profile |
| Parameters N | 1B → 10T+ | Capability, memory need |
| Training tokens D | from data pools | Capability, data cost |
| Context length | 8K → 10M | Usefulness for agents, memory-bandwidth need |
| Precision | FP16 / FP8 / FP4 | Faster/cheaper **only if the chip supports it**; slight quality risk |
| Post-training | Skills, safety, tool use | Benchmark sub-scores, incident risk |

### 6.2 The co-design math (simplified, shown to the player)
- **Training compute** = `6 × N × D` FLOPs (the real rule of thumb).
- **Effective cluster throughput** = `chips × peak_FLOPS(precision) × utilization`, where
  `utilization = arch_fit × fabric_scaling(N_chips)`.
  - `arch_fit` compares the model's demand profile to the chip profile. Example: MoE wants memory capacity + interconnect, so on a compute-heavy, memory-poor chip it gets maybe 0.35 instead of 0.6.
- **Training time** = training FLOPs ÷ effective throughput → weeks. You can trade chips (cash) against calendar time.
- **Inference cost** per million tokens depends mostly on **memory bandwidth** for decode. Chips designed for inference cut serving cost, which is where margin comes from.
- **Capability** follows a scaling curve in N and D with diminishing returns, multiplied by data quality and research unlocks. The UI shows the projected score range *before* the run starts.

This is the hook: a player who designs an inference chip with huge bandwidth and FP4 can serve a big MoE model at half a rival's price.

### 6.3 Training runs
- Runs take weeks and lock the compute they use.
- Risk events during a run: loss spikes, hardware failures (more likely on new chips), data contamination. Each has a decision: roll back, push on, or patch.
- Checkpoints let you release early at partial capability.

### 6.4 Evals
- Each modality has a **frontier eval suite**. Scores are a % of that suite.
- When the top models saturate a suite (~90%), it's **retired** and a harder suite replaces it. Everyone's scores drop and get re-baselined, so the race never inflates into meaningless numbers.
- A leaderboard always shows the next rival above you and the gap.

## 7. Products and revenue
| Product | Revenue | Key lever |
|---|---|---|
| **API** | per-token price × usage | price vs demand elasticity; serving cost sets margin |
| **Consumer app** | subscription tiers | model quality, features, marketing |
| **Enterprise** | multi-year contracts | reliability, safety record, Government rep |
| **Cloud** | spot + reserved compute sales | idle capacity, chip generation |
| **Edge chips** (Era 4) | units sold to device makers | edge chip design + small models: the other co-design payoff |

- **Serving capacity** must cover demand. Shortfall causes latency, churn and reputation loss. Over-provisioning wastes money unless you sell it on the cloud market.
- Users are segmented (consumers, developers, enterprise) with different sensitivities to price, quality and trust.

## 8. Rivals
5 fictional labs that run the same simulation with simple AI personalities:
- **Helix Dynamics:** scale at all costs, burns cash, ships fast.
- **Aurora Collective:** open-weights. Undercuts API pricing and drains your developer users.
- **Kestrel Research:** safety-first. Slow, trusted by governments.
- **Monolith Semiconductor:** a chip vendor that turns into a model lab. Your supplier becomes your rival.
- **Tessellate:** a big-tech incumbent with distribution and cash, but slow on the frontier.

Rival actions feed events: poaching your staff, price wars, chip allocation fights, regulatory lobbying, partnership offers.

## 9. Events and decisions
- **Dilemma cards:** 2–4 choices, each with exact effect chips (cash, reputation meters, timed modifiers, % risks).
- Decks: Talent, Press, Supply chain (shortages, export rules, fab fires), Regulation, Incidents (jailbreaks, outages, leaks), Board/Investors, Partnerships.
- Events react to state: launching an under-tested model raises the chance of incident cards.

## 10. Company and finance
- **Hiring:** candidates have discipline, level and traits. Researcher reputation and compute access attract talent, and rivals bid for your best people.
- **Org:** each discipline lead is a named character who gives advice and appears in events.
- **Funding:** seed → series → IPO. Investors set expectations (growth targets). Missing them costs board confidence.
- **Board confidence** is a meter. At 0 you're ousted (loss).
- **Public company:** share price reacts to launches, benchmarks and incidents. Quarterly earnings are a recurring test.

## 11. Late-game sinks (no idle money)
Only five sink categories. Each one **scales with capability tier** (your best model's frontier-eval band) and/or **footprint** (total MW). Each is an investment that unlocks or protects something, never a flat tax.

### 11.0 The gate: "License to Scale"
Every training run has a capability tier. Starting a Tier *N* run needs four thresholds, shown as a checklist with costs to close each gap:

| Requirement | Tier 1 | Tier 3 | Tier 5 (frontier) |
|---|---|---|---|
| Power secured | grid contract | dedicated supply | own generation |
| Safety level | basic evals | red team + weight security | full safety case |
| Compliance | registration | audits in each market | frontier license |
| Environmental | permit | water + carbon targets | net-positive water, near-zero carbon |

*(Numbers are placeholders; balance later.)* Missing a requirement doesn't hard-block the run, but it raises incident, fine and permit-loss risk sharply. The preview shows the exact %.

### 11.1 Power generation
- Grid contracts cap out at each site, so growth beyond that means building **your own generation**: solar + storage, wind, geothermal, gas with carbon capture, small modular reactors, then a long fusion research program.
- Heavy capex: lowers cost per MWh and raises the site's max MW. Each source has build time, reliability, a carbon score and permitting difficulty.
- Interacts with environmental (carbon) and compliance (nuclear licensing).

### 11.2 Safety
- **Required safety level rises with capability tier.** It's built from evals, red-teaming, interpretability research, alignment post-training and **model-weight security** (protecting your weights from theft).
- Ongoing cost: a **safety compute share** (% of your compute reserved for safety work) plus a staffed safety team.
- Below requirement → higher incident chance (jailbreaks, misuse, leaks), and at high tiers regulators can block a release.
- Required for the "Safe Frontier" win.

### 11.3 Compliance
- **Per jurisdiction:** each market you sell in has rules (registration, audits, transparency reports, frontier-model licensing, chip export controls).
- Cost scales with capability tier × number of markets, so expanding globally means compliance overhead.
- Non-compliance → fines, then loss of market access.
- High market share triggers **antitrust review** of acquisitions (links to 11.5).

### 11.4 Environmental
Tracked **per site**, with thresholds that scale with MW and capability tier:
- **Water:** usage effectiveness (WUE). Upgrades: closed-loop cooling, water reclaim / recycling plants, air-side economizers, using treated wastewater instead of potable water. Late goal: water-positive sites.
- **Carbon:** renewable share of power and emissions per MWh. Ties to power generation choices.
- **Heat reuse:** sell waste heat to district heating or greenhouses. Small revenue + local reputation.
- **E-waste:** chip and server recycling when you refit to a new generation. Recovers some value, cuts environmental penalties.
- **Effects:** new-site permits depend on your environmental record, local community reputation affects expansion, and regulators tighten targets as you grow.

### 11.5 Acquisitions
- Buy other companies for what they own: **teams** (instant person-weeks + named talent), **IP** (research unlocks, chip designs), **data** (token pools), **infrastructure** (sites, power projects) or **customers**.
- Price scales with the target's value and the market. Struggling rivals sell cheap after failed launches.
- **Integration:** takes time and Ops capacity, with culture-clash risk (some acquired staff leave).
- **Antitrust review** above market-share thresholds can block deals or attach conditions (compliance link).

## 12. Win and lose
**Win (pick your victory at Era 4):**
- **Safe Frontier:** complete the AGI Program with a safety score above the threshold.
- **Market Leader:** hold the #1 valuation for 2 straight years.
- **Full Stack:** your own fab + chips + #1 model on a frontier eval at the same time.

**Lose:** bankruptcy, board ousts you, or a catastrophic incident (only possible with very low safety investment, and telegraphed well in advance).

## 13. Presentation (distinct identity)
Growth along two tracks (HQ: garage → office → HQ building → HQ campus; sites: data center campuses → fab), room templates, server rooms and every design visual are specified in [world-and-facilities.md](world-and-facilities.md).

Full direction in [art-direction.md](art-direction.md). Summary:
- **"Daylight & Blueprint":** a bright low-poly campus diorama for running the company; it dissolves into blueprint when you open a design tool (chip, model, site).
- **Color is a system:** one color per stack layer (silicon, compute, power/environment, models, products, trust), used in the world, UI, charts and effect chips.
- **The world shows the simulation:** rack lights show utilization, training runs flow as light, License to Scale is scaffolding with four signs.
- **"The Stack"** becomes an overlay view: a layered diagram from fab to users, with bottlenecks glowing red.
- **World map** for siting data centers, with power price and climate overlays.
- Tone: grounded, warm, slightly wry. Not satire-heavy.

## 14. MVP vertical slice
Goal: prove the co-design loop is fun.
- Eras 1–3 (garage → first custom chip).
- 3 vendor chips + custom chip designer (die-area split, 2 nodes, tape-out risk).
- 1 data center type, 2 sites, 2 cooling options.
- Text models only: dense + MoE, with the full training math.
- API + consumer app products, spot cloud market.
- 3 rivals, 1 eval suite with one retirement event.
- ~30 event cards.
- Save/load.

**Success test:** a new player understands why their MoE model ran badly on chip X, then designs chip Y to fix it, within 2 hours of play.

## 15. Decisions made
- **Platform:** Windows PC only, shipped on Steam. Mouse + keyboard, dense UI is OK.
- **Rendering:** Three.js. Full stack in [tech-stack.md](tech-stack.md).
- **Late-game sinks:** only power generation, safety, compliance, environmental and acquisitions (§11).

## 16. Open questions
1. **Business model:** premium (one-time price) vs free-to-play. This drafts toward premium: no paywalled content, no energy timers.
2. **Turn length:** weekly turns with fast-forward (current draft) vs monthly turns?
3. **Realism dial:** keep real formulas like 6ND visible, or hide them behind simpler scores with a "nerd mode" toggle?
4. **Real-world anchoring:** start in the present day (2026) with fictional companies, or an alternate timeline?
