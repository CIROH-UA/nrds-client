/** Whether this browser has been shown the experimental notice. */
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
