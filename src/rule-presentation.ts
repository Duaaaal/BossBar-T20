import './rule-presentation.css';
import { citationPattern, citationBook, referenceLink } from './shared/reference-books';
import { getReferenceBookResolver } from './reference-book-client';
const appendHighlightedText = (element: HTMLElement, text: string) => {
  const emphasis = /[+−-]?\d+(?:[.,]\d+)?(?:d\d+)?|\b(?:Perícia|Treino|Progressão|Atributo-chave|Atributo|Outros|Base|Total|Bônus|Fontes|Defesa|RD|PV|PM|CD|Força|Destreza|Constituição|Inteligência|Sabedoria|Carisma|permanentes?|temporários?|equipada|real|bruta)\b/gi;
  let end = 0;
  for (const match of text.matchAll(emphasis)) {
    element.append(document.createTextNode(text.slice(end, match.index)));
    const span = document.createElement('span'); span.className = /^[−+\d-]/.test(match[0]) ? 'rule-value' : 'rule-term'; span.textContent = match[0]; element.append(span); end = match.index! + match[0].length;
  }
  element.append(document.createTextNode(text.slice(end)));
};

/** Render citations as text nodes, never interpret imported text as markup. */
export const appendRuleText = (element: HTMLElement, text: string) => {
  const citation = citationPattern();
  let end = 0;
  for (const match of text.matchAll(citation)) {
    appendHighlightedText(element, text.slice(end, match.index));
    const reference = document.createElement('cite'); reference.className = 'rule-citation';
    const link = document.createElement('a'); link.textContent = match[0]; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const source = citationBook(match[0]);
    if (source) link.href = getReferenceBookResolver() ? `${location.origin}/reference-books/${source.book.id}#page=${source.page}` : referenceLink(source.book.id, source.page);
    const open = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      event.stopPropagation();
      const bookResolver = getReferenceBookResolver();
      if (!source || !bookResolver) return;
      event.preventDefault();
      const tab = window.open('about:blank', '_blank');
      if (!tab) return;
      tab.opener = null; tab.document.title = source.book.name; tab.document.body.textContent = 'Abrindo a referência…';
      void bookResolver(source.book.id, source.page).then((url) => { if (!tab.closed) tab.location.replace(url); }).catch((error) => {
        if (!tab.closed) tab.document.body.textContent = error instanceof Error ? error.message : 'Erro inesperado ao abrir a referência.';
      });
    };
    link.addEventListener('click', open); link.addEventListener('auxclick', open);
    reference.append(link); element.append(reference);
    end = match.index! + match[0].length;
  }
  appendHighlightedText(element, text.slice(end));
};

let tooltipSequence = 0;
let hideCurrentTooltip: (() => void) | undefined;
/** The native popover top layer also works above nested modal dialogs. */
export const calculationTooltip = (element: HTMLElement, content: () => string) => {
  let tooltip: HTMLDivElement | undefined;
  let observer: MutationObserver | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const onScroll = (event: Event) => { if (!tooltip?.contains(event.target as Node)) position(); };
  const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
  const onInteraction = (event: Event) => { if (!tooltip?.contains(event.target as Node)) hide(); };
  const hide = () => {
    clearTimeout(hideTimer); observer?.disconnect(); observer = undefined;
    document.removeEventListener('scroll', onScroll, true); document.removeEventListener('keydown', onEscape, true);
    document.removeEventListener('input', onInteraction, true); document.removeEventListener('pointerdown', onInteraction, true);
    if (!tooltip) return; tooltip.remove(); tooltip = undefined; element.removeAttribute('aria-describedby');
  };
  const scheduleHide = () => { hideTimer = setTimeout(hide, 150); };
  const position = () => {
    if (!tooltip) return;
    const rect = element.getBoundingClientRect(); const bounds = tooltip.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) { hide(); return; }
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bounds.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, rect.bottom + bounds.height + 10 < innerHeight ? rect.bottom + 7 : rect.top - bounds.height - 7)}px`;
  };
  const show = () => {
    hideCurrentTooltip?.(); hideCurrentTooltip = hide; element.removeAttribute('title');
    tooltip = document.createElement('div'); tooltip.className = 'calculation-tooltip'; tooltip.id = `calculation-tooltip-${++tooltipSequence}`;
    tooltip.setAttribute('role', 'tooltip'); tooltip.setAttribute('popover', 'manual');
    const [firstLine, ...lines] = content().split('\n');
    const heading = document.createElement('strong'); heading.className = 'calculation-tooltip-heading'; appendRuleText(heading, firstLine); tooltip.append(heading);
    if (lines.length) { tooltip.append(document.createTextNode('\n')); appendRuleText(tooltip, lines.join('\n')); }
    document.body.append(tooltip); tooltip.showPopover(); element.setAttribute('aria-describedby', tooltip.id);
    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer)); tooltip.addEventListener('mouseleave', scheduleHide);
    tooltip.addEventListener('focusin', () => clearTimeout(hideTimer)); tooltip.addEventListener('focusout', (event) => { if (!tooltip?.contains(event.relatedTarget as Node)) scheduleHide(); });
    position();
    observer = new MutationObserver(() => { if (!element.isConnected || element.closest('[hidden]')) hide(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('scroll', onScroll, true); document.addEventListener('keydown', onEscape, true);
    document.addEventListener('input', onInteraction, true); document.addEventListener('pointerdown', onInteraction, true);
  };
  element.addEventListener('mouseenter', show); element.addEventListener('mouseleave', scheduleHide);
  element.addEventListener('focus', show); element.addEventListener('blur', (event) => { if (!tooltip?.contains(event.relatedTarget as Node)) scheduleHide(); });
  element.addEventListener('keydown', hide); element.addEventListener('pointerdown', hide);
  // Modal close and rerenders remove the anchor without mouseleave.
};
