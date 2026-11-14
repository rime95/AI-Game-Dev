import type { Effects } from '@stm/content';
import { money } from '../format';
import { LAYER } from './layers';

/** Effect chips, colored by the layer each effect touches (art-direction §3). */
export function EffectChips({ effects }: { effects: Effects }) {
  const chips: { text: string; c: string }[] = [];
  if (effects.cash) chips.push({ text: money(effects.cash), c: LAYER.gold });
  if (effects.reputation) chips.push({ text: `Reputation ${signed(effects.reputation)}`, c: LAYER.trust });
  if (effects.morale) chips.push({ text: `${effects.morale > 0 ? '+' : ''}${effects.morale} morale`, c: LAYER.gold });
  if (effects.staff) chips.push({ text: `+${effects.staff.delta} ${effects.staff.discipline}`, c: LAYER.gold });
  if (effects.shareBoost && effects.boostWeeks)
    chips.push({ text: `User pull +${Math.round((effects.shareBoost - 1) * 100)}% · ${effects.boostWeeks} wk`, c: LAYER.products });
  if (effects.riskChance && effects.riskReputation)
    chips.push({ text: `${Math.round(effects.riskChance * 100)}% risk · Reputation ${signed(effects.riskReputation)}`, c: '#c2413b' });
  if (effects.runProgressWeeks)
    chips.push({ text: `${effects.runProgressWeeks > 0 ? '+' : '−'}${Math.abs(effects.runProgressWeeks)} wk of training`, c: LAYER.models });
  if (effects.runSpeedMult)
    chips.push({ text: `Run speed ${effects.runSpeedMult >= 1 ? '+' : '−'}${Math.round(Math.abs(effects.runSpeedMult - 1) * 100)}%`, c: LAYER.compute });
  if (effects.runCapabilityDelta) chips.push({ text: 'Slightly weaker model', c: '#c2413b' });
  if (effects.runCapabilityRiskChance)
    chips.push({ text: `${Math.round(effects.runCapabilityRiskChance * 100)}% risk · weaker model`, c: '#c2413b' });
  if (effects.runCostPerChip) chips.push({ text: `${money(effects.runCostPerChip)} per chip`, c: LAYER.gold });
  if (effects.runScandalChance)
    chips.push({ text: `${Math.round(effects.runScandalChance * 100)}% scandal on release`, c: '#c2413b' });
  if (!chips.length) chips.push({ text: 'No effect', c: '#6f7079' });
  return (
    <div className="chips">
      {chips.map((ch) => (
        <span key={ch.text} className="chip" style={{ ['--c' as string]: ch.c }}>
          {ch.text}
        </span>
      ))}
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
