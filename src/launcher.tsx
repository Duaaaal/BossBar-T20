import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import type { HostedSessionStartupProgress } from './shared/multiplayer';
import './launcher.css';
import './scrollbars.css';

installDisabledControlTooltips();

const LauncherApp = () => {
  const [hasSavedEncounters, setHasSavedEncounters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hosting, setHosting] = useState(false);
  const [hostingError, setHostingError] = useState('');
  const [hostingProgress, setHostingProgress] = useState<HostedSessionStartupProgress>({
    percent: 0,
    stage: '',
  });

  const refreshAvailability = useCallback(async () => {
    setHasSavedEncounters(await window.bossAPI.hasEncounterLibraryEntries());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshAvailability();
    return window.bossAPI.subscribeBossLibraryChanged(() => {
      void refreshAvailability();
    });
  }, [refreshAvailability]);

  useEffect(() => window.bossAPI.subscribeHostedSessionStartupProgress(
    setHostingProgress,
  ), []);

  const hostEncounter = async () => {
    if (hosting) return;
    setHosting(true);
    setHostingError('');
    setHostingProgress({ percent: 1, stage: 'Preparando a sala segura...' });
    try {
      const result = await window.bossAPI.startHostedEncounter();
      if (!result.ok) {
        setHostingError(
          result.error ?? 'Não foi possível iniciar a sala hospedada.',
        );
        setHosting(false);
        setHostingProgress({ percent: 0, stage: '' });
      }
    } catch {
      setHostingError('Não foi possível iniciar a sala hospedada.');
      setHosting(false);
      setHostingProgress({ percent: 0, stage: '' });
    }
  };

  return (
    <main className="launcher-shell">
      <header className="launcher-brand">
        <span>BossBar</span>
        <small>para</small>
        <strong>Tormenta 20</strong>
      </header>
      <div className="launcher-actions">
        <button
          className="launcher-new"
          type="button"
          disabled={hosting}
          data-disabled-reason="A sala hospedada está sendo preparada"
          onClick={() => void window.bossAPI.startNewEncounter()}
        >
          Novo encontro
        </button>
        <button
          className="launcher-load"
          type="button"
          disabled={hosting || loading || !hasSavedEncounters}
          data-disabled-reason={hosting
            ? 'A sala hospedada está sendo preparada'
            : loading
            ? 'Aguarde a biblioteca carregar'
            : 'Nenhum encontro salvo'}
          title={!loading && !hasSavedEncounters ? 'Nenhum encontro salvo' : undefined}
          onClick={() => void window.bossAPI.openBossLibrary()}
        >
          {loading ? 'Verificando biblioteca...' : 'Carregar encontro'}
        </button>
        <button
          className="launcher-host"
          type="button"
          disabled={hosting}
          data-disabled-reason="A sala hospedada está sendo preparada"
          onClick={() => void hostEncounter()}
        >
          {hosting ? 'Preparando sala...' : 'Hospedar encontro'}
        </button>
      </div>
      {hosting && (
        <section className="launcher-host-progress" aria-live="polite">
          <div className="launcher-progress-copy">
            <span>{hostingProgress.stage || 'Preparando a sala segura...'}</span>
            <strong>{Math.round(hostingProgress.percent)}%</strong>
          </div>
          <div
            className="launcher-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hostingProgress.percent)}
          >
            <span style={{ width: `${Math.max(0, Math.min(100, hostingProgress.percent))}%` }} />
          </div>
        </section>
      )}
      {hostingError && (
        <p className="launcher-host-error" role="alert">
          {hostingError}
        </p>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<LauncherApp />);
