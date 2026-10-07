import { memo } from 'react';
import { Undo2, Eraser, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { ChipRack } from '../ui/Chip';
import { formatMoney } from '../ui/RollingNumber';
import { moneyOpts } from './handMath';

const Key = ({ k }) => <kbd className="bj-key" aria-hidden="true">{k}</kbd>;

const ActionButton = ({ label, k, onClick, disabled, reason }) => (
  <Button
    variant="ghost"
    size="lg"
    className="bj-action"
    onClick={onClick}
    disabled={disabled}
    title={disabled && reason ? reason : undefined}
    aria-label={disabled && reason ? `${label}, unavailable: ${reason}` : label}
    aria-keyshortcuts={k}
  >
    <span>{label}</span>
    {k && <Key k={k} />}
  </Button>
);

/**
 * Control dock below the felt. One surface, four faces:
 *   betting     chip rack, Undo / Clear / Rebet|x2, one primary "Deal"
 *   play        Hit / Stand / Double / Split (+ Surrender while it is allowed)
 *   insurance   Yes / No (or even money)
 *   result      New bet + the one primary action to deal again
 */
export const ControlDock = memo(({
  mode,
  // betting
  chips, chip, onChip, balance, bet, lastBet, canRebet, onUndo, onClear, onRebet, onDouble2, onDeal,
  // play
  disabled = false,
  canHit, canStand = true, canDouble, doubleReason, canSplit, splitReason, canSurrender,
  onHit, onStand, onDoubleDown, onSplit, onSurrender,
  // insurance
  insurance, onInsurance,
  // result
  onNewBet, onDealAgain, dealAgainReason,
}) => (
  <div className="bj-dock glass" data-mode={mode}>
    {mode === 'betting' && (
      <>
        <ChipRack values={chips} selected={chip} onSelect={onChip} balance={balance} className="bj-rack" />
        <div className="bj-dock-row bj-dock-betting">
          <Button variant="ghost" size="lg" onClick={onUndo} disabled={bet <= 0} aria-label="Undo last chip" aria-keyshortcuts="Backspace">
            <Undo2 className="bj-ico" size={18} strokeWidth={1.75} aria-hidden="true" /><span className="bj-lbl">Undo</span>
          </Button>
          <Button variant="ghost" size="lg" onClick={onClear} disabled={bet <= 0} aria-label="Clear bet" aria-keyshortcuts="C">
            <Eraser className="bj-ico" size={18} strokeWidth={1.75} aria-hidden="true" /><span className="bj-lbl">Clear</span>
          </Button>
          {bet > 0 ? (
            <Button variant="ghost" size="lg" onClick={onDouble2} disabled={bet * 2 > balance} aria-label="Double the bet" title={bet * 2 > balance ? 'Not enough balance' : undefined}>
              <span className="bj-lbl">×2</span>
            </Button>
          ) : (
            <Button variant="ghost" size="lg" onClick={onRebet} disabled={!canRebet} aria-label={lastBet ? `Rebet ${formatMoney(lastBet)}` : 'Rebet'} aria-keyshortcuts="R" title={!lastBet ? 'No previous bet' : undefined}>
              <RotateCcw className="bj-ico" size={17} strokeWidth={1.75} aria-hidden="true" /><span className="bj-lbl">Rebet</span>
            </Button>
          )}
          <Button variant="primary" size="lg" className="bj-deal" onClick={onDeal} disabled={bet <= 0} aria-keyshortcuts="Enter">
            Deal<Key k="↵" />
          </Button>
        </div>
      </>
    )}

    {mode === 'play' && (
      <>
        <div className="bj-dock-row bj-dock-play" role="group" aria-label="Your move">
          <ActionButton label="Hit" k="H" onClick={onHit} disabled={disabled || !canHit} reason="Not available" />
          <ActionButton label="Stand" k="S" onClick={onStand} disabled={disabled || !canStand} reason="Not available" />
          <ActionButton label="Double" k="D" onClick={onDoubleDown} disabled={disabled || !canDouble} reason={doubleReason || 'First two cards only'} />
          <ActionButton label="Split" k="P" onClick={onSplit} disabled={disabled || !canSplit} reason={splitReason || 'Needs a pair'} />
        </div>
        {canSurrender && (
          <div className="bj-dock-sub">
            <Button variant="plain" size="sm" onClick={onSurrender} disabled={disabled} aria-keyshortcuts="U">
              Surrender<Key k="U" />
            </Button>
          </div>
        )}
      </>
    )}

    {mode === 'insurance' && insurance && (
      <div className="bj-dock-row bj-dock-insurance" role="group" aria-label={insurance.title}>
        <div className="bj-ask">
          <span className="bj-ask-title">{insurance.title}</span>
          <span className="bj-ask-meta tnum">{insurance.meta}</span>
        </div>
        <Button variant="ghost" size="lg" onClick={() => onInsurance(true)} disabled={disabled || !insurance.canAfford} title={!insurance.canAfford ? 'Not enough balance' : undefined} aria-keyshortcuts="Y">
          Yes<Key k="Y" />
        </Button>
        <Button variant="ghost" size="lg" onClick={() => onInsurance(false)} disabled={disabled} aria-keyshortcuts="N">
          No<Key k="N" />
        </Button>
      </div>
    )}

    {mode === 'result' && (
      <div className="bj-dock-row bj-dock-result">
        <Button variant="ghost" size="lg" onClick={onNewBet} disabled={disabled} aria-keyshortcuts="N">
          New bet<Key k="N" />
        </Button>
        <Button variant="primary" size="lg" className="bj-deal" onClick={onDealAgain} disabled={disabled || !!dealAgainReason} title={dealAgainReason || undefined} aria-keyshortcuts="Enter">
          Deal {formatMoney(lastBet, moneyOpts(lastBet))}<Key k="↵" />
        </Button>
      </div>
    )}

    {mode === 'watching' && (
      <div className="bj-dock-row bj-dock-play" role="group" aria-label="Dealer is playing">
        <ActionButton label="Hit" k="H" disabled />
        <ActionButton label="Stand" k="S" disabled />
        <ActionButton label="Double" k="D" disabled />
        <ActionButton label="Split" k="P" disabled />
      </div>
    )}
  </div>
));
