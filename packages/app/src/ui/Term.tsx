import type { ReactNode } from 'react';
import { GLOSSARY, type GlossaryKey } from '../words';

/** A friendly word with a hover explanation. Children replace the default label. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const g = GLOSSARY[k];
  return (
    <span className="term" tabIndex={0}>
      {children ?? g.plain}
      <span className="term-pop" role="tooltip">
        <strong>{g.plain}</strong>
        {g.explain}
      </span>
    </span>
  );
}
