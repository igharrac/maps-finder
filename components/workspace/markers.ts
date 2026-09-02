import { MARKER_APPEARANCE, type MarkerStyleKey } from '@/lib/types';

/**
 * Bouwt het DOM-element voor een marker. Elke status heeft een eigen VORM naast
 * de kleur; wie kleuren niet kan onderscheiden ziet nog steeds verschil.
 */
export function createMarkerElement(
  styleKey: MarkerStyleKey,
  options: { selected?: boolean; title: string },
): HTMLElement {
  const { color, shape, label } = MARKER_APPEARANCE[styleKey];
  const size = options.selected ? 30 : 22;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', `${options.title} — ${label}`);

  if (options.selected) {
    const halo = document.createElement('div');
    halo.style.cssText = `position:absolute;left:-9px;top:-9px;width:${size + 18}px;height:${
      size + 18
    }px;border-radius:50%;background:${color}29;`;
    wrapper.appendChild(halo);
  }

  const dot = document.createElement('div');
  const base = `position:relative;width:${size}px;height:${size}px;background:${color};border:${
    options.selected ? 3 : 2.5
  }px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;`;

  switch (shape) {
    case 'diamond':
      dot.style.cssText = `${base}transform:rotate(45deg);border-radius:4px;`;
      break;
    case 'square':
      dot.style.cssText = `${base}border-radius:6px;`;
      break;
    case 'bubble':
      dot.style.cssText = `${base}border-radius:50% 50% 50% 4px;`;
      break;
    default:
      dot.style.cssText = `${base}border-radius:50%;`;
  }

  if (shape === 'ring') {
    const inner = document.createElement('span');
    inner.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#fff;';
    dot.appendChild(inner);
  }

  if (shape === 'check') {
    dot.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>';
  }

  if (shape === 'square') {
    dot.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>';
  }

  wrapper.appendChild(dot);
  return wrapper;
}
