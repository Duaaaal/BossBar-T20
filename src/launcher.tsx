import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './launcher.css';

const LauncherApp = () => {
  const [hasSavedEncounters, setHasSavedEncounters] = useState(false);
  const [loading, setLoading] = useState(true);

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

  return (
    <main className="launcher-shell">
      <header className="launcher-brand">
        <span>BossBar</span>
        <small>para</small>
        <strong>Tormenta 20</strong>
      </header>
      <h1>Como deseja começar?</h1>
      <div className="launcher-actions">
        <button
          className="launcher-load"
          type="button"
          disabled={loading || !hasSavedEncounters}
          title={!loading && !hasSavedEncounters ? 'Nenhum encontro salvo' : undefined}
          onClick={() => void window.bossAPI.openBossLibrary()}
        >
          {loading ? 'Verificando biblioteca...' : 'Carregar encontro'}
        </button>
        <button
          className="launcher-new"
          type="button"
          onClick={() => void window.bossAPI.startNewEncounter()}
        >
          Novo encontro
        </button>
      </div>
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<LauncherApp />);
