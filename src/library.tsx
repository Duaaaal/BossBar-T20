import { Fragment, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BossLibraryEntrySummary,
  BossLibraryBossSummary,
  MissingLibraryFile,
} from './shared/library';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { installUndoShortcut } from './shared/undo-shortcut';
import './library.css';
import './scrollbars.css';

installDisabledControlTooltips();
installUndoShortcut(() => window.bossAPI.undoLastChange());

type MissingFileState = {
  entryId: string;
  files: MissingLibraryFile[];
};

const formatSavedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data desconhecida';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const bossColors = ['#efb660', '#72c4ee', '#cf91e8'] as const;

const bossNameFontSize = (name: string, bossCount: number) => {
  const baseSize = bossCount === 3 ? 0.7 : bossCount === 2 ? 0.78 : 0.86;
  return Math.max(0.43, baseSize - Math.max(0, name.length - 22) * 0.005);
};

type NumericBossField = Exclude<
  keyof BossLibraryBossSummary,
  'bossName' | 'skillValues' | 'skillOverrides' | 'attacks' | 'selectedAttackId'
>;

const ColoredValues = ({
  bosses,
  field,
}: {
  bosses: BossLibraryBossSummary[];
  field: NumericBossField;
}) => (
  <span className="library-multi-values">
    {bosses.map((boss, index) => (
      <Fragment key={`${field}-${index}`}>
        <strong style={{ color: bossColors[index] }}>{boss[field]}</strong>
        {index < bosses.length - 1 && <i aria-hidden="true">/</i>}
      </Fragment>
    ))}
  </span>
);

const ColoredDefenseValues = ({ bosses }: { bosses: BossLibraryBossSummary[] }) => (
  <span className="library-multi-values" title="Defesa corpo a corpo / à distância">
    {bosses.map((boss, index) => (
      <Fragment key={`defense-${index}`}>
        <strong style={{ color: bossColors[index] }}>
          {boss.defense}/{boss.rangedDefense}
        </strong>
        {index < bosses.length - 1 && <i aria-hidden="true">/</i>}
      </Fragment>
    ))}
  </span>
);

const encounterLabel = (entry: BossLibraryEntrySummary) =>
  entry.bosses.map((boss) => boss.bossName).join(' / ');

