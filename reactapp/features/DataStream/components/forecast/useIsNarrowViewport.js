import { createMediaQuery, useMediaQuery } from 'features/DataStream/lib/matchMedia';

/**
 * Whether the viewport is at or below the chart's single label-sizing breakpoint.
 *
 * The chart used to read window.innerWidth during render, which was a layout read on every
 * render and was not reactive either: a chart mounted on a narrow window kept narrow labels
 * for the rest of the session. Subscribing to the media query instead means a re-render only
 * when the breakpoint is actually crossed, rather than on every pixel of a drag.
 *
 * useSyncExternalStore is React's supported way to read an external source like this, so no
 * effect is involved. It lives in its own module so it can be tested without pulling in the
 * chart's d3 and visx dependencies.
 */
const NARROW_QUERY = '(max-width: 1300px)';
const NARROW_MAX_PX = 1300;

const narrow = createMediaQuery(NARROW_QUERY, () => window.innerWidth <= NARROW_MAX_PX);

export const useIsNarrowViewport = () => useMediaQuery(narrow);

export default useIsNarrowViewport;
