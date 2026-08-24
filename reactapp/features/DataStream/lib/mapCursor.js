export const CURSOR_CLICKABLE = 'pointer';
export const CURSOR_IDLE = 'grab';
export const CURSOR_DRAGGING = 'grabbing';

/** The pointer cursor over clickable map features. */
export function createPointerCursor() {
  let inside = 0;

  function cursorFor({ isDragging } = {}) {
    if (isDragging) return CURSOR_DRAGGING;
    return inside > 0 ? CURSOR_CLICKABLE : CURSOR_IDLE;
  }

  function paint(source) {
    const map = source?.getCanvas ? source : source?.target;
    const canvas = map?.getCanvas?.();
    if (canvas?.style) canvas.style.cursor = cursorFor({ isDragging: false });
  }

  return {
    cursorFor,
    enter(source) {
      inside += 1;
      paint(source);
    },
    leave(source) {
      inside = Math.max(0, inside - 1);
      if (inside > 0) return;
      paint(source);
    },
    reset(source) {
      inside = 0;
      paint(source);
    },
    insideCount: () => inside,
  };
}
