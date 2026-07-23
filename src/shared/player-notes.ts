export type PlayerNoteTab = {
  id: string;
  title: string;
  html: string;
};

export type PlayerNotesDocument = {
  version: 1;
  activeTabId: string;
  tabs: PlayerNoteTab[];
};

const MAX_TABS = 20;
const MAX_TITLE_LENGTH = 40;
const MAX_HTML_LENGTH = 90_000;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
  .replace(/\r?\n/g, '<br>');

export const createPlayerNotesDocument = (): PlayerNotesDocument => ({
  version: 1,
  activeTabId: 'note-1',
  tabs: [{ id: 'note-1', title: 'Nota 1', html: '' }],
});

const normalizeTab = (value: unknown, index: number): PlayerNoteTab | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PlayerNoteTab>;
  if (typeof candidate.id !== 'string' || typeof candidate.html !== 'string') return null;
  const id = candidate.id.trim().slice(0, 80);
  if (!id) return null;
  const title = typeof candidate.title === 'string' && candidate.title.trim()
    ? candidate.title.trim().slice(0, MAX_TITLE_LENGTH)
    : `Nota ${index + 1}`;
  return { id, title, html: candidate.html.slice(0, MAX_HTML_LENGTH) };
};

export const parsePlayerNotesDocument = (stored: string): PlayerNotesDocument => {
  if (!stored.trim()) return createPlayerNotesDocument();
  try {
    const parsed = JSON.parse(stored) as Partial<PlayerNotesDocument>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tabs)) throw new Error('legacy');
    const seen = new Set<string>();
    const tabs: PlayerNoteTab[] = [];
    for (const value of parsed.tabs.slice(0, MAX_TABS)) {
      const tab = normalizeTab(value, tabs.length);
      if (!tab || seen.has(tab.id)) continue;
      seen.add(tab.id);
      tabs.push(tab);
    }
    if (!tabs.length) return createPlayerNotesDocument();
    const activeTabId = tabs.some(({ id }) => id === parsed.activeTabId)
      ? parsed.activeTabId as string
      : tabs[0].id;
    return { version: 1, activeTabId, tabs };
  } catch {
    return {
      version: 1,
      activeTabId: 'note-1',
      tabs: [{ id: 'note-1', title: 'Nota 1', html: escapeHtml(stored) }],
    };
  }
};

export const serializePlayerNotesDocument = (document: PlayerNotesDocument) =>
  JSON.stringify(document);

export const nextPlayerNoteTab = (document: PlayerNotesDocument): PlayerNoteTab | null => {
  if (document.tabs.length >= MAX_TABS) return null;
  const usedIds = new Set(document.tabs.map(({ id }) => id));
  let sequence = document.tabs.length + 1;
  while (usedIds.has(`note-${sequence}`)) sequence += 1;
  return { id: `note-${sequence}`, title: `Nota ${sequence}`, html: '' };
};
