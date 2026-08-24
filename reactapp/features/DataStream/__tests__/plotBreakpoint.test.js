/**
 * The chart used to read window.innerWidth during render to pick its label sizing. That was
 * a layout read on every render and it never updated, so a chart mounted on a narrow window
 * kept narrow labels after the window was widened. It now subscribes to the media query.
 *
 * The hook lives apart from the chart so this can run without the chart's esm-only d3 deps.
 */
import { renderHook, act } from '@testing-library/react';

// No module isolation needed: the hook rebuilds its query list whenever matchMedia changes,
// and isolating would give the module a second copy of React with no active dispatcher.
import { useIsNarrowViewport } from 'features/DataStream/components/forecast/useIsNarrowViewport';

const fakeMatchMedia = (initialMatches) => {
  const listeners = new Set();
  const mql = {
    matches: initialMatches,
    addEventListener: (_type, cb) => listeners.add(cb),
    removeEventListener: (_type, cb) => listeners.delete(cb),
  };
  const setMatches = (next) => {
    mql.matches = next;
    listeners.forEach((cb) => cb({ matches: next }));
  };
  return { matchMedia: jest.fn(() => mql), setMatches, listeners };
};

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('useIsNarrowViewport', () => {
  it('reports the current state of the query', () => {
    const { matchMedia } = fakeMatchMedia(true);
    window.matchMedia = matchMedia;

    const { result } = renderHook(useIsNarrowViewport);

    expect(result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 1300px)');
  });

  it('re-renders when the breakpoint is crossed', () => {
    const { matchMedia, setMatches } = fakeMatchMedia(true);
    window.matchMedia = matchMedia;

    const { result } = renderHook(useIsNarrowViewport);
    expect(result.current).toBe(true);

    act(() => setMatches(false));

    expect(result.current).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const { matchMedia, listeners } = fakeMatchMedia(false);
    window.matchMedia = matchMedia;

    const { unmount } = renderHook(useIsNarrowViewport);
    expect(listeners.size).toBe(1);

    unmount();

    expect(listeners.size).toBe(0);
  });

  it('falls back to a direct width read where matchMedia is unavailable', () => {
    delete window.matchMedia;
    window.innerWidth = 800;

    const { result } = renderHook(useIsNarrowViewport);

    expect(result.current).toBe(true);
  });
});
