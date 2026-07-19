const DISABLED_SELECTOR = [
  'button:disabled',
  'input:disabled',
  'select:disabled',
  'textarea:disabled',
  '[aria-disabled="true"]',
].join(',');

let installed = false;

export const installDisabledControlTooltips = () => {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const tooltip = document.createElement('div');
  tooltip.className = 'disabled-control-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;

  const ensureMounted = () => {
    if (!tooltip.isConnected && document.body) document.body.appendChild(tooltip);
  };
  const hide = () => {
    tooltip.hidden = true;
  };
  document.addEventListener('pointermove', (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(DISABLED_SELECTOR);
    if (!target) {
      hide();
      return;
    }
    ensureMounted();
    tooltip.textContent = target.dataset.disabledReason || 'Pré-requisito não atendido';
    tooltip.hidden = false;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(
      window.innerWidth - width - 8,
      event.clientX + 12,
    ))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(
      window.innerHeight - height - 8,
      event.clientY + 14,
    ))}px`;
  }, { passive: true });
  document.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
};
