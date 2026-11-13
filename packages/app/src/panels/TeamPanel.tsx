import type { Discipline } from '@stm/content';
import { researchBonus, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor } from './Panel';

const ROLES: { id: Discipline; label: string; does: string; color: string }[] = [
  { id: 'research', label: 'Researchers', does: 'Each adds +3% effective training compute (up to +60%).', color: LAYER.models },
  { id: 'modelEng', label: 'Model engineers', does: `Each can orchestrate a training cluster of up to ${TUNING.chipsPerModelEngineer} chips.`, color: LAYER.models },
  { id: 'hardwareEng', label: 'Hardware engineers', does: 'Design custom chips in Silicon. Each cuts tape-out bug risk by 15%; newer nodes need more of them.', color: LAYER.silicon },
  { id: 'product', label: 'Product managers', does: 'Each adds 0.5% paid conversion to the consumer app (max 8%) and handles 2 enterprise accounts.', color: LAYER.products },
  { id: 'ops', label: 'Ops engineers', does: 'Each cuts training hardware failures by 10% and acquisition culture-clash risk by 15%.', color: LAYER.compute },
];

export function TeamPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const headcount = Object.values(game.staff).reduce((n, c) => n + c, 0);

  return (
    <>
      <Advisor who="People lead" color={LAYER.gold}>
        {headcount} people on payroll at {money(TUNING.salaryPerWeek)} each per week. Research currently multiplies
        effective compute by ×{researchBonus(game.staff.research).toFixed(2)}.
      </Advisor>
      {ROLES.map((r) => (
        <div className="card" key={r.id} style={{ ['--c' as string]: r.color }}>
          <div className="row between">
            <h3>{r.label}</h3>
            <span className="stat">
              <span className="v">{game.staff[r.id]}</span>
            </span>
          </div>
          <div className="small muted">{r.does}</div>
          <div className="row">
            <button className="btn" onClick={() => send({ type: 'hire', discipline: r.id })}>
              Hire one ({money(TUNING.hireCost)})
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
