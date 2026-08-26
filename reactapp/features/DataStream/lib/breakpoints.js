import { createMediaQuery, useMediaQuery } from 'features/DataStream/lib/matchMedia';
import { coverFor, PEEK_FALLBACK_PX } from 'features/DataStream/lib/sheetGeometry';

/** Where the feature panel stops being a side panel and becomes a bottom sheet. */
export const SHEET_MAX_PX = 768;

const sheetLayout = createMediaQuery(`(max-width: ${SHEET_MAX_PX}px)`, () => window.innerWidth <= SHEET_MAX_PX);

/** Whether the panel is currently a bottom sheet. */
export const useIsSheetLayout = () => useMediaQuery(sheetLayout);

/** Where the header row runs out of width for the search box's full prompt. */
export const NARROW_HEADER_PX = 460;

const narrowHeader = createMediaQuery(
  `(max-width: ${NARROW_HEADER_PX}px)`,
  () => window.innerWidth <= NARROW_HEADER_PX
);

/** Whether the header is too narrow to spell the search prompt out. */
export const useIsNarrowHeader = () => useMediaQuery(narrowHeader);

/** How many pixels of the map the sheet covers, or is about to once a pending selection opens it. */
export const sheetCoverPx = ({ assumeOpen = false } = {}) => {
  if (window.innerWidth > SHEET_MAX_PX) return 0;
  const sheet = document.querySelector('aside[aria-label="Selected feature"]');
  if (!sheet) return 0;
  const peek = parseFloat(getComputedStyle(document.body).getPropertyValue('--sheet-peek'));
  const state = document.body.dataset.sheet;
  return coverFor({
    state: assumeOpen === true && state !== 'collapsed' ? 'expanded' : state,
    sheetHeight: sheet.offsetHeight,
    peek: Number.isFinite(peek) ? peek : PEEK_FALLBACK_PX,
  });
};
