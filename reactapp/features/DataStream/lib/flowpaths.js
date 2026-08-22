/**
 * What the static flowpaths layer and the animated overlay have to agree about.
 *
 * The two draw the same network in different systems -- maplibre paints the reaches from a style
 * spec, deck.gl draws the animated ones from a PathLayer -- so anything both of them encode has
 * to live in one place or drift. Two things do: how wide a reach is at a given zoom, and whether
 * the animation is on the map at all.
 *
 * Kept out of lib/layers.js deliberately. That file has become several modules wearing one name
 * -- layer config, geometry maths, animation maths, path bookkeeping and a library of SVG legend
 * icons -- and adding rendering geometry beside the icon glyphs is what keeps it that way.
 */

/**
 * The zoom curve the flowpaths are drawn on.
 *
 * Published as data because two layers follow it and they are specified in different systems:
 * maplibre interpolates these stops itself for the static line, and the animated deck.gl layer
 * has to work the same value out in JS. Copying three numbers into the second file is exactly
 * how the two would come to disagree.
 *
 * The ramp stays modest at low zoom on purpose: every reach across CONUS at once is a lot of
 * ink, and colour is what should carry the value there.
 */
export const FLOWPATHS_WIDTH_STOPS = Object.freeze(
  [[2, 0.6], [7, 1], [10, 2]].map((pair) => Object.freeze(pair))
);

/**
 * The width a stop curve gives at one zoom, matching how maplibre reads the same array.
 *
 * Linear between neighbouring stops, which is maplibre's legacy zoom function with its default
 * base of 1, and clamped outside the range rather than extrapolated -- extrapolating below the
 * first stop heads towards zero and then negative. An unreadable zoom answers the first stop
 * rather than NaN, because a NaN width draws nothing at all and does it silently.
 */
export const widthAtZoom = (zoom, stops = FLOWPATHS_WIDTH_STOPS) => {
  if (!Number.isFinite(zoom)) return stops[0][1];
  if (zoom <= stops[0][0]) return stops[0][1];

  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];

  const i = stops.findIndex(([z]) => z > zoom);
  const [z0, w0] = stops[i - 1];
  const [z1, w1] = stops[i];
  return w0 + ((zoom - z0) / (z1 - z0)) * (w1 - w0);
};

/**
 * Whether the animation is on the map.
 *
 * Two things ask, and they had already drifted apart once. The slider docks on this, and keying
 * it on the vpu instead left a transport control sitting over a dead clock after the panel's
 * close button -- that calls resetVPU, which empties the animation arrays while the selected vpu
 * stays exactly where it was. Playback stops on the same question, and hiding the flowpaths layer
 * took the animation off the map without stopping it, so it silently resumed when the layer came
 * back. One rule, so the next way of emptying the clock cannot answer them differently.
 */
export const animationIsOnMap = ({ times, flowpathsVisible }) =>
  Boolean(flowpathsVisible) && (times?.length ?? 0) > 0;

/**
 * The zoom rounded to the step the animated width is actually redrawn at.
 *
 * maplibre fires 'zoom' continuously through a gesture, and the animated layer subscribes to it
 * so its widths keep pace with the static ones. Rendering every one of those events rebuilds the
 * deck.gl layer per frame of a pinch, for a width that has barely moved: the steepest part of
 * the curve climbs a third of a pixel per zoom level, so an eighth of a level is four hundredths
 * of a pixel. Quarter steps keep the divergence from the static line below that and cut a full
 * pinch from hundreds of renders to a couple of dozen.
 */
export const QUANTISED_ZOOM_STEP = 0.25;

export const quantiseZoom = (zoom) => {
  if (!Number.isFinite(zoom)) return 0;
  return Math.round(zoom / QUANTISED_ZOOM_STEP) * QUANTISED_ZOOM_STEP;
};
