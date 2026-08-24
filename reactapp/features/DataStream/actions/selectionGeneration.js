import { createSequence } from 'features/DataStream/lib/sequence';

/** Which run of the selection chain is the current one. */
const selections = createSequence();

/** Claim the chain for a new selection. Every write in that chain checks the number back. */
export const beginSelection = () => selections.next();

/** Whether the chain that took this number is still the one the user is waiting on. */
export const isCurrentSelection = (generation) => selections.isCurrent(generation);

/** Invalidate whatever chain is in flight without starting one. */
export const cancelSelections = () => selections.next();
