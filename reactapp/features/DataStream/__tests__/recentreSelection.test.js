/**
 * Getting back to the selected catchment.
 *
 * Selecting one flies the map to it, but nothing brought the reader back: zoom out to look at
 * the wider network and the highlighted catchment is a few pixels somewhere, with the chart
 * beside it still describing it.
 *
 * The coordinate lookup is the testable part and the part that was wrong twice. The button that
 * calls it is in Mapg, which no test here mounts -- constructing a maplibregl.Map asks the canvas
 * for a WebGL context jsdom does not provide.
 */
import { selectionLngLat } from 'features/DataStream/lib/layers';

describe('selectionLngLat', () => {
  it('reads the spelling a map click produces', () => {
    // selectMapFeature flattens the centroid into latitude/longitude.
    expect(selectionLngLat({ latitude: 40.1, longitude: -111.9 })).toEqual([-111.9, 40.1]);
  });

  it('reads the spelling the hydrofabric index produces', () => {
    // The search box gets lat/lon from the index row instead.
    expect(selectionLngLat({ lat: 40.1, lon: -111.9 })).toEqual([-111.9, 40.1]);
  });

  it('prefers the short spelling when a feature somehow carries both', () => {
    expect(selectionLngLat({ lat: 1, lon: 2, latitude: 9, longitude: 9 })).toEqual([2, 1]);
  });

  it('keeps a real zero rather than falling through to the other spelling', () => {
    // ?? not ||. A catchment on the equator or the prime meridian is a real place, and || would
    // read its coordinate as missing and reach for a field that is not there.
    expect(selectionLngLat({ lat: 0, lon: 0 })).toEqual([0, 0]);
    expect(selectionLngLat({ latitude: 0, longitude: -75 })).toEqual([-75, 0]);
  });

  it('returns null for a feature it cannot place', () => {
    // Not a pair of undefineds: flying to those lands the map at 0,0 in the Gulf of Guinea, with
    // nothing on screen to explain why. The caller renders no button instead.
    expect(selectionLngLat({})).toBeNull();
    expect(selectionLngLat(null)).toBeNull();
    expect(selectionLngLat(undefined)).toBeNull();
    expect(selectionLngLat({ lat: 40 })).toBeNull();
    expect(selectionLngLat({ lat: 'forty', lon: -111 })).toBeNull();
    expect(selectionLngLat({ lat: NaN, lon: -111 })).toBeNull();
  });
});

describe('the control that uses it', () => {
  const fs = require('fs');
  const path = require('path');
  const mapg = fs.readFileSync(path.join(__dirname, '../components/map/Mapg.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../components/styles/Styles.js'), 'utf8');

  it('only appears when there is somewhere to go back to', () => {
    expect(mapg).toMatch(/\{selectionAt && \(\s*<RecentreButton/);
  });

  it('carries a name, since it is an icon on a small screen', () => {
    expect(mapg).toMatch(/aria-label="Show the selected catchment"/);
  });

  it('returns at a zoom where the catchment is actually drawn', () => {
    // The fill only reaches full opacity at 11. Recentering at whatever zoom the reader drifted
    // to would put them over a highlight they still could not see.
    expect(mapg).toMatch(/const SELECTION_ZOOM = 11;/);
    expect(mapg).toMatch(/zoom: SELECTION_ZOOM/);
  });

  it('is built on the shared surface at control elevation, like the slider', () => {
    const i = styles.indexOf('export const RecentreButton');
    const decl = styles.slice(i, styles.indexOf('\n`;', i));
    expect(decl).toMatch(/styled\(MapSurface\)/);
    expect(decl).toMatch(/\$control:\s*true/);
  });

  it('does not collide with the other overlays', () => {
    // Bottom left is the only free corner: layers top right, legend bottom right, slider and
    // hint bottom centre.
    const i = styles.indexOf('export const RecentreButton');
    const decl = styles.slice(i, styles.indexOf('\n`;', i));
    expect(decl).toMatch(/left: 10px;/);
    expect(decl).not.toMatch(/right:/);
  });

  it('flies rather than jumps, and cannot be cut off by reduced motion', () => {
    // essential:true keeps the move when the reader has prefers-reduced-motion set, which would
    // otherwise leave them wherever they were with no feedback at all.
    expect(mapg).toMatch(/flyTo\(\{ center: selectionAt, zoom: SELECTION_ZOOM, essential: true \}\)/);
  });
});
