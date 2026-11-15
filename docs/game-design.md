# Sand to Mind: game design (v2, the reboot)

You run a chip company from a 1991 garage to the AI age, in real time. Days tick by and the clock **pauses itself** whenever something needs you. Prompts never time out, and nothing punishes taking your time.

Simulation: `packages/sim/src/v2`. UI: `packages/app/src/v2`. Every number is temporary and lives in `v2/data.ts` (and the `FAC`, `LOANS`, `HR_LEVELS`, `REGIONS`, `IPO` and `MARKET_MODEL` tables).

## Design rules
- **Rivals never get ahead of you.** A rival product's score is capped just below your best in that market, every day (`rivalScore`). The pressure comes from elsewhere:
  - how close they get
  - price cuts and price wars
  - launch timing
  - poaching your people
  - share they take in markets you neglect
- **No rushing.** Projects have no deadlines or cadence, and cards wait for you. A "relaxed" bot that acts half the time must still grow without going bankrupt (a test checks this).
- **No era jumps.** You move forward by researching technology at your own pace, with no year gates. Breakthroughs name the eras ("The 3D boom", "The AI age"). Rivals follow a few months behind.
- **The three tests** (from Grounds Up): every system creates a meaningful decision, stays relevant when the company is large, and can be automated (by executives).
- **Real brands, simulated behaviour.** Rivals, magazines and stocks are real names. This is a private build: all results and events are fictional.

## The loop
1. **Studio: the design wizard.**
   - One question per step, with the product as a big rotatable exploded 3D model above it (`v2/hero`), built from your choices: the die face is your actual layout.
   - Steps:
     1. **Brief:** name; build on an earlier chip (keeps its layout and learnings: +5% performance, fewer bugs, 40% less design work); product (CPU, GPU, console, phone chip, server CPU, AI accelerator, AI model); market; quality tier (Prototype −10% / Standard / Refined +12% / Flagship +25%, more work as you go up).
     2. **Process:** die size (S, M, L, or XL after multi-core) and process node.
     3. **Die layout** (or the compute plan for AI models).
     4. **Memory and cooling:** more memory is faster but costs more; a bigger cooler raises the heat budget. Both show on the 3D model (memory chips, HBM stacks, fans).
     5. **Team.**
     6. **Review:** expected score, best rival, cost per chip, masks.
   - **Die board:** place blocks on a grid.
     - Neighbour bonuses: cache next to cores, FPU next to a core, pixel pipe next to memory, and so on.
     - I/O must sit on the edge.
     - Some blocks only count up to a limit (`maxUseful`).
     - There is a heat budget: going over throttles speed and adds bugs, while unused headroom counts as efficiency.
     - Each market weights speed, graphics, efficiency and features differently. Launches teach you those tastes (the design notebook).
     - Empty tiles are trimmed off the die: a sparser layout makes a cheaper chip.
     - Layout help: without a Chief Engineer, only a starter layout (just the blocks the chip needs). An engineer drafts full layouts but leaves tiles unfinished (more the fewer stars they have). The puzzle stays yours.
   - **AI models** use the same board as a compute plan, built from compute clusters, training data, safety teams and human feedback.
2. **Build.**
   - Assigned people turn skill into design points, then engineering points. Morale, burnout, traits, crunch and HQ crowding all matter.
   - **Testing** finds hidden bugs: fix each one (costs time) or ship with it (costs review points). Testing past 100% finds bugs faster.
   - **Tape-out** pays for the mask set (there must be cash for it). The chip then spends days at the fab.
3. **Launch.**
   - Set the price against the fair-price gauge and pick a launch push. Launching within 15 days of a rival in the same market halves your buzz.
   - Four magazines review the chip. The launch earns research points, brand, and one new fact about what that market's buyers want.
   - **The press remembers.** Each chip is judged against the market bar or 95% of your best die in that market, whichever is higher. Matching your last chip scores about 6; a big leap scores 9 or more. "Beat your last chip" is the goal all game, and scores don't pile up at 10.
4. **Sell.**
   - Buyer pull = brand × 2^(score − 5) × (fair ÷ price)^sensitivity × hype × your reach. You share each market with rivals and small makers.
   - Products age as the market bar rises. Refreshes, re-pricing and retiring are real decisions.

## Systems
- **Brand** grows with share and good launches (less the better known you are) and fades about 3.5% a month toward where you started.
- **People:** candidates with three skills, traits, levels, XP, salaries, morale and burnout. Crunch speeds work up but wears people out. Stars get poach offers (counter-offer or let them go). The HR department adds morale, fewer people quitting and better candidates.
- **Executives:** Chief Engineer, CMO, CFO and Head of Research. Each has 1–5 stars, an autopilot switch and a "Lately" log, and answers the decision cards in their area. A CMO on autopilot also retires chips a newer one has replaced.
- **Rivals:**
  - Each one announces products on a launch calendar.
  - They follow your lead: each new rival chip aims a little behind your best recent launch in that market (premium and copycat rivals close, price-cutters further back; rattled and desperate rivals try harder). The "never ahead" cap is only a ceiling. A market you keep fresh is a clear lead; one you neglect is where they catch up.
  - A monthly **strength** score sets their **mood** (confident, rattled, desperate, for sale), with hysteresis so it doesn't flicker.
  - Rattled rivals offer truces; desperate ones start price wars.
  - Beaten rivals put themselves up for sale, priced by mood. Bought rivals go on a trophy wall.