const LibraryApp = () => {
  const [entries, setEntries] = useState<BossLibraryEntrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BossLibraryEntrySummary | null>(null);
  const [replacingFileKey, setReplacingFileKey] = useState<string | null>(null);
  const [missingState, setMissingState] = useState<MissingFileState | null>(null);
  const [message, setMessage] = useState('');

  const refreshEntries = useCallback(async () => {
    const nextEntries = await window.bossAPI.getBossLibraryEntries();
    setEntries(nextEntries);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshEntries();
    return window.bossAPI.subscribeBossLibraryChanged(() => {
      void refreshEntries();
    });
  }, [refreshEntries]);

  const loadEntry = async (
    entryId: string,
    continueWithoutMissing = false,
  ) => {
    if (loadingEntryId) return;
    setMessage('');
    setLoadingEntryId(entryId);
    const result = await window.bossAPI.loadBossFromLibrary(
      entryId,
      continueWithoutMissing,
    );
    setLoadingEntryId(null);
    if (result.ok) {
      setMissingState(null);
      window.bossAPI.closeBossLibrary();
      return;
    }
    if (result.missingFiles?.length) {
      setMissingState({ entryId, files: result.missingFiles });
      return;
    }
    setMessage(result.error ?? 'Não foi possível carregar o encontro.');
  };

  const replaceMissingFile = async (file: MissingLibraryFile) => {
    if (!missingState || replacingFileKey) return;
    setMessage('');
    setReplacingFileKey(file.key);
    try {
      const result = await window.bossAPI.replaceBossLibraryFile(
        missingState.entryId,
        file.key,
      );
      if (!result.ok) {
        if (!result.canceled) {
          setMessage(result.error ?? 'Não foi possível substituir o arquivo.');
        }
        return;
      }
      await loadEntry(missingState.entryId);
    } finally {
      setReplacingFileKey(null);
    }
  };

  const deleteEntry = async () => {
    if (!deleteTarget || deletingEntryId) return;
    setMessage('');
    setDeletingEntryId(deleteTarget.id);
    const result = await window.bossAPI.deleteBossLibraryEntry(deleteTarget.id);
    setDeletingEntryId(null);
    if (!result.ok) {
      setMessage(result.error ?? 'Não foi possível excluir o encontro.');
      return;
    }
    setDeleteTarget(null);
  };

  return (
    <main className="library-shell">
      <header className="library-header">
        <h1>Biblioteca de Encontros</h1>
        <button type="button" onClick={() => window.bossAPI.closeBossLibrary()}>
          Fechar
        </button>
      </header>

      <section className="library-panel" aria-label="Encontros salvos">
        <div className="library-table" role="table" aria-label="Biblioteca de encontros">
          <div className="library-row library-table-head" role="row">
            <span>Encontro</span>
            <span>Vida</span>
            <span>Luta</span>
            <span>Pontaria</span>
            <span title="Corpo a corpo / à distância">Def. C/D</span>
            <span>Perícias</span>
            <span>RD</span>
            <span>Escudo</span>
            <span>Salvo em</span>
            <span />
          </div>

          {loading ? (
            <div className="library-empty">Abrindo biblioteca...</div>
          ) : entries.length === 0 ? (
            <div className="library-empty">
              <strong>Nenhum encontro salvo</strong>
              <span>Use “Salvar encontro” na janela do mestre.</span>
            </div>
          ) : entries.map((entry) => (
            <div
              className={`library-row ${entry.isAutosave ? 'is-autosave' : ''}`}
              key={entry.id}
              role="row"
              onDoubleClick={() => void loadEntry(entry.id)}
            >
              <span className="library-encounter-name">
                {entry.isAutosave && <small>Salvamento automático</small>}
                <span className="library-encounter-bosses">
                  {entry.bosses.map((boss, index) => (
                    <strong
                      key={`${entry.id}-${index}`}
                      style={{
                        color: bossColors[index],
                        fontSize: `${bossNameFontSize(boss.bossName, entry.bosses.length)}rem`,
                      }}
                      title={boss.bossName}
                    >
                      {boss.bossName}
                    </strong>
                  ))}
                </span>
              </span>
              <span className={`library-health-list ${entry.isAutosave ? 'has-autosave' : ''}`}>
                {entry.bosses.map((boss, index) => (
                  <span className="library-health-cell" key={`${entry.id}-health-${index}`}>
                    <strong style={{ color: bossColors[index] }}>
                      {boss.currentHealth}/{boss.maxHealth}
                    </strong>
                    <span className={`library-health-track ${boss.shield > 0 ? 'is-shielded' : ''}`} aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.max(0, Math.min(100, (boss.currentHealth / Math.max(1, boss.maxHealth)) * 100))}%`,
                          background: `linear-gradient(90deg, color-mix(in srgb, ${bossColors[index]} 55%, #591826), ${bossColors[index]})`,
                          boxShadow: `0 0 6px color-mix(in srgb, ${bossColors[index]} 52%, transparent)`,
                        }}
                      />
                    </span>
                  </span>
                ))}
              </span>
              <ColoredValues bosses={entry.bosses} field="attack" />
              <ColoredValues bosses={entry.bosses} field="rangedAttack" />
              <ColoredDefenseValues bosses={entry.bosses} />
              <ColoredValues bosses={entry.bosses} field="skills" />
              <ColoredValues bosses={entry.bosses} field="damageReduction" />
              <ColoredValues bosses={entry.bosses} field="shield" />
              <span className="library-date">{formatSavedAt(entry.updatedAt)}</span>
              <span className="library-row-actions" onDoubleClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  disabled={loadingEntryId !== null || deletingEntryId !== null}
                  data-disabled-reason="Aguarde a operação da biblioteca"
                  onClick={() => void loadEntry(entry.id)}
                >
                  {loadingEntryId === entry.id ? 'Carregando...' : 'Carregar'}
                </button>
                <button
                  className="delete-library-button"
                  type="button"
                  title={`Excluir encontro: ${encounterLabel(entry)}`}
                  aria-label={`Excluir encontro: ${encounterLabel(entry)}`}
                  disabled={loadingEntryId !== null || deletingEntryId !== null}
                  data-disabled-reason="Aguarde a operação da biblioteca"
                  onClick={() => setDeleteTarget(entry)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 8v10m4-10v10m4-10v10M5 5h14M9 5V3h6v2m-9 0 1 16h10l1-16" />
                  </svg>
                </button>
              </span>
            </div>
          ))}
        </div>
        {message && <p className="library-message">{message}</p>}
      </section>

      {missingState && (
        <div className="library-modal-backdrop">
          <section className="library-modal" role="dialog" aria-modal="true" aria-labelledby="missing-title">
            <p className="library-modal-eyebrow">Arquivos ausentes</p>
            <h2 id="missing-title">Algumas mídias não foram encontradas</h2>
            <p>Elas podem ter sido movidas, renomeadas ou excluídas.</p>
            <div className="missing-file-list">
              {missingState.files.map((file) => (
                <div className="missing-file-row" key={file.key}>
                  <div>
                    <small>{file.kind === 'background' ? 'Fundo' : file.kind === 'music' ? 'Playlist' : 'Soundboard'}</small>
                    <strong>{file.label}</strong>
                  </div>
                  <button type="button" disabled={replacingFileKey !== null} data-disabled-reason="Aguarde a seleção de arquivo" onClick={() => void replaceMissingFile(file)}>
                    {replacingFileKey === file.key ? 'Localizando...' : 'Localizar substituto'}
                  </button>
                </div>
              ))}
            </div>
            <div className="library-modal-actions">
              <button className="library-cancel" type="button" disabled={replacingFileKey !== null} data-disabled-reason="Feche o seletor de arquivo primeiro" onClick={() => setMissingState(null)}>
                Cancelar carregamento
              </button>
              <button type="button" disabled={replacingFileKey !== null} data-disabled-reason="Feche o seletor de arquivo primeiro" onClick={() => void loadEntry(missingState.entryId, true)}>
                Continuar sem os arquivos
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="library-modal-backdrop">
          <section className="library-modal library-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <p className="library-modal-eyebrow">Excluir encontro</p>
            <h2 id="delete-title">Excluir este encontro da biblioteca?</h2>
            <p>“{encounterLabel(deleteTarget)}” será removido permanentemente.</p>
            <div className="library-modal-actions">
              <button className="library-cancel" type="button" disabled={deletingEntryId !== null} data-disabled-reason="Aguarde a exclusão atual" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button className="library-delete-confirm" type="button" disabled={deletingEntryId !== null} data-disabled-reason="Aguarde a exclusão atual" onClick={() => void deleteEntry()}>
                {deletingEntryId ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<LibraryApp />);
