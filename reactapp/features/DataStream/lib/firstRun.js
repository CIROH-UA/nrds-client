/**
 * Whether this browser has been shown the experimental notice.
 *
 * Once per browser rather than once per session: a disclaimer that reappears on every load is a
 * disclaimer people learn to click through without reading, which is the failure the banner it
 * replaced already had.
 *
 * Every path fails toward showing it. Private windows throw on localStorage rather than
 * returning null, some browsers block it entirely, and a reader who has not seen the notice
 * seeing it twice is a much smaller problem than one who never sees it at all.
 *
 * acknowledgeExperimental answers whether the acknowledgement was actually recorded. Nothing
 * reads it today -- the dialog closes either way and comes back next load, which is the right
 * direction to fail in -- but saying so is what keeps the failure a decision rather than an
 * empty catch block.
 *
 * The key carries a version. If the wording ever changes in a way that changes what is being
 * acknowledged, bump it and everyone is asked again; a cosmetic edit should not.
 */
const KEY = 'nrds.experimental-acknowledged.v1';

export const hasAcknowledgedExperimental = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const acknowledgeExperimental = () => {
  try {
    window.localStorage.setItem(KEY, '1');
    return true;
  } catch {
    return false;
  }
};
