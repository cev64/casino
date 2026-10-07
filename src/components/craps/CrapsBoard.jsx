import { memo, useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { DealerPuck } from '../ui/DealerPuck';
import { BetSpot } from './BetSpot';
import { PrintedDice } from './PrintedDice';
import { RollStage } from './RollStage';
import { HARD_NUMBERS, HORN_NUMBERS, POINTS, maxPassOdds, maxLayOdds, spotLabel } from '../../lib/craps';
import { formatMoney } from '../ui/RollingNumber';

const WORD = { 6: 'Six', 9: 'Nine' };
const HORN_ART = { 2: [1, 1], 3: [1, 2], 11: [5, 6], 12: [6, 6] };
const HORN_NAME = { 2: 'Aces', 3: 'Ace deuce', 11: 'Yo', 12: 'Boxcars' };
const HARD_PAY = { 4: '7', 6: '9', 8: '9', 10: '7' };
const HORN_PAY = { 2: '30', 3: '15', 11: '15', 12: '30' };

/** Where chips of one spot appear and what the spot looks like are decided by CSS (craps.css). */
export const CrapsBoard = memo(({
  state,
  marks,
  busy,
  onPlace,
  onRemove,
  stage,
  travel,
}) => {
  const bets = state.bets;
  const { phase, point } = state;
  const isPoint = phase === 'point';

  const common = { busy, onPlace, onRemove };
  const mark = (id) => marks[id];

  const passFlat = bets.passLine;
  const dpFlat = bets.dontPass;
  const showOdds = isPoint && passFlat > 0;
  const showLay = isPoint && dpFlat > 0;

  const oddsMax = useMemo(() => (showOdds ? maxPassOdds(point, passFlat) : 0), [showOdds, point, passFlat]);
  const layMax = useMemo(() => (showLay ? maxLayOdds(dpFlat) : 0), [showLay, dpFlat]);

  const puck = (where) => (
    <motion.div layoutId="cr-puck" className={`cr-puck cr-puck-${where}`} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
      <DealerPuck isOn={isPoint} point={point} size="sm" />
    </motion.div>
  );

  return (
    <LayoutGroup id="craps">
      <div className="cr-table" data-phase={phase} data-odds={showOdds ? '1' : undefined} data-lay={showLay ? '1' : undefined}>
        {/* ---------------- Number boxes ---------------- */}
        {POINTS.map((n) => {
          const come = bets.comeNumbers[n];
          const dc = bets.dontComeNumbers[n];
          const comeTotal = come.amount + come.odds;
          const dcTotal = dc.amount + dc.odds;
          const isThePoint = point === n;
          return (
            <div key={n} className={`cr-num ga-n${n}`} data-point={isThePoint || undefined} data-n={n}>
              {dcTotal > 0 ? (
                <BetSpot
                  id={`dontComeNum${n}`}
                  label={spotLabel(`dontComeNum${n}`)}
                  amount={dcTotal}
                  className="cr-lay"
                  stackSize="xs"
                  mark={mark(`dontComeNum${n}`)}
                  extraLabel="tap to add lay odds"
                  {...common}
                >
                  <span className="cr-print cr-tiny">Lay</span>
                </BetSpot>
              ) : (
                <div className="cr-lay cr-lay-empty" aria-hidden="true"><span className="cr-print cr-tiny">Lay</span></div>
              )}

              <BetSpot
                id={`place${n}`}
                label={spotLabel(`place${n}`)}
                amount={bets.place[n]}
                className="cr-placebox"
                off={!isPoint}
                mark={mark(`place${n}`)}
                stackSize="xs"
                {...common}
              >
                <span className="cr-numeral" data-word={WORD[n] ? '' : undefined}>{WORD[n] || n}</span>
              </BetSpot>

              {comeTotal > 0 && (
                <BetSpot
                  id={`comeNum${n}`}
                  label={spotLabel(`comeNum${n}`)}
                  amount={comeTotal}
                  className="cr-comebox"
                  locked={come.odds <= 0}
                  off={!isPoint && come.odds > 0}
                  mark={mark(`comeNum${n}`)}
                  extraLabel={come.odds > 0 ? `including ${formatMoney(come.odds)} odds` : 'tap to add odds'}
                  hint={come.odds > 0 ? 'Odds' : null}
                  stackSize="xs"
                  layoutId={travel?.to === n ? 'cr-travel-come' : undefined}
                  {...common}
                />
              )}

              {isThePoint && puck('num')}
            </div>
          );
        })}

        {/* ---------------- Don't come bar ---------------- */}
        <BetSpot
          id="dontCome"
          label={spotLabel('dontCome')}
          amount={bets.dontCome}
          className="ga-dcb cr-box cr-dcb"
          blockedReason={!isPoint ? 'Come bets follow a point' : null}
          mark={mark('dontCome')}
          stackSize="xs"
          {...common}
        >
          <span className="cr-print cr-bar-text">Don’t<br />Come</span>
          <PrintedDice a={6} b={6} className="cr-bar-dice" />
        </BetSpot>
        {!isPoint && puck('bar')}

        {/* ---------------- Big 6 / Big 8 ---------------- */}
        {[6, 8].map((n) => (
          <BetSpot
            key={n}
            id={`big${n}`}
            label={spotLabel(`big${n}`)}
            amount={bets[`big${n}`]}
            className={`ga-big${n} cr-box cr-big`}
            mark={mark(`big${n}`)}
            stackSize="xs"
            {...common}
          >
            <span className="cr-print cr-big-text"><small>Big</small>{n}</span>
          </BetSpot>
        ))}

        {/* ---------------- Come ---------------- */}
        <BetSpot
          id="come"
          label={spotLabel('come')}
          amount={bets.come}
          className="ga-come cr-box cr-come"
          blockedReason={!isPoint ? 'Come bets follow a point' : null}
          mark={mark('come')}
          layoutId={travel ? 'cr-travel-come' : undefined}
          stackSize="sm"
          {...common}
        >
          <span className="cr-print cr-come-text">Come</span>
        </BetSpot>

        <RollStage {...stage} />

        {/* ---------------- Field ---------------- */}
        <BetSpot
          id="field"
          label={spotLabel('field')}
          amount={bets.field}
          className="ga-field cr-box cr-field"
          mark={mark('field')}
          stackSize="sm"
          extraLabel="two and twelve pay double"
          {...common}
        >
          <span className="cr-field-row">
            <span className="cr-ring cr-print">2</span>
            <span className="cr-print cr-fnum">3</span>
            <span className="cr-print cr-fnum">4</span>
            <span className="cr-print cr-field-word">Field</span>
            <span className="cr-print cr-fnum">9</span>
            <span className="cr-print cr-fnum">10</span>
            <span className="cr-print cr-fnum">11</span>
            <span className="cr-ring cr-print">12</span>
          </span>
          <span className="cr-print cr-tiny cr-field-note">2 and 12 pay double</span>
        </BetSpot>

        {/* ---------------- Don't pass / Pass line ---------------- */}
        <BetSpot
          id="dontPass"
          label={spotLabel('dontPass')}
          amount={dpFlat}
          className="ga-dp cr-box cr-dp"
          blockedReason={isPoint ? 'Line bets are placed on the come-out roll' : null}
          mark={mark('dontPass')}
          stackSize="xs"
          {...common}
        >
          <span className="cr-print cr-bar-text cr-inline">Don’t pass bar</span>
          <PrintedDice a={6} b={6} className="cr-bar-dice" />
        </BetSpot>

        <AnimatePresence>
          {showLay && (
            <motion.div
              key="lay"
              className="ga-lay"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 26 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
            >
              <BetSpot
                id="dontPassOdds"
                label={spotLabel('dontPassOdds')}
                amount={bets.dontPassOdds}
                className="cr-box cr-odds"
                mark={mark('dontPassOdds')}
                extraLabel={`up to ${formatMoney(layMax)}`}
                stackSize="xs"
                {...common}
              >
                <span className="cr-print cr-odds-text">Lay{' '}<br />odds</span>
              </BetSpot>
            </motion.div>
          )}
        </AnimatePresence>

        <BetSpot
          id="passLine"
          label={spotLabel('passLine')}
          amount={passFlat}
          className="ga-pass cr-box cr-pass"
          blockedReason={isPoint ? 'Line bets are placed on the come-out roll' : null}
          locked={isPoint}
          mark={mark('passLine')}
          stackSize="sm"
          {...common}
        >
          <span className="cr-print cr-pass-text">Pass line</span>
        </BetSpot>

        <AnimatePresence>
          {showOdds && (
            <motion.div
              key="odds"
              className="ga-odds"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 26 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
            >
              <BetSpot
                id="odds"
                label={spotLabel('odds')}
                amount={bets.odds}
                className="cr-box cr-odds"
                mark={mark('odds')}
                extraLabel={`up to ${formatMoney(oddsMax)}`}
                stackSize="xs"
                {...common}
              >
                <span className="cr-print cr-odds-text">Odds</span>
                <span className="cr-print cr-tiny cr-odds-max tnum">Max {formatMoney(oddsMax)}</span>
              </BetSpot>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------- Proposition bets ---------------- */}
        <div className="cr-props" role="group" aria-label="Proposition bets">
          <BetSpot
            id="anySeven"
            label={spotLabel('anySeven')}
            amount={bets.anySeven}
            className="pr-seven cr-box cr-prop cr-seven"
            mark={mark('anySeven')}
            stackSize="xs"
            extraLabel="one roll, pays 4 to 1"
            {...common}
          >
            <span className="cr-print cr-prop-big">Any seven</span>
            <span className="cr-print cr-tiny cr-pay">4 to 1</span>
          </BetSpot>

          {HARD_NUMBERS.map((n) => (
            <BetSpot
              key={n}
              id={`hard${n}`}
              label={spotLabel(`hard${n}`)}
              amount={bets.hardways[n]}
              className={`pr-h${n} cr-box cr-prop cr-hard`}
              off={!isPoint}
              mark={mark(`hard${n}`)}
              stackSize="xs"
              extraLabel={`pays ${HARD_PAY[n]} to 1`}
              {...common}
            >
              <PrintedDice a={n / 2} b={n / 2} className="cr-prop-dice" />
              <span className="cr-print cr-prop-name">Hard {n}</span>
              <span className="cr-print cr-tiny cr-pay">{HARD_PAY[n]} to 1</span>
            </BetSpot>
          ))}

          {HORN_NUMBERS.map((n) => (
            <BetSpot
              key={n}
              id={`horn${n}`}
              label={`${spotLabel(`horn${n}`)}`}
              amount={bets.horn[n]}
              className={`pr-o${n} cr-box cr-prop cr-horn`}
              mark={mark(`horn${n}`)}
              stackSize="xs"
              extraLabel={`one roll, pays ${HORN_PAY[n]} to 1`}
              {...common}
            >
              <PrintedDice a={HORN_ART[n][0]} b={HORN_ART[n][1]} className="cr-prop-dice" />
              <span className="cr-print cr-prop-name">{HORN_NAME[n]} {n}</span>
              <span className="cr-print cr-tiny cr-pay">{HORN_PAY[n]} to 1</span>
            </BetSpot>
          ))}

          <BetSpot
            id="anyCraps"
            label={spotLabel('anyCraps')}
            amount={bets.anyCraps}
            className="pr-craps cr-box cr-prop cr-anycraps"
            mark={mark('anyCraps')}
            stackSize="xs"
            extraLabel="one roll, pays 7 to 1"
            {...common}
          >
            <span className="cr-print cr-prop-big">Any craps</span>
            <span className="cr-print cr-tiny cr-pay">7 to 1</span>
          </BetSpot>
        </div>
      </div>
    </LayoutGroup>
  );
});
CrapsBoard.displayName = 'CrapsBoard';
