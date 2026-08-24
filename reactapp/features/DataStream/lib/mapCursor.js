export const CURSOR_CLICKABLE = 'pointer';
export const CURSOR_IDLE = 'grab';
export const CURSOR_DRAGGING = 'grabbing';

/**
 * The pointer cursor over clickable map features.
 *
 * One object owns the answer, because there are two things asking. deck.gl's overlay is
 * interleaved, so it renders into maplibre's own canvas and its _updateCursor writes
 * container.style.cursor on every pointer update, from a getCursor that defaults to
 * grabbing-or-grab. Writing the canvas ourselves was therefore undone on the very next mouse
 * move, which is why the pointer never appeared over a catchment however the listeners were
 * registered. Both the direct write and deck's question now read the same count, so they cannot
 * disagree: the write is for immediacy, and deck agrees with it rather than overruling it.
 *
 * A count rather than a boolean, following beginLoading/endLoading in actions/loadState.js.
 * maplibre fires mouseenter and mouseleave per layer, so leaving one is not leaving them all:
 * with catchments and flowpaths both registered, a reach's mouseleave cleared the cursor while
 * the reader was still well inside the catchment, and since flowpaths thread through every
 * catchment the pointer spent most of its time reset to grab. Only one layer is registered
 * today, so this cannot bite -- but the point of clickableLayerIds is that the list can grow.
 *
 * reset repaints. Toggling a layer off re-runs the registration effect, which zeroes the count
 * while the pointer is still sitting where the layer used to be; zeroing alone left the canvas
 * reading 'pointer' over nothing clickable until the reader happened to move the mouse, since
 * deck only rewrites on a pointer event.
 */
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
