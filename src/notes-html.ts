const allowedNoteTags = new Set([
  'B', 'BR', 'DIV', 'EM', 'FONT', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U',
]);

export const sanitizeNotesHtml = (value: string) => {
  const template = document.createElement('template');
  template.innerHTML = value.slice(0, 90_000);

  const sanitizeNode = (node: Node) => {
    for (const child of [...node.childNodes]) sanitizeNode(child);
    if (!(node instanceof Element)) return;
    if (!(node instanceof HTMLElement)) {
      node.remove();
      return;
    }
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') {
      node.remove();
      return;
    }
    if (!allowedNoteTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }

    const fontSize = node.tagName === 'FONT' ? node.getAttribute('size') : null;
    for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
    if (fontSize && /^[2-5]$/.test(fontSize)) node.setAttribute('size', fontSize);
  };

  sanitizeNode(template.content);
  return template.innerHTML;
};
