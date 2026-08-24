/** The height the collapsed sheet keeps on screen when nothing has been measured yet. */
export const PEEK_FALLBACK_PX = 88;

/** How much of the sheet stays on screen when it is minimised. */
export const peekFor = ({ rowHeight, paddingTop, sheetHeight }) => {
  const wanted = Math.ceil(rowHeight + paddingTop + 8);
  const floor = Math.min(PEEK_FALLBACK_PX, sheetHeight);
  return Math.max(floor, Math.min(wanted, sheetHeight));
};

/** How much of the map the sheet is covering, from the state rather than a live transform. */
export const coverFor = ({ state, sheetHeight, peek }) => {
  if (state === 'expanded') return Math.max(0, sheetHeight);
  if (state === 'collapsed') return Math.max(0, Math.min(peek, sheetHeight));
  return 0;
};
