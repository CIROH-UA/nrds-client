/**
 * The pointer cursor over clickable features.
 *
 * This is the logic two rounds of cursor fixes were actually about, and it had no test through
 * either of them -- both times it was diagnosed by reading a canvas in a browser. It lives in
 * lib/mapCursor.js rather than in Mapg.js so it can be exercised without a WebGL context, which
 * jsdom does not provide and which is why no test in this repo mounts the map.
 */
import {
  createPointerCursor,
  CURSOR_CLICKABLE,
  CURSOR_IDLE,
  CURSOR_DRAGGING,
} from 'features/DataStream/lib/mapCursor';

// maplibre hands its listeners the map as e.target; the registration effect has it directly.
const fakeMap = () => {
  const canvas = { style: { cursor: '' } };
  return { getCanvas: () => canvas, canvas };
};
const asEvent = (map) => ({ target: map });

describe('what the cursor should be', () => {
  it('is the grab hand over nothing clickable', () => {
    const cursor = createPointerCursor();

    expect(cursor.cursorFor({ isDragging: false })).toBe(CURSOR_IDLE);
  });

  it('is a pointer inside a clickable layer', () => {
    const cursor = createPointerCursor();

    cursor.enter(asEvent(fakeMap()));

    expect(cursor.cursorFor({ isDragging: false })).toBe(CURSOR_CLICKABLE);
  });

  it('is the closed hand while dragging, clickable or not', () => {
    // Dragging outranks the rest: the reader is panning, not aiming at anything.
    const cursor = createPointerCursor();
    cursor.enter(asEvent(fakeMap()));

    expect(cursor.cursorFor({ isDragging: true })).toBe(CURSOR_DRAGGING);
  });

  it('answers without being asked about dragging at all', () => {
    // deck.gl passes an object; the direct writes pass nothing.
    expect(createPointerCursor().cursorFor()).toBe(CURSOR_IDLE);
  });
});

describe('counting layers rather than flagging one', () => {
  it('stays a pointer when one of two layers is left', () => {
    // The bug a boolean had: flowpaths thread through every catchment, so a reach's mouseleave
    // cleared the cursor while the reader was still well inside the catchment underneath it.
    const cursor = createPointerCursor();
    const map = fakeMap();
    cursor.enter(asEvent(map));
    cursor.enter(asEvent(map));

    cursor.leave(asEvent(map));

    expect(cursor.cursorFor()).toBe(CURSOR_CLICKABLE);
    expect(map.canvas.style.cursor).toBe(CURSOR_CLICKABLE);
  });

  it('lets go once the last layer is left', () => {
    const cursor = createPointerCursor();
    const map = fakeMap();
    cursor.enter(asEvent(map));
    cursor.enter(asEvent(map));

    cursor.leave(asEvent(map));
    cursor.leave(asEvent(map));

    expect(cursor.cursorFor()).toBe(CURSOR_IDLE);
    expect(map.canvas.style.cursor).toBe(CURSOR_IDLE);
  });

  it('does not count below zero', () => {
    // A stray mouseleave with no matching enter would otherwise owe the next enter a click.
    const cursor = createPointerCursor();
    const map = fakeMap();

    cursor.leave(asEvent(map));
    cursor.leave(asEvent(map));
    cursor.enter(asEvent(map));

    expect(cursor.cursorFor()).toBe(CURSOR_CLICKABLE);
  });
});

describe('the canvas and deck.gl cannot disagree', () => {
  it('writes exactly what it would answer', () => {
    // The overlay is interleaved, so deck writes this same canvas from its own getCursor on
    // every pointer update. Writing anything else here means one of the two is wrong until the
    // next mouse move.
    const cursor = createPointerCursor();
    const map = fakeMap();

    cursor.enter(asEvent(map));
    expect(map.canvas.style.cursor).toBe(cursor.cursorFor());

    cursor.leave(asEvent(map));
    expect(map.canvas.style.cursor).toBe(cursor.cursorFor());
  });

  it('repaints when the clickable layers change underneath the pointer', () => {
    // Toggling catchments off re-runs the registration effect while the pointer is still sitting
    // where they were. Zeroing the count alone left the canvas reading 'pointer' over nothing
    // clickable, and deck only rewrites on a pointer event, so it stayed until the reader moved.
    const cursor = createPointerCursor();
    const map = fakeMap();
    cursor.enter(asEvent(map));

    cursor.reset(map);

    expect(cursor.cursorFor()).toBe(CURSOR_IDLE);
    expect(map.canvas.style.cursor).toBe(CURSOR_IDLE);
  });

  it('takes the map directly as well as wrapped in an event', () => {
    // The listeners are handed e.target; the effect has the map itself.
    const cursor = createPointerCursor();
    const map = fakeMap();

    cursor.enter(map);

    expect(map.canvas.style.cursor).toBe(CURSOR_CLICKABLE);
  });

  it('survives a map with no canvas yet', () => {
    // Registration can run before the context exists, and a throw here kills the whole effect.
    const cursor = createPointerCursor();

    expect(() => cursor.enter({ target: {} })).not.toThrow();
    expect(() => cursor.reset(undefined)).not.toThrow();
  });
});
