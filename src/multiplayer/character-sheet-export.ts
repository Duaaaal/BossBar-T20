import { PDFDocument, PDFTextField, PDFDropdown, StandardFonts, rgb, defaultDropdownAppearanceProvider, type PDFFont } from 'pdf-lib';
import type { CharacterSheetEditorField } from '../shared/character-sheet.ts';
import { NIMB_FIELD_ALIASES, SHEET_EXTRA_FIELD } from './character-sheet-model.ts';
import { RD_TARGETS, RD_SOURCES, RD_FIELD, normalizeDamageReduction, damageReductionSummary } from '../shared/damage-reduction.ts';
import { ATTRIBUTES, ATTRIBUTE_PLAN_FIELD, parseAttributePlan } from '../shared/character-attributes.ts';
import { characterSkillRules, skillDisplayName, skillComponentFields } from '../shared/skill-definitions.ts';
import { calculateCharacterSkills } from '../shared/character-skills.ts';
import { createHash } from 'node:crypto';

export const EXPORT_MANIFEST = 'BossBar.Export.Manifest';
type Manifest = { parts: Record<string, string[]>; canonical: string[]; inventoryColumns?: boolean; bodies?: Record<string, string>; generated?: Record<string, string>; pages?: number; referencePages?: number[]; rd?: Record<string, { category?: string; entry?: number; property: string }> };
const textDigest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Recombine editable continuation fields before applying the Nimb adapter. */
export const readExportContinuations = (raw: Record<string, string>) => {
  if (!raw[EXPORT_MANIFEST]) return raw;
  const manifest = JSON.parse(raw[EXPORT_MANIFEST]) as Manifest;
  if (!manifest || !Array.isArray(manifest.canonical) || typeof manifest.parts !== 'object') throw new Error('As páginas de continuação do PDF são inválidas.');
  for (const [name, parts] of Object.entries(manifest.parts)) {
    if (!Array.isArray(parts) || parts.length > 1000 || parts.some((part) => typeof part !== 'string')) throw new Error('A continuação de um campo é inválida.');
    raw[name] = parts.map((part) => raw[part] ?? '').join('');
  }
  const extra = JSON.parse(raw[SHEET_EXTRA_FIELD] || '{}');
  if (manifest.inventoryColumns) { raw.item1 = (raw.item1 ?? '') + (raw.item2 ?? ''); raw.item2 = ''; }
  if (manifest.bodies?.Historico && textDigest(raw.Historico ?? '') !== manifest.bodies.Historico) {
    for (const name of Object.keys(extra)) if (name.startsWith('BossBar.Habilidades.')) delete extra[name];
    raw['Habilidades de Raça e Origem'] = ''; raw['Habilidades de classe e poderes'] = '';
    extra['BossBar.TextCatalogVersion'] = '';
  }
  if (manifest.bodies?.Atualização && textDigest(raw.Atualização ?? '') !== manifest.bodies.Atualização) {
    for (const name of Object.keys(extra)) if (name.startsWith('BossBar.Magia.')) delete extra[name];
    extra['BossBar.TextCatalogVersion'] = '';
  }
  if (manifest.pages) extra['BossBar.Export.PageCount'] = String(manifest.pages);
  if (manifest.referencePages) extra['BossBar.Export.ReferencePages'] = JSON.stringify(manifest.referencePages);
  for (const name of manifest.canonical) if (typeof name === 'string' && name in raw) {
    extra[name] = raw[name];
    if (NIMB_FIELD_ALIASES[name]) raw[NIMB_FIELD_ALIASES[name]] = raw[name];
  }
  for (const [name, digest] of Object.entries(manifest.generated ?? {})) if (textDigest(raw[name] ?? '') !== digest) {
    const text = raw[name] ?? '';
    extra['BossBar.Nimb.Anotacoes'] = [extra['BossBar.Nimb.Anotacoes'], text].filter(Boolean).join('\n\n');
    raw['Anotações'] = extra['BossBar.Nimb.Anotacoes'];
    extra['BossBar.Import.ExportReview'] = 'Detalhes de equipamento, ataques, atributos ou RD foram editados como texto no PDF. O texto foi preservado em Anotações da ficha. Confira os campos de cálculo correspondentes antes de usar em combate.';
  }
  if (manifest.rd) {
    const rd = normalizeDamageReduction(extra[RD_FIELD]);
    for (const [name, target] of Object.entries(manifest.rd)) {
      const protection = target.category ? Object.entries(rd.categories ?? {}).find(([key]) => key === target.category)?.[1] : rd.entries[target.entry ?? -1];
      if (!protection || !['amount', 'name', 'immune', 'bypass', 'source', 'target'].includes(target.property)) continue;
      const value = raw[name] ?? '';
      const translated = target.property === 'amount' ? Number(value.replace(',', '.'))
        : target.property === 'immune' ? value === 'Yes'
          : target.property === 'bypass' ? value.split(',').map((part) => RD_TARGETS.find(([id, label]) => id === part.trim() || label === part.trim())?.[0]).filter(Boolean)
            : target.property === 'source' ? RD_SOURCES.find(([id, label]) => id === value || label === value)?.[0] ?? value
              : target.property === 'target' ? RD_TARGETS.find(([id, label]) => id === value || label === value)?.[0] ?? value : value;
      Object.assign(protection, { [target.property]: translated });
    }
    extra[RD_FIELD] = JSON.stringify(rd);
  }
  raw[SHEET_EXTRA_FIELD] = JSON.stringify(extra);
  return raw;
};

