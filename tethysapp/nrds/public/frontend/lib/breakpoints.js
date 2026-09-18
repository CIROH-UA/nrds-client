/**
 * The viewport breakpoint that turns the anchored feature popup into a bottom sheet (migration unit
 * U5d), the vanilla port of the React DataStream lib/breakpoints + sheetGeometry. The predicate and
 * the data-sheet state mapping are pure so they can be unit-tested without matchMedia; `watchSheet`
 * is the thin matchMedia subscription the popup and the sheet gate themselves on, and it touches
 * `window` only when called so this module stays importable under tests and tooling.
 */

/** Where the feature panel stops being an anchored popup and becomes a bottom sheet. */
export const SHEET_MAX_PX = 768;

/** Whether a viewport width is narrow enough for the sheet to host the feature content. */
export const isSheetWidth = (width) => Number(width) <= SHEET_MAX_PX;

/** The `body[data-sheet]` value for a sheet's open/collapsed state, which the CSS offsets read. */
export const sheetDataState = ({ open = false, collapsed = false } = {}) =>
  open ? (collapsed ? 'collapsed' : 'expanded') : 'closed';

/** The height the collapsed sheet keeps on screen when nothing has been measured yet. */
export const PEEK_FALLBACK_PX = 88;

/** How much of the sheet stays on screen when it is minimised: its peek row, floored and capped. */
export const peekFor = ({ rowHeight = 0, paddingTop = 0, sheetHeight = 0 } = {}) => {
  const wanted = Math.ceil(rowHeight + paddingTop + 8);
  const floor = Math.min(PEEK_FALLBACK_PX, sheetHeight);
  return Math.max(floor, Math.min(wanted, sheetHeight));
};

const SHEET_QUERY = `(max-width: ${SHEET_MAX_PX}px)`;

/**
 * Subscribe to the sheet breakpoint. `onChange(matches)` fires whenever the viewport crosses it.
 * Returns `{ matches, destroy }`: `matches()` reads the current state, `destroy()` unsubscribes.
 * Falls back to `window.innerWidth` where matchMedia is unavailable.
 */
export function watchSheet(onChange) {
  let mql = null;
  try {
    mql = window.matchMedia ? window.matchMedia(SHEET_QUERY) : null;
  } catch {
    mql = null;
  }

  const matches = () => {
    if (mql) return mql.matches;
    try {
      return window.innerWidth <= SHEET_MAX_PX;
    } catch {
      return false;
    }
  };

  const handler = () => {
    if (typeof onChange === 'function') onChange(matches());
  };

  if (mql?.addEventListener) mql.addEventListener('change', handler);

  return {
    matches,
    destroy() {
      if (mql?.removeEventListener) mql.removeEventListener('change', handler);
    },
  };
}
