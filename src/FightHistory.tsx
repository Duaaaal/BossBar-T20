import { useState } from 'react';
import { createPortal } from 'react-dom';
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

const brasiliaTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatElapsed = (createdAt: number, startedAt: number | null) => {
  const seconds = Math.max(0, Math.floor((createdAt - (startedAt ?? createdAt)) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return [hours, minutes, seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
};

export const FightHistory = ({ turn }: { turn: EncounterTurnState }) => {
  const [open, setOpen] = useState(false);
  const entries = turn.history ?? [];
  const revertedEntryIds = new Set(
    entries.flatMap(({ revertsEntryIds }) => revertsEntryIds ?? []),
  );
  let actionNumber = 0;
  const numberedEntries = entries.map((entry) => ({
    entry,
    number: entry.kind === 'round' || entry.kind === 'turn' ? null : ++actionNumber,
  }));
  // Reverse the view, not the authoritative log or its original action numbers.
  const visibleEntries = numberedEntries.reverse();

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
      {open && createPortal(
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
              {visibleEntries.map(({ entry, number }) => {
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
                    className={`fight-history-entry is-${entry.outcome ?? entry.kind} ${
                      revertedEntryIds.has(entry.id) ? 'is-undone' : ''
                    }`}
                    key={entry.id}
                  >
                    <small className="fight-history-entry-meta">
                      #{number} · {formatElapsed(entry.createdAt, turn.startedAt)} · {brasiliaTime.format(entry.createdAt)}
                    </small>
                    <b>({entry.actorName})</b>
                    <span>
                      {entry.label}
                      {revertedEntryIds.has(entry.id) ? ' (desfeito)' : ''}
                      {entry.label ? ': ' : ''}
                      {formatHistoryRoll(entry)}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
};
