const DISABLED_SELECTOR = [
  'button:disabled',
  'input:disabled',
  'select:disabled',
  'textarea:disabled',
  '[aria-disabled="true"]',
].join(',');
const TOOLTIP_SELECTOR = `[data-app-tooltip], ${DISABLED_SELECTOR}`;

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
  const convertNativeTooltip = (target: HTMLElement | null) => {
    const titled = target?.closest<HTMLElement>('[title]');
    if (!titled) return;
    const title = titled.getAttribute('title')?.trim();
    if (title) {
      titled.dataset.appTooltip = title;
      if (
        titled.matches('button, input, select, textarea, [role="button"]') &&
        (
          !titled.getAttribute('aria-label') ||
          titled.dataset.generatedTooltipLabel === 'true'
        )
      ) {
        titled.setAttribute('aria-label', title);
        titled.dataset.generatedTooltipLabel = 'true';
      }
    }
    titled.removeAttribute('title');
  };
  const tooltipText = (target: HTMLElement) =>
    target.dataset.appTooltip ||
    target.dataset.disabledReason ||
    'Pré-requisito não atendido';
  const positionTooltip = (left: number, top: number) => {
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(
      window.innerWidth - width - 8,
      left,
    ))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(
      window.innerHeight - height - 8,
      top,
    ))}px`;
  };

  document.addEventListener('pointerover', (event) => {
    convertNativeTooltip(event.target instanceof HTMLElement ? event.target : null);
  }, true);
  document.addEventListener('pointermove', (event) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(TOOLTIP_SELECTOR);
    if (!target) {
      hide();
      return;
    }
    ensureMounted();
    tooltip.textContent = tooltipText(target);
    tooltip.hidden = false;
    positionTooltip(event.clientX + 12, event.clientY + 14);
  }, { passive: true });
  document.addEventListener('focusin', (event) => {
    const element = event.target instanceof HTMLElement ? event.target : null;
    convertNativeTooltip(element);
    const target = element?.closest<HTMLElement>(TOOLTIP_SELECTOR);
    if (!target) return;
    ensureMounted();
    tooltip.textContent = tooltipText(target);
    tooltip.hidden = false;
    const bounds = target.getBoundingClientRect();
    positionTooltip(bounds.left, bounds.bottom + 8);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
};
