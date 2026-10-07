import { memo } from 'react';
import { Eraser, Repeat, Undo2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { ChipRack } from '../ui/Chip';

export const RACK_VALUES = [1, 5, 25, 100, 500];

/** Glass control dock: chip rack, ghost actions and the one primary action. */
export const ControlDock = memo(({
  chip, onChip, balance, busy,
  canUndo, canClear, canRebet,
  onUndo, onClear, onRebet, onRoll,
}) => (
  <div className="cr-dock glass">
    <ChipRack
      values={RACK_VALUES}
      selected={chip}
      onSelect={onChip}
      balance={balance}
      disabled={busy}
      label="Chip value"
      className="cr-rack"
    />
    <div className="cr-actions">
      <Button variant="ghost" onClick={onUndo} disabled={busy || !canUndo} className="cr-act" aria-label="Undo last bet">
        <Undo2 size={17} strokeWidth={1.75} aria-hidden="true" />
        <span>Undo</span>
      </Button>
      <Button variant="ghost" onClick={onClear} disabled={busy || !canClear} className="cr-act" aria-label="Clear bets">
        <Eraser size={17} strokeWidth={1.75} aria-hidden="true" />
        <span>Clear</span>
      </Button>
      <Button variant="ghost" onClick={onRebet} disabled={busy || !canRebet} className="cr-act" aria-label="Rebet">
        <Repeat size={17} strokeWidth={1.75} aria-hidden="true" />
        <span>Rebet</span>
      </Button>
      <Button variant="primary" size="lg" onClick={onRoll} disabled={busy} className="cr-roll-btn">
        {busy ? 'Rolling' : 'Roll'}
      </Button>
    </div>
  </div>
));
ControlDock.displayName = 'ControlDock';