const printable = (value: string, font: PDFFont) => [...value].map((character) => {
  if (character === '\n' || character === '\r') return character;
  if (character === '\t') return '    ';
  try { font.encodeText(character); return character; }
  catch { return ({ '→': '->', '−': '-', '✓': 'Sim', '☐': '[ ]', '☑': '[x]' } as Record<string, string>)[character] ?? `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`; }
}).join('');

// Count wrapped lines conservatively while retaining every original character.
const takeLines = (text: string, font: PDFFont, size: number, width: number, rows: number) => {
  let line = ''; let row = 1; let end = 0;
  for (const token of text.match(/[^\S\n]*\S+|[^\S\n]+|\n/g) ?? []) {
    if (token === '\n') { row++; line = ''; }
    else if (font.widthOfTextAtSize(line + token, size) > width) {
      row += Math.max(1, Math.ceil(font.widthOfTextAtSize(token, size) / width)); line = token.trimStart();
    } else line += token;
    if (row > rows) break;
    end += token.length;
  }
  if (!end && text) end = Math.max(1, Math.floor(width / size));
  return [text.slice(0, end), text.slice(end)] as const;
};
const wrappedRows = (text: string, font: PDFFont, size: number, width: number) => {
  let rows = 1; let line = '';
  for (const token of text.match(/[^\S\n]*\S+|[^\S\n]+|\n/g) ?? []) {
    if (token === '\n') { rows++; line = ''; }
    else if (font.widthOfTextAtSize(line + token, size) > width) { rows += Math.max(1, Math.ceil(font.widthOfTextAtSize(token, size) / width)); line = token.trimStart(); }
    else line += token;
  }
  return rows;
};

