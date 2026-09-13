/**
 * The shared vanilla select for the build-less NRDS client (KTD6), the replacement for the
 * react-select SelectComponent. `createSelect({ container, options, value, onChange, compact,
 * label, id })` mounts a light-DOM listbox into `container` and returns a controller
 * ({ element, setOptions, setValue, destroy }) so a caller can keep it in step with a store.
 *
 * It is a select-only combobox (the WAI-ARIA APG pattern): the control is `role="combobox"` with
 * `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls`; the menu is a `role="listbox"`
 * of `role="option"` items, and the focused option is tracked with `aria-activedescendant` rather
 * than moving DOM focus. The control carries full keyboard support -- arrow keys, Home/End,
 * Enter/Space to open and choose, Escape to close, Tab to leave, and printable-character
 * type-ahead -- so it reaches keyboard/ARIA parity with react-select without a text input.
 *
 * Theming and sizing are token-driven from the --select-* tokens in app.css: `compact` gives the
 * 30px control, the default is 44px, matching the React control heights.
 */

/** Normalise an options list to `{ value, label }` objects; a bare string becomes both. */
export function toOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((opt) => {
    if (opt && typeof opt === 'object') {
      const value = opt.value;
      const label = opt.label ?? String(value ?? '');
      return { value, label };
    }
    return { value: opt, label: String(opt ?? '') };
  });
}

/** The primitive a `value` prop carries, whether it is a bare value or an `{ value }` option. */
export function valueOf(value) {
  return value && typeof value === 'object' ? value.value : value;
}

/** The index of the option matching `value`, or -1 when none does. */
export function optionIndexOf(options, value) {
  const v = valueOf(value);
  if (v === undefined || v === null) return -1;
  return options.findIndex((opt) => opt.value === v);
}

/** Move an index by `delta`, clamped to the list (no wrap); -1 (nothing active) starts at an end. */
export function moveIndex(current, delta, length) {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return Math.max(0, Math.min(length - 1, current + delta));
}

/**
 * The next option whose label starts with the typed buffer, searching after `fromIndex` and
 * wrapping, case-insensitively; -1 when nothing matches so the caller can leave the active option
 * where it is.
 */
export function typeAheadIndex(options, buffer, fromIndex) {
  const needle = String(buffer ?? '').toLowerCase();
  if (!needle || !options.length) return -1;
  const start = fromIndex < 0 ? 0 : fromIndex;
  for (let i = 1; i <= options.length; i++) {
    const idx = (start + i) % options.length;
    if (String(options[idx].label).toLowerCase().startsWith(needle)) return idx;
  }
  if (String(options[start]?.label ?? '').toLowerCase().startsWith(needle)) return start;
  return -1;
}

let uid = 0;
const nextUid = () => `nrds-select-${++uid}`;

const ARROW_SVG =
  '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
  '<path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const TYPE_AHEAD_RESET_MS = 500;

