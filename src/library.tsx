import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BossLibraryEntrySummary,
  MissingLibraryFile,
} from './shared/library';
import './library.css';
import './scrollbars.css';

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

const bossNameFontSize = (name: string) =>
  Math.max(0.46, 0.86 - Math.max(0, name.length - 22) * 0.005);

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
    setMessage(result.error ?? 'Não foi possível carregar o chefão.');
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
      setMessage(result.error ?? 'Não foi possível excluir o chefão.');
      return;
    }
    setDeleteTarget(null);
  };

  return (
    <main className="library-shell">
      <header className="library-header">
        <h1>Biblioteca de Chefões</h1>
        <button type="button" onClick={() => window.bossAPI.closeBossLibrary()}>
          Fechar
        </button>
      </header>

      <section className="library-panel" aria-label="Chefões salvos">
        <div className="library-table" role="table" aria-label="Biblioteca de chefões">
          <div className="library-row library-table-head" role="row">
            <span>Chefão</span>
            <span>Valor</span>
            <span>Vida</span>
            <span>Ataque</span>
            <span>Tiro</span>
            <span>Defesa</span>
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
              <strong>Nenhum chefão salvo</strong>
              <span>Use “Salvar chefão” na janela do mestre.</span>
            </div>
          ) : entries.map((entry) => (
            <div
              className={`library-row ${entry.isAutosave ? 'is-autosave' : ''}`}
              key={entry.id}
              role="row"
              onDoubleClick={() => void loadEntry(entry.id)}
            >
              <span className="library-boss-name">
                {entry.isAutosave && <small>Salvamento automático</small>}
                <strong
                  style={{ fontSize: `${bossNameFontSize(entry.bossName)}rem` }}
                  title={entry.bossName}
                >
                  {entry.bossName}
                </strong>
              </span>
              <span>{entry.amount}</span>
              <span className="library-health-cell">
                <strong>{entry.currentHealth}/{entry.maxHealth}</strong>
                <span className={`library-health-track ${entry.shield > 0 ? 'is-shielded' : ''}`} aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(0, Math.min(100, (entry.currentHealth / Math.max(1, entry.maxHealth)) * 100))}%`,
                    }}
                  />
                </span>
              </span>
              <span>{entry.attack}</span>
              <span>{entry.rangedAttack}</span>
              <span>{entry.defense}</span>
              <span>{entry.skills}</span>
              <span>{entry.damageReduction}</span>
              <span>{entry.shield}</span>
              <span className="library-date">{formatSavedAt(entry.updatedAt)}</span>
              <span className="library-row-actions" onDoubleClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  disabled={loadingEntryId !== null || deletingEntryId !== null}
                  onClick={() => void loadEntry(entry.id)}
                >
                  {loadingEntryId === entry.id ? 'Carregando...' : 'Carregar'}
                </button>
                <button
                  className="delete-library-button"
                  type="button"
                  title={`Excluir ${entry.bossName}`}
                  aria-label={`Excluir ${entry.bossName}`}
                  disabled={loadingEntryId !== null || deletingEntryId !== null}
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
                  <button type="button" disabled={replacingFileKey !== null} onClick={() => void replaceMissingFile(file)}>
                    {replacingFileKey === file.key ? 'Localizando...' : 'Localizar substituto'}
                  </button>
                </div>
              ))}
            </div>
            <div className="library-modal-actions">
              <button className="library-cancel" type="button" disabled={replacingFileKey !== null} onClick={() => setMissingState(null)}>
                Cancelar carregamento
              </button>
              <button type="button" disabled={replacingFileKey !== null} onClick={() => void loadEntry(missingState.entryId, true)}>
                Continuar sem os arquivos
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="library-modal-backdrop">
          <section className="library-modal library-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <p className="library-modal-eyebrow">Excluir chefão</p>
            <h2 id="delete-title">Excluir “{deleteTarget.bossName}” da biblioteca?</h2>
            <p>Esta linha salva será removida permanentemente.</p>
            <div className="library-modal-actions">
              <button className="library-cancel" type="button" disabled={deletingEntryId !== null} onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button className="library-delete-confirm" type="button" disabled={deletingEntryId !== null} onClick={() => void deleteEntry()}>
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
