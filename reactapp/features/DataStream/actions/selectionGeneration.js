import { createSequence } from 'features/DataStream/lib/sequence';

/**
 * Which run of the selection chain is the current one.
 *
 * Changing a control in the data menu starts a chain of dependent S3 listings: a new model needs
 * new dates, which need new forecasts, then cycles, then ensembles, then output files. Each step
 * waits on the one before it, and each writes its answer into the stores as it arrives.
 *
 * Nothing used to say which chain a given answer belonged to. Two overlapping chains both wrote,
 * in whatever order their requests happened to come back, so a slow earlier answer could land on
 * top of a fast later one: the model control showing what was clicked last, because that write is
 * synchronous, and every control under it describing the model clicked before. Switching model
 * became a great deal easier to overlap when the date list started probing for readable output --
 * one round trip became as many as twelve -- but the shape was always racy.
 *
 * So each chain takes a number on the way in and checks it before every write. A superseded chain
 * finishes its requests and throws the answers away, which costs nothing worth reclaiming and
 * keeps the rule to one line at each write site.
 *
 * This mirrors `vpuGeneration` in actions/loadState.js, which does the same for the vpu load, and
 * is deliberately separate from it: a vpu change invalidates both, but a model change has no
 * business cancelling a running vpu load.
 */
const selections = createSequence();

/** Claim the chain for a new selection. Every write in that chain checks the number back. */
export const beginSelection = () => selections.next();

/** Whether the chain that took this number is still the one the user is waiting on. */
export const isCurrentSelection = (generation) => selections.isCurrent(generation);

/**
 * Invalidate whatever chain is in flight without starting one.
 *
 * For leaving a vpu: the listings a chain is midway through are all for the vpu being left, and
 * its output-file answer would otherwise arrive after the move and describe the wrong place.
 */
export const cancelSelections = () => selections.next();
