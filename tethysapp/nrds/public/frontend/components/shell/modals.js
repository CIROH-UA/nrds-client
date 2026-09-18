/**
 * The two dialogs of the build-less NRDS client shell (migration unit U6), ported from the React
 * `DataStream/components/Modals`: the general-info dialog (opened from the navbar's info control)
 * and the experimental-notice gate (shown once, before anything else, and acknowledged rather than
 * dismissed). Both are built on the accessible `createModal` helper. The first-run acknowledgement
 * is remembered in localStorage under the same key the React `firstRun` lib used.
 */
import { createModal } from './modal.js';
import { generalInfoContent, experimentalCaveat } from './info-content.js';

const ACK_KEY = 'nrds.experimental-acknowledged.v1';

/** Whether this browser has already acknowledged the experimental notice. */
export function hasAcknowledgedExperimental() {
  try {
    return window.localStorage.getItem(ACK_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record that the experimental notice has been acknowledged; storage failures are swallowed. */
export function acknowledgeExperimental() {
  try {
    window.localStorage.setItem(ACK_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** The general-info dialog. Returns the modal handle; the caller appends `element` and calls open. */
export function createGeneralInfoModal() {
  return createModal({
    titleText: 'NextGen Research DataStream - NRDS powered by NGIAB',
    body: generalInfoContent(),
    size: 'lg',
  });
}

/**
 * The experimental-notice gate: a non-dismissible dialog whose single "I understand" control
 * acknowledges the notice and closes it. `onAcknowledge` is called after the acknowledgement is
 * recorded. Returns the modal handle.
 */
export function createExperimentalNoticeModal({ onAcknowledge } = {}) {
  const footer = document.createElement('div');
  footer.className = 'nrds-modal__actions';

  const acknowledge = document.createElement('button');
  acknowledge.type = 'button';
  acknowledge.className = 'nrds-modal__action';
  acknowledge.textContent = 'I understand';
  footer.append(acknowledge);

  const modal = createModal({
    titleText: 'Before you start',
    body: experimentalCaveat(),
    footer,
    dismissible: false,
  });

  acknowledge.addEventListener('click', () => {
    acknowledgeExperimental();
    modal.close();
    if (typeof onAcknowledge === 'function') onAcknowledge();
  });

  return modal;
}
