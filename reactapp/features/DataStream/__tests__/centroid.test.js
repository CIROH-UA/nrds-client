/**
 * A catchment click flew the map to 0,0 in the Gulf of Guinea. getCentroid handled Point and
 * Polygon only, so a MultiPolygon catchment produced {lon: null, lat: null}, and the flyTo that
 * consumed it turned nulls into a centre on null island.
 */
import { getCentroid } from 'features/DataStream/lib/layers';

const feature = (type, coordinates) => ({ geometry: { type, coordinates } });

// A square from (0,0) to (2,2) has its centre at (1,1) whichever way it is described.
const RING = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];

describe('getCentroid', () => {
  it('reads a point straight off', () => {
    expect(getCentroid(feature('Point', [-96.5, 40.25]))).toEqual({ lon: -96.5, lat: 40.25 });
  });

  it('averages a polygon outer ring', () => {
    const { lon, lat } = getCentroid(feature('Polygon', [RING]));
    expect(lon).toBeCloseTo(0.8, 5);
    expect(lat).toBeCloseTo(0.8, 5);
  });

  it('places a multipolygon instead of giving up on it', () => {
    const shifted = RING.map(([x, y]) => [x + 10, y + 10]);
    const { lon, lat } = getCentroid(feature('MultiPolygon', [[RING], [shifted]]));

    // Both parts contribute; the answer is somewhere between them, and it is a real place.
    expect(Number.isFinite(lon)).toBe(true);
    expect(Number.isFinite(lat)).toBe(true);
    expect(lon).toBeCloseTo(5.8, 5);
    expect(lat).toBeCloseTo(5.8, 5);
  });

  it('ignores polygon holes when centring', () => {
    const hole = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]];
    expect(getCentroid(feature('Polygon', [RING, hole])))
      .toEqual(getCentroid(feature('Polygon', [RING])));
  });

  it('handles the line geometries too', () => {
    expect(getCentroid(feature('LineString', [[0, 0], [4, 4]]))).toEqual({ lon: 2, lat: 2 });
    expect(getCentroid(feature('MultiLineString', [[[0, 0], [2, 2]], [[2, 2], [4, 4]]])))
      .toEqual({ lon: 2, lat: 2 });
    expect(getCentroid(feature('MultiPoint', [[0, 0], [2, 2]]))).toEqual({ lon: 1, lat: 1 });
  });

  it.each([
    ['no geometry', undefined],
    ['an unknown type', { type: 'GeometryCollection', coordinates: [] }],
    ['empty coordinates', { type: 'Polygon', coordinates: [] }],
    ['coordinates that are not positions', { type: 'Polygon', coordinates: [[[null, null]]] }],
  ])('returns nulls rather than a wrong place for %s', (_name, geometry) => {
    // Nulls are what the caller guards on; a plausible-looking 0,0 is what it must never get.
    expect(getCentroid({ geometry })).toEqual({ lon: null, lat: null });
  });

  it('keeps a real zero coordinate', () => {
    expect(getCentroid(feature('Point', [0, 0]))).toEqual({ lon: 0, lat: 0 });
  });
});
