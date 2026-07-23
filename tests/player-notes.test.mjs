import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlayerNotesDocument,
  nextPlayerNoteTab,
  parsePlayerNotesDocument,
  serializePlayerNotesDocument,
} from '../src/shared/player-notes.ts';

test('cria um documento inicial com uma aba ativa e vazia', () => {
  assert.deepEqual(createPlayerNotesDocument(), {
    version: 1,
    activeTabId: 'note-1',
    tabs: [{ id: 'note-1', title: 'Nota 1', html: '' }],
  });
  assert.deepEqual(parsePlayerNotesDocument('   '), createPlayerNotesDocument());
});

test('serializa e restaura todas as abas e a aba ativa', () => {
  const document = {
    version: 1,
    activeTabId: 'combate',
    tabs: [
      { id: 'geral', title: 'Geral', html: '<b>Rumores</b>' },
      { id: 'combate', title: 'Combate', html: '<ol><li>Agir</li></ol>' },
    ],
  };

  assert.deepEqual(
    parsePlayerNotesDocument(serializePlayerNotesDocument(document)),
    document,
  );
});

test('migra notas legadas como texto literal seguro preservando quebras de linha', () => {
  const migrated = parsePlayerNotesDocument('Plano <script>alert(1)</script>\n**sem markdown**');

  assert.deepEqual(migrated, {
    version: 1,
    activeTabId: 'note-1',
    tabs: [{
      id: 'note-1',
      title: 'Nota 1',
      html: 'Plano &lt;script&gt;alert(1)&lt;/script&gt;<br>**sem markdown**',
    }],
  });
});

test('normaliza abas invÃ¡lidas, duplicadas e a seleÃ§Ã£o ativa', () => {
  const parsed = parsePlayerNotesDocument(JSON.stringify({
    version: 1,
    activeTabId: 'inexistente',
    tabs: [
      { id: ' principal ', title: '  Planejamento  ', html: '<b>Texto</b>' },
      { id: 'principal', title: 'Duplicada', html: 'ignorar' },
      { id: '', title: 'Sem id', html: 'ignorar' },
      { id: 'segunda', title: '', html: 'Outra' },
      { id: 'sem-html', title: 'Sem HTML' },
    ],
  }));

  assert.deepEqual(parsed, {
    version: 1,
    activeTabId: 'principal',
    tabs: [
      { id: 'principal', title: 'Planejamento', html: '<b>Texto</b>' },
      { id: 'segunda', title: 'Nota 2', html: 'Outra' },
    ],
  });
});

test('cria a prÃ³xima aba sem colidir com identificadores existentes', () => {
  const document = {
    version: 1,
    activeTabId: 'note-1',
    tabs: [
      { id: 'note-1', title: 'Nota 1', html: '' },
      { id: 'note-3', title: 'Nota 3', html: '' },
    ],
  };

  assert.deepEqual(nextPlayerNoteTab(document), {
    id: 'note-4',
    title: 'Nota 4',
    html: '',
  });
});

test('limita documentos e novas criaÃ§Ãµes a vinte abas', () => {
  const tabs = Array.from({ length: 25 }, (_, index) => ({
    id: `tab-${index + 1}`,
    title: `Nota ${index + 1}`,
    html: `ConteÃºdo ${index + 1}`,
  }));
  const parsed = parsePlayerNotesDocument(JSON.stringify({
    version: 1,
    activeTabId: 'tab-25',
    tabs,
  }));

  assert.equal(parsed.tabs.length, 20);
  assert.equal(parsed.activeTabId, 'tab-1');
  assert.equal(nextPlayerNoteTab(parsed), null);
});

test('recupera o documento padrÃ£o quando o JSON atual nÃ£o possui abas vÃ¡lidas', () => {
  assert.deepEqual(
    parsePlayerNotesDocument(JSON.stringify({ version: 1, activeTabId: '', tabs: [] })),
    createPlayerNotesDocument(),
  );
});
