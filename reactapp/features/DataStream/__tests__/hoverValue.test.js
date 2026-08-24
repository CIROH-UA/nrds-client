/**
 * The animated variable's value for whatever is under the pointer.
 *
 * Read from the stores at render time rather than stored on the hovered feature: that object is
 * written once on mousemove, so a value kept there would freeze at whichever step the pointer
 * stopped on and only catch up when the mouse moved. Following the time index means the number
 * tracks playback, and tracks the slider when playback is paused, through the same code.
 */
import { render, screen, act } from '@testing-library/react';

import { HoverValue } from 'features/DataStream/components/map/HoverValue';
import useTimeSeriesStore from 'features/DataStream/store/Timeseries';
import { useVPUStore } from 'features/DataStream/store/VPU';

const initial = { ts: useTimeSeriesStore.getState(), vpu: useVPUStore.getState() };

// Two reaches, three time steps each, laid out as the flat array the vpu store holds:
// [reach0 t0, reach0 t1, reach0 t2, reach1 t0, ...]
const TIMES = ['2026-08-19T00:00:00Z', '2026-08-19T01:00:00Z', '2026-08-19T02:00:00Z'];
const FLOW = Float32Array.from([1.5, 12.4, 130, 0.004, -9999, 2900]);

const load = () => {
  useVPUStore.getState().setAnimationIndex(['2884494', '2863415'], TIMES);
  useVPUStore.getState().setVarData('flow', FLOW);
  useTimeSeriesStore.setState({ variable: 'flow', currentTimeIndex: 0 });
};

beforeEach(() => {
  useTimeSeriesStore.setState(initial.ts, true);
  useVPUStore.setState(initial.vpu, true);
});

const row = () => screen.queryByText(/flow/i)?.closest('.popup-row');

describe('the value row', () => {
  test('reports the reach under the pointer at the current step', () => {
    load();
    render(<HoverValue hoverId={2884494} />);

    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(row()).toHaveTextContent('flow (m³/s)');
  });

  test('names the step, so the number is not read as the forecast', () => {
    load();
    useTimeSeriesStore.setState({ currentTimeIndex: 2 });
    render(<HoverValue hoverId={2884494} />);

    expect(row()).toHaveTextContent('T+2h');
    expect(screen.getByText('130')).toBeInTheDocument();
  });

  test('follows the time index without the pointer moving', () => {
    load();
    render(<HoverValue hoverId={2884494} />);
    expect(screen.getByText('1.5')).toBeInTheDocument();

    // What playback does: advance the index, leave the hover alone.
    act(() => { useTimeSeriesStore.setState({ currentTimeIndex: 1 }); });

    expect(screen.getByText('12.4')).toBeInTheDocument();
    expect(screen.queryByText('1.5')).toBeNull();
  });

  test('a catchment id is reduced to its number before lookup', () => {
    // buildFeatureIdToIndex registers 2884494 and wb-2884494, never cat-2884494.
    load();
    render(<HoverValue hoverId="cat-2884494" />);

    expect(screen.getByText('1.5')).toBeInTheDocument();
  });

  test('says so rather than printing the missing-value sentinel', () => {
    load();
    useTimeSeriesStore.setState({ currentTimeIndex: 1 });
    render(<HoverValue hoverId={2863415} />);

    expect(screen.getByText('no data')).toBeInTheDocument();
    expect(screen.queryByText(/-9999/)).toBeNull();
  });

  test('shows nothing for a feature outside the loaded vpu', () => {
    // The flowpath layer draws the whole country; one vpu has values.
    load();
    const { container } = render(<HoverValue hoverId={999999} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('shows nothing before any vpu is loaded', () => {
    const { container } = render(<HoverValue hoverId={2884494} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows nothing with no feature hovered', () => {
    load();
    const { container } = render(<HoverValue hoverId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('scales the precision to the magnitude', () => {
    load();
    useTimeSeriesStore.setState({ currentTimeIndex: 0 });
    const small = render(<HoverValue hoverId={2863415} />);
    expect(screen.getByText('4.0e-3')).toBeInTheDocument();
    small.unmount();

    useTimeSeriesStore.setState({ currentTimeIndex: 2 });
    render(<HoverValue hoverId={2863415} />);
    expect(screen.getByText('2,900')).toBeInTheDocument();
  });
});

describe('the properties listed under it', () => {
  const { formatPropertyValue } = require('features/DataStream/lib/utils');

  test('rounds the raw doubles the tiles carry', () => {
    // What a hover popup was showing verbatim.
    expect(formatPropertyValue(36.32444856899953)).toBe('36.3');
    // One decimal from 1 up to 100, the same rule the colour key's ticks use.
    expect(formatPropertyValue(6.505186539271161)).toBe('6.5');
    expect(formatPropertyValue(57.1009503239)).toBe('57.1');
  });

  test('leaves ids and names alone', () => {
    expect(formatPropertyValue('cat-2855298')).toBe('cat-2855298');
    expect(formatPropertyValue('network')).toBe('network');
  });

  test('reads booleans as words', () => {
    expect(formatPropertyValue(true)).toBe('Yes');
    expect(formatPropertyValue(false)).toBe('No');
  });

  test('keeps large counts legible', () => {
    expect(formatPropertyValue(1000009947)).toBe('1,000,009,947');
  });
});
