import type { Discipline } from '@stm/content';
import { researchBonus, TUNING, type GameState } from '@stm/sim';
import { useStore } from '../store';
import { money } from '../format';
import { LAYER } from '../ui/layers';
import { Advisor, useDetails } from './Panel';

const PLAIN: Record<Discipline, string> = {
  research: 'Make every model smarter. They need a research lab in HQ.',
  modelEng: `Run training. Each one can manage about ${TUNING.chipsPerModelEngineer} chips.`,
  hardwareEng: 'Design our own chips, with fewer bugs. They need a hardware lab in HQ.',
  product: 'Turn app users into paying customers and look after business clients. They need a product studio in HQ.',
  ops: 'Keep the hardware running and make company takeovers go smoothly. They need an ops room in HQ.',
};

const ROLES: { id: Discipline; label: string; does: string; color: string }[] = [
  { id: 'research', label: 'Researchers', does: 'Each adds +3% effective training compute (up to +60%), but only while seated in a research lab (build one in HQ).', color: LAYER.models },
  { id: 'modelEng', label: 'Model engineers', does: `Each can orchestrate a training cluster of up to ${TUNING.chipsPerModelEngineer} chips.`, color: LAYER.models },
  { id: 'hardwareEng', label: 'Hardware engineers', does: 'Design custom chips in Silicon while seated in a hardware lab. Each cuts tape-out bug risk by 15%; newer nodes need more of them.', color: LAYER.silicon },
  { id: 'product', label: 'Product managers', does: 'Seated in a product studio, each adds 0.5% paid conversion to the consumer app (max 8%) and handles 2 enterprise accounts.', color: LAYER.products },
  { id: 'ops', label: 'Ops engineers', does: 'Seated in an ops room, each cuts training hardware failures by 10% and acquisition culture-clash risk by 15%.', color: LAYER.compute },
];

export function TeamPanel({ game }: { game: GameState }) {
  const send = useStore((s) => s.send);
  const headcount = Object.values(game.staff).reduce((n, c) => n + c, 0);
  const details = useDetails();

  return (
    <>
      <Advisor who="people" color={LAYER.gold}>
        {details
          ? `${headcount} people on payroll at ${money(TUNING.salaryPerWeek)} each per week. Seated researchers multiply training by ×${researchBonus(game.hq.effective.research).toFixed(2)}. Everyone works at ×${game.hq.productivity.toFixed(2)} speed.`
          : `${headcount} people on the team, each paid ${money(TUNING.salaryPerWeek)} a week. New hires need a desk and the right room in HQ to do their best work.`}
      </Advisor>
      {ROLES.map((r) => (
        <div className="card" key={r.id} style={{ ['--c' as string]: r.color }}>
          <div className="row between">
            <h3>{r.label}</h3>
            <span className="stat">
              <span className="v">{game.staff[r.id]}</span>
            </span>
          </div>
          <div className="small muted">{details ? r.does : PLAIN[r.id]}</div>
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
