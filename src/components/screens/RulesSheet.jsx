import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { SegmentedControl } from '../ui/SegmentedControl';
import { RULES } from './rulesContent';

const OPTIONS = Object.entries(RULES).map(([value, r]) => ({ value, label: r.label }));

const Section = ({ section }) => (
  <section className="mt-6 first:mt-0">
    <h3 className="t-micro mb-3">{section.title}</h3>
    <ul className="rule-list">
      {section.items.map((item) => (
        <li key={item.term} className={section.kind === 'terms' ? 'flex-col !gap-0.5 sm:flex-row sm:!gap-6' : ''}>
          <span className="rule-term sm:shrink-0 sm:min-w-[96px]">{item.term}</span>
          {section.kind === 'values'
            ? <span className="rule-value tnum">{item.value}</span>
            : <span className="rule-text sm:text-left sm:flex-1">{item.text}</span>}
        </li>
      ))}
    </ul>
  </section>
);

/** "How to play": concise rules for both tables. Opens on the game being played. */
export const RulesSheet = ({ open, onClose, game = 'blackjack' }) => {
  const [tab, setTab] = useState(game);

  useEffect(() => { if (open) setTab(game); }, [open, game]);

  const rules = RULES[tab] || RULES.blackjack;

  return (
    <Sheet open={open} onClose={onClose} title="How to play">
      <SegmentedControl
        label="Game"
        options={OPTIONS}
        value={tab}
        onChange={setTab}
        className="w-full mb-5"
      />
      <p className="text-ink-2 mb-6">{rules.summary}</p>
      {rules.sections.map((s) => <Section key={s.title} section={s} />)}
    </Sheet>
  );
};
