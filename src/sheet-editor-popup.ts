export const sheetEditorPopup = (title: string) => {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet-editor-popup'; dialog.setAttribute('aria-label', title);
  const heading = document.createElement('h2'); heading.textContent = title;
  const body = document.createElement('div'); body.className = 'sheet-popup-body';
  const actions = document.createElement('div'); actions.className = 'sheet-popup-actions';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  const close = () => { dialog.close(); dialog.remove(); };
  cancel.addEventListener('click', close); actions.append(cancel); dialog.append(heading, body, actions);
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  document.body.append(dialog); dialog.showModal();
  requestAnimationFrame(() => {
    if (dialog.isConnected) dialog.style.height = `min(${Math.ceil(dialog.getBoundingClientRect().height)}px, calc(100dvh - 40px))`;
  });
  return { dialog, body, actions, close };
};

export const confirmAttributeReset = (message: string) => new Promise<boolean>((resolve) => {
  const popup = sheetEditorPopup('Reiniciar atributos?');
  const text = document.createElement('p'); text.textContent = message; popup.body.append(text);
  let accepted = false;
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Zerar e redistribuir'; reset.className = 'web-player-confirm-danger';
  reset.addEventListener('click', () => { accepted = true; popup.close(); }); popup.actions.append(reset);
  popup.dialog.addEventListener('close', () => resolve(accepted), { once: true });
});
