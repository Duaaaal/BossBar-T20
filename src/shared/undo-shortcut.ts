const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.closest<HTMLElement>(
    'input, textarea, [contenteditable="true"]',
  );
  if (!(editable instanceof HTMLInputElement)) return Boolean(editable);
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(editable.type);
};

let installed = false;

export const installUndoShortcut = (
  undo: () => boolean | Promise<boolean>,
) => {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.shiftKey ||
      event.altKey ||
      (!event.ctrlKey && !event.metaKey) ||
      event.key.toLowerCase() !== 'z' ||
      isEditableTarget(event.target)
    ) return;
    event.preventDefault();
    void undo();
  });
};

export const isUndoEditableTarget = isEditableTarget;
