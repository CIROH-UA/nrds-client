import { createMediaQuery, useMediaQuery } from 'features/DataStream/lib/matchMedia';

/** Whether the viewport is at or below the chart's single label-sizing breakpoint. */
const NARROW_QUERY = '(max-width: 1300px)';
const NARROW_MAX_PX = 1300;

const narrow = createMediaQuery(NARROW_QUERY, () => window.innerWidth <= NARROW_MAX_PX);

export const useIsNarrowViewport = () => useMediaQuery(narrow);

export default useIsNarrowViewport;
