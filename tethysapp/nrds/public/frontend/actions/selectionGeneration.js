import { createSequence } from '../lib/sequence.js';

/**
 * Latest-wins ownership of the selection chain (migration unit U3b), ported from the React
 * DataStream selectionGeneration module. Leaving a vpu bumps this sequence so any selection chain
 * still resolving for the old vpu reads as no longer current and stops writing.
 */
const selections = createSequence();

/** Claim the chain for a new selection. Every write in that chain checks the number back. */
export const beginSelection = () => selections.next();

/** Whether the chain that took this number is still the one the user is waiting on. */
export const isCurrentSelection = (generation) => selections.isCurrent(generation);

/** Invalidate whatever chain is in flight without starting one. */
export const cancelSelections = () => selections.next();
