import { createMediaQuery, useMediaQuery } from 'features/DataStream/lib/matchMedia';

/** Where the feature panel stops being a side panel and becomes a bottom sheet. */
export const SHEET_MAX_PX = 768;

const sheetLayout = createMediaQuery(`(max-width: ${SHEET_MAX_PX}px)`, () => window.innerWidth <= SHEET_MAX_PX);

/** Whether the panel is currently a bottom sheet. */
export const useIsSheetLayout = () => useMediaQuery(sheetLayout);

/** How many pixels of the map the sheet covers, measured from the sheet itself. */
export const sheetCoverPx = () => {
  if (window.innerWidth > SHEET_MAX_PX) return 0;
  const sheet = document.querySelector('aside[aria-label="Selected feature"]');
  return sheet ? Math.round(sheet.getBoundingClientRect().height) : 0;
};