/** Keep the original Nimb artwork and AcroForm; long text gets editable pages. */
export const layoutEditableNimbExport = async (document: PDFDocument, blank: Uint8Array, fields: CharacterSheetEditorField[], referencePages: number[] = []) => {
  const form = document.getForm(); const font = await document.embedFont(StandardFonts.TimesRoman);
  const titleFont = await document.embedFont(StandardFonts.HelveticaBold);
  const template = await PDFDocument.load(blank);
  const background = await document.embedPage(template.getPage(1));
  const manifest: Manifest = { parts: {}, canonical: [], referencePages };
  const pageWidgets = new Set(document.getPages().flatMap((page) => (page.node.Annots()?.asArray() ?? []).map((annotation) => document.context.lookup(annotation))));
  const visibleWidgets = (field: ReturnType<typeof form.getFields>[number]) => field.acroField.getWidgets().filter((widget) => pageWidgets.has(widget.dict));
  const nativeLabel = (name: string) => {
    const special = ({ Historico: 'Poderes e habilidades', Atualização: 'Magias' } as Record<string, string>)[name];
    const descriptor = fields.find((field) => (NIMB_FIELD_ALIASES[field.name] ?? field.name) === name);
    return special ?? (descriptor ? [descriptor.group, descriptor.label].filter(Boolean).join(' — ') : name);
  };
  manifest.bodies = Object.fromEntries(['Historico', 'Atualização'].map((name) => [name, textDigest(printable(form.getTextField(name).getText() ?? '', font))]));
  let serial = 0;
  const continuation = (title: string) => {
    const page = document.addPage([581.16, 779.64]); page.drawPage(background);
    // Replace only the small heading; retain Nimb's borders and parchment.
    page.drawRectangle({ x: 243, y: 724, width: 87, height: 24, color: rgb(1, 1, 1) });
    page.drawText('CONTINUAÇÃO', { x: 248, y: 733, font: titleFont, size: 9 });
    page.drawText(printable(title, font).slice(0, 100), { x: 38, y: 698, font: titleFont, size: 10 });
    page.drawText(`Ficha editável • Página ${document.getPageCount()}`, { x: 38, y: 26, font, size: 8 });
    return page;
  };
  let overflowPage: ReturnType<typeof continuation> | null = null;
  let overflowTop = 680;
  const addOverflow = (name: string, title: string, value: string) => {
    let remaining = value; const parts: string[] = [];
    while (remaining) {
      if (document.getPageCount() >= 400) throw new Error('A ficha excede 400 páginas. Reduza as anotações antes de exportar.');
      if (!overflowPage || overflowTop < 110) { overflowPage = continuation(''); overflowTop = 697; }
      const size = 9; const rows = Math.max(1, Math.floor((overflowTop - 51 - 22 - 9) / (size * 1.25)));
      const [chunk, rest] = takeLines(remaining, font, size, 482, rows);
      const height = Math.max(25, wrappedRows(chunk, font, size, 482) * size * 1.25 + 9);
      overflowPage.drawText(printable(title, titleFont).slice(0, 105), { x: 38, y: overflowTop - 10, font: titleFont, size: 9 });
      overflowTop -= 22 + height;
      const partName = `BossBar.Export.Part${++serial}`;
      const field = form.createTextField(partName); field.enableMultiline(); field.setText(chunk); field.acroField.setDefaultAppearance('/Times-Roman 9 Tf 0 g');
      field.addToPage(overflowPage, { x: 38, y: overflowTop, width: 500, height, borderWidth: 0, font });
      field.setFontSize(size); field.disableScrolling(); field.updateAppearances(font);
      parts.push(partName); remaining = rest; overflowTop -= 10;
    }
    manifest.parts[name] = [name, ...parts];
  };
  const editorValues = Object.fromEntries(fields.map(({ name, value }) => [name, value]));
  type Block = { name: string; label: string; value: string; canonical?: boolean; generated?: boolean };
  const bodyBlocks: Record<string, Block[]> = { Historico: [], Atualização: [] };
  for (const [name, label] of [['Descrição', 'Descrição'], ['Proficiências', 'Proficiências'], ['BossBar.Nimb.Anotacoes', 'Anotações'], ['BossBar.Nimb.EntreAventuras', 'Entre aventuras'], ['BossBar.DefesaJustificativa', 'Outros bônus de Defesa']]) {
    const native = form.getFieldMaybe(NIMB_FIELD_ALIASES[name] ?? name);
    if (editorValues[name]?.trim() && (!native || !visibleWidgets(native).length)) bodyBlocks.Historico.push({ name, label, value: editorValues[name], canonical: true });
  }
  if (editorValues['BossBar.Nimb.MagiasAdicionais']?.trim()) bodyBlocks.Atualização.push({ name: 'BossBar.Nimb.MagiasAdicionais', label: 'Anotações para Magias', value: editorValues['BossBar.Nimb.MagiasAdicionais'], canonical: true });
  const details: string[] = [];
  const skillCalculations=calculateCharacterSkills(editorValues);
  for(const skill of characterSkillRules(editorValues).filter(r=>r.nameField?.startsWith('BossBar.Oficio.'))){
    const c=skillComponentFields(skill);const calculation=skillCalculations.get(skill.code);
    const sources=calculation?.sources.filter(source=>source.amount&&!source.ignored).map(source=>` + ${source.amount} (${source.name})`).join('')||'';
    const value=`${skillDisplayName(skill,editorValues)}: ${editorValues[skill.code]||'0'} = ${editorValues[skill.modifierField]||'0'} (atributo) + ${editorValues[c.halfLevel]||'0'} (metade do nível) + ${editorValues[c.training]||'0'} (treino) + ${calculation?.other??editorValues[c.other]??'0'} (outros)${sources}`;
    bodyBlocks.Historico.push({name:'BossBar.Export.'+skill.code,label:'Perícia adicional',value,generated:true});
  }
  for (const descriptor of fields.filter(({ section }) => ['Características', 'Pontos de vida e mana'].includes(section))) {
    const native = form.getFieldMaybe(NIMB_FIELD_ALIASES[descriptor.name] ?? descriptor.name);
    if (!descriptor.value.trim() || ['0', 'Off'].includes(descriptor.value) || descriptor.name.startsWith('BossBar.Nimb.') || (native && visibleWidgets(native).length)) continue;
    details.push(`${descriptor.label}: ${descriptor.value}`);
  }
  const rd = damageReductionSummary(normalizeDamageReduction(editorValues[RD_FIELD]));
  if (rd !== 'RD: 0') details.push(rd);
  const plan = parseAttributePlan(editorValues[ATTRIBUTE_PLAN_FIELD]);
  if (plan && plan.method !== 'unreviewed') details.push('Atributos (' + ({ points: 'compra por pontos', rolled: 'rolados', manual: 'personalizados' })[plan.method] + '): ' + ATTRIBUTES.map(([key]) => `${key}: base ${plan.base[key]}, ajustes ${plan.adjustments[key]}`).join('; ') + (plan.increases.length ? '. Aumentos adquiridos: ' + plan.increases.map((entry) => `${entry.attribute} +1 no nível ${entry.level}`).join('; ') : ''));
  if (editorValues['BossBar.MoedaPersonalizada.Nome']?.trim()) details.push(`${editorValues['BossBar.MoedaPersonalizada.Nome']}: ${editorValues['BossBar.MoedaPersonalizada.Quantidade'] || '0'}`);
  const groups = new Map<string, CharacterSheetEditorField[]>();
  for (const field of fields) if (field.group && /^(Ataque|Armadura|Escudo) \d+$/.test(field.group)) groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  for (const [group, entries] of groups) {
    const match = /^(Ataque|Armadura|Escudo) (\d+)$/.exec(group)!; const index = Number(match[2]);
    const name = editorValues[match[1] === 'Ataque' ? `Ataque ${index}` : index === 1 ? match[1] : `BossBar.${match[1]}.${index}.Nome`];
    if (!name?.trim()) continue;
    const information = entries.filter((field) => /\.Informacoes$/.test(field.name) && field.value.trim());
    if (information.length) details.push(`${name}: ${information.map((field) => field.value).join(' / ')}`);
    if (match[1] !== 'Ataque') {
      const extra = entries.filter((field) => field.value.trim() && !['0', 'Off'].includes(field.value) && field.kind !== 'checkbox' && !/\.(Informacoes|LimiteManual)$/.test(field.name) && (index > 1 || /\.Outros(Defesa|Penalidade)$/.test(field.name)));
      if (extra.length) details.push(`${name}: ${extra.map((field) => `${field.label}: ${field.value}`).join('; ')}`);
    }
    if (match[1] === 'Ataque') {
      if (index > 5) details.push(`${name}: ${entries.filter((field) => field.value.trim() && !/\.(Principal|DuasArmas|Informacoes|Base|MargemCritico|MultiplicadorCritico)$/.test(field.name) && !field.name.includes('.Segunda.') && field.kind !== 'checkbox').map((field) => `${field.label}: ${field.value}`).join('; ')}`);
      const prefix = `BossBar.Ataque.${index}`;
      if (editorValues[`${prefix}.Origem`] && editorValues[`${prefix}.Origem`] !== 'unknown') details.push(`${name}, origem: ${editorValues[`${prefix}.Origem`]}`);
      if (editorValues[`${prefix}.DuasArmas`] === 'Yes') details.push(`Segunda arma de ${name}: ${entries.filter((field) => field.name.includes('.Segunda.') && field.value.trim() && !/\.(Base|MargemCritico|MultiplicadorCritico)$/.test(field.name)).map((field) => `${field.label}: ${field.value}`).join('; ')}`);
    }
  }
  const reference = editorValues['BossBar.Nimb.PaginasAdicionais']?.replace(/^Página \d+\s*$/gm, '').trim();
  if (reference && !details.join('\n').includes(reference) && !bodyBlocks.Historico.some((block) => block.value.includes(reference))) bodyBlocks.Historico.push({ name: 'BossBar.Nimb.PaginasAdicionais', label: 'Anotações complementares', value: reference, generated: true });
  if (details.length) bodyBlocks.Historico.push({ name: 'BossBar.Export.Detalhes', label: 'Detalhes do personagem', value: details.join('\n'), generated: true });
  // Both equipment columns belong to one logical inventory; use both before adding a page.
  const inventory = [form.getTextField('item1').getText(), form.getTextField('item2').getText()].filter(Boolean).join('\n');
  const firstInventory = form.getTextField('item1'); const invRect = visibleWidgets(firstInventory)[0].getRectangle();
  const [leftInventory, rightInventory] = takeLines(printable(inventory, font), font, 9, invRect.width - 10, Math.floor((invRect.height - 9) / 11.25));
  firstInventory.setText(leftInventory); form.getTextField('item2').setText(rightInventory);
  manifest.inventoryColumns = true;
  const placeBody = (body: PDFTextField, blocks: Block[]) => {
    const widget = visibleWidgets(body)[0]; const rect = widget.getRectangle();
    const page = document.getPages().find((page) => (page.node.Annots()?.asArray() ?? []).some((ref) => document.context.lookup(ref) === widget.dict))!;
    let top = rect.y + rect.height; const bottom = rect.y;
    const content: Block[] = [{ name: body.getName(), label: '', value: body.getText() ?? '' }, ...blocks];
    let size = 10;
    const needed = (size: number) => content.reduce((height, block) => height + (block.label ? 17 : 0) + Math.max(24, wrappedRows(printable(block.value, font), font, size, rect.width - 10) * size * 1.25 + 9) + 7, 0);
    while (size > 7.5 && needed(size) > rect.height) size -= .5;
    for (const [index, block] of content.entries()) {
      const text = printable(block.value, font); if (!text.trim() && index > 0) continue;
      if (block.canonical) manifest.canonical.push(block.name);
      if (block.generated) { manifest.generated ??= {}; manifest.generated[block.name] = textDigest(text); }
      const labelHeight = block.label ? 17 : 0;
      const available = Math.max(0, top - bottom - labelHeight);
      const rows = Math.floor((available - 9) / (size * 1.25));
      if (rows < 1) {
        if (index === 0) body.setText('');
        else { const hidden = form.getFieldMaybe(block.name); if (hidden instanceof PDFTextField) hidden.setText(''); else form.createTextField(block.name).setText(''); }
        addOverflow(block.name, block.label || nativeLabel(block.name), text); continue;
      }
      const [chunk, remaining] = takeLines(text, font, size, rect.width - 10, rows);
      const height = Math.max(24, wrappedRows(chunk, font, size, rect.width - 10) * size * 1.25 + 9);
      if (block.label) page.drawText(block.label, { x: rect.x + 3, y: top - 12, font: titleFont, size: 9 });
      top -= labelHeight + height;
      let field: PDFTextField;
      if (index === 0) { field = body; widget.setRectangle({ x: rect.x, y: top, width: rect.width, height }); }
      else {
        const existing = form.getFieldMaybe(block.name); field = existing instanceof PDFTextField ? existing : form.createTextField(block.name);
        field.addToPage(page, { x: rect.x, y: top, width: rect.width, height, borderWidth: 0, font });
      }
      field.enableMultiline(); field.disableReadOnly(); field.disableScrolling(); field.setText(chunk); field.acroField.setDefaultAppearance('/Times-Roman 10 Tf 0 g'); field.setFontSize(size); field.updateAppearances(font); laidOut.add(block.name);
      top -= 7;
      if (remaining) addOverflow(block.name, block.label || nativeLabel(block.name), remaining);
    }
  };
  const laidOut = new Set<string>();
  for (const field of form.getFields()) {
    if (!visibleWidgets(field).length) continue;
    const widgets = visibleWidgets(field);
    for (const widget of widgets) {
      const rectangle = widget.getRectangle();
      widget.setRectangle({ x: Math.min(rectangle.x, rectangle.x + rectangle.width), y: Math.min(rectangle.y, rectangle.y + rectangle.height), width: Math.abs(rectangle.width), height: Math.abs(rectangle.height) });
    }
    const rect = widgets[0].getRectangle();
    if (field instanceof PDFDropdown) {
      const selected = field.getSelected()[0] ?? '';
      const label = selected.startsWith('mod') && form.getFieldMaybe(selected) instanceof PDFTextField
        ? form.getTextField(selected).getText() ?? '0'
        : field.getName() === 'modTamanho' ? ({ '1': 'Minúsculo', '2': 'Pequeno', '3': 'Médio', '4': 'Grande', '5': 'Enorme', '6': 'Colossal' } as Record<string, string>)[selected] ?? selected : selected;
      field.updateAppearances(font, (dropdown, widget, appearanceFont) => defaultDropdownAppearanceProvider(Object.create(dropdown, { getSelected: { value: () => [label] } }), widget, appearanceFont));
      continue;
    }
    if (!(field instanceof PDFTextField) || laidOut.has(field.getName())) continue;
    if (bodyBlocks[field.getName()]) {
      placeBody(field, bodyBlocks[field.getName()]); continue;
    }
    const text = printable(field.getText() ?? '', font);
    let size = ['item1', 'item2'].includes(field.getName()) ? 9 : rect.height < 30 ? Math.min(11, rect.height * .65) : 10;
    if (!field.isMultiline() && text && rect.height < 30) size = Math.max(5.5, Math.min(size, (rect.width - 9) / Math.max(1, font.widthOfTextAtSize(text.replace(/\n/g, ' '), 1))));
    if (!field.isMultiline() && text && rect.height >= 20 && font.widthOfTextAtSize(text.replace(/\n/g, ' '), size) > rect.width - 10) field.enableMultiline();
    if (field.isMultiline()) while (size > 6 && wrappedRows(text, font, size, rect.width - 10) > Math.floor((rect.height - 6) / (size * 1.25))) size = Math.max(6, size - .5);
    if (!field.acroField.getDefaultAppearance()) field.acroField.setDefaultAppearance('/Times-Roman 10 Tf 0 g');
    field.setFontSize(size);
    const rows = field.isMultiline() ? Math.max(1, Math.floor((rect.height - 6) / (size * 1.25))) : 1;
    const [chunk, remaining] = takeLines(text, font, size, Math.max(15, rect.width - 8), rows);
    field.setText(chunk); field.disableReadOnly();
    if (remaining) addOverflow(field.getName(), `Continuação: ${nativeLabel(field.getName())}`, remaining);
    field.updateAppearances(font);
  }
  manifest.pages = document.getPageCount();
  form.createTextField(EXPORT_MANIFEST).setText(JSON.stringify(manifest));
  return document.save({ addDefaultPage: false, updateFieldAppearances: true, useObjectStreams: false });
};
