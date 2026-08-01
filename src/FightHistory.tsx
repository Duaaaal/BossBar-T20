import { useState } from 'react';
import type { EncounterHistoryEntry } from './shared/encounter-history';
import {
  formatEncounterDiceRolls,
  type EncounterTurnState,
} from './shared/player-combat';

const formatHistoryRoll = (entry: EncounterHistoryEntry) => {
  if (!entry.expression || !entry.rolls) return entry.detail;
  const dice = formatEncounterDiceRolls(entry.expression, entry.rolls);
  if (entry.visibility === 'dice-only' || entry.visibility === 'hidden') {
    return `${dice} + ??? = ???`;
  }
  if (entry.visibility === 'dice-and-total') {
    return `${dice} + ??? = ${entry.total ?? 0}`;
  }
  const modifier = entry.modifier ?? 0;
  return `${dice} ${modifier >= 0 ? '+' : '−'} ${Math.abs(modifier)} = ${entry.total ?? 0}`;
};

export const FightHistory = ({ turn }: { turn: EncounterTurnState }) => {
  const [open, setOpen] = useState(false);
  const entries = turn.history ?? [];

  return (
    <>
      <button
        className="fight-history-button"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Histórico
      </button>
      {open && (
        <div className="fight-history-layer" role="presentation">
          <section
            className="fight-history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fight-history-title"
          >
            <header>
              <div>
                <small>Registro do encontro</small>
                <h2 id="fight-history-title">Histórico da luta</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar histórico"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="fight-history-list">
              {entries.length === 0 && (
                <p className="fight-history-empty">Nenhum evento registrado.</p>
              )}
              {entries.map((entry) => {
                if (entry.kind === 'round') {
                  return (
                    <h3 className="fight-history-round" key={entry.id}>
                      {entry.label}
                    </h3>
                  );
                }
                if (entry.kind === 'turn') {
                  return (
                    <h4 className="fight-history-turn" key={entry.id}>
                      {entry.label}
                    </h4>
                  );
                }
                return (
                  <article
                    className={`fight-history-entry is-${entry.outcome ?? entry.kind}`}
                    key={entry.id}
                  >
                    <b>({entry.actorName})</b>
                    <span>
                      {entry.label}
                      {entry.label ? ': ' : ''}
                      {formatHistoryRoll(entry)}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
};