- **Research:** a branching tree of about 35 technologies. Deeper technologies cost more.
  - Breakthroughs: 3D graphics, consoles, mobile, multi-core, neural networks on silicon, large language models, and towards general intelligence.
  - Perks: design tools, test lab, marketing, recruiting, driver platform, data center and fab engineering, alignment.
- **Decision cards:** about a dozen chip-world events whose choices state their numbers. They never repeat within 168 days and they wait for you. A choice that costs more cash than you have can't be picked. The angel investor buys 15% of the company for good.
- **Money:**
  - Monthly books, and a "last month" report that explains why the numbers moved.
  - Statements, and a year-in-review card.
  - Bank loans: up to 3× a year of profit, at a drifting base rate.
  - Investors offer cash against a sales target; missing it costs you.
  - Sales offices widen how much of the world can buy from you. Office and HR prices keep up with the company (offices with a year of sales, HR with headcount).
  - Corporate tax: 25% of each month's profit.
  - **R&D budget:** turn cash into research points (contract labs and grants) with diminishing returns: the money sink that stays useful all game.
- **Products you can see:**
  - **First silicon:** when a chip comes back from the fab, its wafer spins and the dies light up good or bad. Yield is real: a fresh node starts around 72% and matures toward 93% over about two years (faster in your own fab), shipped bugs lower it, and cost per chip = cost ÷ yield.
  - **Box art:** every chip gets an era-styled box with its die shot, score sticker and node. It appears on the review card, on the Products shelf (click a box to see the chip in 3D), and on the display wall in the HQ.
- **Compute campuses** (`v2/compute.ts`, the Compute tab):
  - You build at real data-center towns, each with its own power price and climate (Dublin, Tokyo and Singapore need an office in that region).
  - A campus has six parts, each upgraded with one button: halls (20 MW each), chips (refit with your own AI accelerators or bought Nvidia GPUs: PF per MW), cooling (PUE, so running cost), power (grid / solar and storage / redundant +3%), network (+8%), and campus size (2, 4 or 8 halls).
  - **Capacity** = MW × PF per MW × (1 + network) × (1 + power). Your own chips give more PF per MW, and a refit costs your unit cost rather than the market price.
  - One slider splits compute between **training** and **serving**. AI models train in a visible run that needs PF-days; going past what they need gives a smarter model (a scale bonus), and evals work like bugs. Serving caps AI-model customers. Idle serving capacity is rented out as cloud.
- **World** tab: voxel continents with every place you own or could build (HQ, foundry partner or your own fab, sales offices, compute sites, the AGI run). Clicking a place opens a card with one action.
- **Late game:**
  - Your own fab makes chips and masks cheaper.
  - The AGI run is the final chapter: it needs 200 MW of campuses, then shares your training compute until it has had enough PF-days. Market growth for AI products is about 45–55% a year.
- **Endings:**
  - **Safe frontier:** AGI with alignment research and a brand of 55+.
  - **Reckless frontier:** AGI without them.
  - **Market leader:** 4 years leading 9+ markets.
  - You can keep playing after an ending.
- **The founder:** your salary (capped at 1% of monthly sales), your own cash and net worth, and a fixed rich list of real names to climb.
- **Stock market (ported from Grounds Up):**
  - Weekly prices from earnings × a P/E that follows growth, times a sentiment that drifts back after hash-based shocks.
  - Quarterly results move sentiment; dividends are paid; standing orders (stop-loss, take-profit, buy-below) fill on the weekly close.
  - Rival stocks follow how the rivals do against you.
  - **IPO:** needs a CFO, 4 profitable quarters and $50M a year in sales.
- **Chapters (achievements, never gates):** Garage startup → A real team → First office → Change the game → Industry giant → The AI age → The frontier.

## Time
- Speeds 1×, 2× and 4× advance 1, 2 or 4 days every 250 ms.
- The clock stops automatically for anything new in "Needs you": a card, a found bug, a chip ready to tape out or launch, a free person, a review, a breakthrough, the year in review.
- The timeline strip shows project milestones, rival launches and research for the next 120 days.

## Checks
- `npm test` runs `packages/sim/test/v2.test.ts`. It covers:
  - die rules
  - the project flow
  - rivals never passing you
  - research
  - people, cards and history
  - executives, the rivalry arc and the year review
  - the late game and endings
  - finance and stocks
- **Balance:**
  - `npx tsx packages/sim/test/v2-bot.ts` plays 6 years on 4 seeds, normal and relaxed.
  - Add `long` to play 30 years: language models arrive around 2001–2002 for an all-out player, and an ending around 2002–2005.
  - `v2-cal.ts` prints what auto-layouts score per market.