/** Mount a select into `container`; returns a controller kept in step with a store by the caller. */
export function createSelect({
  container,
  options = [],
  value = null,
  onChange,
  compact = false,
  disabled = false,
  label,
  id,
} = {}) {
  const controlId = id || nextUid();
  const listboxId = `${controlId}-listbox`;

  let items = toOptions(options);
  let selectedIndex = optionIndexOf(items, value);
  let activeIndex = selectedIndex;
  let open = false;
  let isDisabled = Boolean(disabled);
  let typeBuffer = '';
  let typeTimer = null;

  const root = document.createElement('div');
  root.className = 'nrds-select';
  if (compact) root.dataset.compact = 'true';

  const control = document.createElement('div');
  control.className = 'nrds-select__control';
  control.id = controlId;
  control.setAttribute('role', 'combobox');
  control.setAttribute('tabindex', '0');
  control.setAttribute('aria-haspopup', 'listbox');
  control.setAttribute('aria-expanded', 'false');
  control.setAttribute('aria-controls', listboxId);
  if (label) control.setAttribute('aria-label', label);

  const valueEl = document.createElement('span');
  valueEl.className = 'nrds-select__value';

  const arrow = document.createElement('span');
  arrow.className = 'nrds-select__arrow';
  arrow.innerHTML = ARROW_SVG;

  control.append(valueEl, arrow);

  const listbox = document.createElement('ul');
  listbox.className = 'nrds-select__listbox';
  listbox.id = listboxId;
  listbox.setAttribute('role', 'listbox');
  if (label) listbox.setAttribute('aria-label', label);
  listbox.hidden = true;

  root.append(control, listbox);
  container.append(root);

  const optionId = (i) => `${controlId}-opt-${i}`;

  const renderValueText = () => {
    valueEl.textContent = selectedIndex >= 0 ? items[selectedIndex].label : '';
  };

  const renderOptions = () => {
    listbox.textContent = '';
    items.forEach((opt, i) => {
      const li = document.createElement('li');
      li.className = 'nrds-select__option';
      li.id = optionId(i);
      li.setAttribute('role', 'option');
      li.dataset.index = String(i);
      li.setAttribute('aria-selected', i === selectedIndex ? 'true' : 'false');
      if (i === activeIndex) li.classList.add('is-active');
      li.textContent = opt.label;
      listbox.append(li);
    });
  };

  const applyActive = () => {
    for (const li of listbox.children) {
      li.classList.toggle('is-active', Number(li.dataset.index) === activeIndex);
    }
    if (open && activeIndex >= 0) {
      control.setAttribute('aria-activedescendant', optionId(activeIndex));
      const el = listbox.children[activeIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else {
      control.removeAttribute('aria-activedescendant');
    }
  };

  const openList = () => {
    if (open || isDisabled || !items.length) return;
    open = true;
    listbox.hidden = false;
    control.setAttribute('aria-expanded', 'true');
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    applyActive();
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
  };

  const closeList = () => {
    if (!open) return;
    open = false;
    listbox.hidden = true;
    control.setAttribute('aria-expanded', 'false');
    control.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  };

  /** Commit the option at `i`, notifying only on a real change; returns nothing. */
  const choose = (i) => {
    if (i < 0 || i >= items.length) return;
    const changed = i !== selectedIndex;
    selectedIndex = i;
    activeIndex = i;
    renderOptions();
    renderValueText();
    if (changed && typeof onChange === 'function') onChange({ ...items[i] });
  };

  const clearTypeBuffer = () => {
    typeBuffer = '';
    if (typeTimer) {
      clearTimeout(typeTimer);
      typeTimer = null;
    }
  };

  const onType = (char) => {
    typeBuffer += char;
    if (typeTimer) clearTimeout(typeTimer);
    typeTimer = setTimeout(clearTypeBuffer, TYPE_AHEAD_RESET_MS);
    const from = open ? activeIndex : selectedIndex;
    const match = typeAheadIndex(items, typeBuffer, from);
    if (match < 0) return;
    if (open) {
      activeIndex = match;
      applyActive();
    } else {
      choose(match);
    }
  };

  const onDocumentPointerDown = (event) => {
    if (!root.contains(event.target)) closeList();
  };

  const onControlKeyDown = (event) => {
    if (isDisabled) return;
    const { key } = event;
    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList();
        else {
          activeIndex = moveIndex(activeIndex, 1, items.length);
          applyActive();
        }
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        else {
          activeIndex = moveIndex(activeIndex, -1, items.length);
          applyActive();
        }
        return;
      case 'Home':
        if (!open) return;
        event.preventDefault();
        activeIndex = moveIndex(-1, 1, items.length);
        applyActive();
        return;
      case 'End':
        if (!open) return;
        event.preventDefault();
        activeIndex = moveIndex(-1, -1, items.length);
        applyActive();
        return;
      case 'Enter':
        event.preventDefault();
        if (open) {
          choose(activeIndex);
          closeList();
        } else {
          openList();
        }
        return;
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        if (open) {
          choose(activeIndex);
          closeList();
        } else {
          openList();
        }
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          closeList();
        }
        return;
      case 'Tab':
        closeList();
        return;
      default:
        if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          onType(key);
        }
    }
  };

  const onControlClick = () => {
    if (isDisabled) return;
    if (open) closeList();
    else openList();
  };

  /** Reflect the disabled state onto the control: no focus stop, no pointer, an ARIA signal. */
  const applyDisabled = () => {
    root.classList.toggle('is-disabled', isDisabled);
    control.setAttribute('tabindex', isDisabled ? '-1' : '0');
    if (isDisabled) control.setAttribute('aria-disabled', 'true');
    else control.removeAttribute('aria-disabled');
  };

  const onListPointerOver = (event) => {
    const li = event.target.closest('.nrds-select__option');
    if (!li) return;
    activeIndex = Number(li.dataset.index);
    applyActive();
  };

  const onListClick = (event) => {
    const li = event.target.closest('.nrds-select__option');
    if (!li) return;
    choose(Number(li.dataset.index));
    closeList();
    control.focus();
  };

  control.addEventListener('keydown', onControlKeyDown);
  control.addEventListener('click', onControlClick);
  listbox.addEventListener('pointerover', onListPointerOver);
  listbox.addEventListener('click', onListClick);

  renderOptions();
  renderValueText();
  applyDisabled();

  return {
    element: root,
    /** Turn interaction on or off; a disabled control leaves the tab order and closes if open. */
    setDisabled(next) {
      const value = Boolean(next);
      if (value === isDisabled) return;
      isDisabled = value;
      if (isDisabled) closeList();
      applyDisabled();
    },
    /** Replace the option list, keeping the current value selected when it is still present. */
    setOptions(newOptions) {
      const prevValue = selectedIndex >= 0 ? items[selectedIndex].value : null;
      items = toOptions(newOptions);
      selectedIndex = optionIndexOf(items, prevValue);
      activeIndex = selectedIndex;
      renderOptions();
      renderValueText();
      if (open && !items.length) closeList();
    },
    /** Set the selected value without notifying onChange (an external clock/store did the change). */
    setValue(newValue) {
      const idx = optionIndexOf(items, newValue);
      if (idx === selectedIndex) return;
      selectedIndex = idx;
      if (!open) activeIndex = idx;
      renderOptions();
      renderValueText();
      applyActive();
    },
    /** Current value, or null when nothing is selected. */
    getValue() {
      return selectedIndex >= 0 ? items[selectedIndex].value : null;
    },
    destroy() {
      clearTypeBuffer();
      closeList();
      control.removeEventListener('keydown', onControlKeyDown);
      control.removeEventListener('click', onControlClick);
      listbox.removeEventListener('pointerover', onListPointerOver);
      listbox.removeEventListener('click', onListClick);
      root.remove();
    },
  };
}

export default createSelect;
