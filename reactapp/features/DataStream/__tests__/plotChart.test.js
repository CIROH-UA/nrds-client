/**
 * The chart was previously impossible to test at all: d3 and its dependencies publish
 * untranspiled esm that this jest setup would not transform, so importing Plot threw a syntax
 * error from node_modules before any assertion ran.
 *
 * These are deliberately shallow -- an svg line chart's real output is geometry, and asserting
 * path coordinates would break on every legitimate styling change. What is worth pinning is
 * that it renders at all for a normal series, and that it says so rather than throwing when
 * there is nothing to draw.
 */
import { render, screen } from '@testing-library/react';

import LineChart from 'features/DataStream/components/forecast/Plot';

/* eslint-disable testing-library/no-container, testing-library/no-node-access --
   an svg chart exposes no roles or text for its geometry; the path element is the assertion. */

// Same shape TimeseriesCard builds: one entry per series, each holding its own points.
const series = [
  {
    label: 'flow',
    data: [
      { x: new Date('2022-08-01T00:00:00Z'), y: 1.5 },
      { x: new Date('2022-08-01T01:00:00Z'), y: 2.5 },
      { x: new Date('2022-08-01T02:00:00Z'), y: 0.5 },
    ],
  },
];
const empty = [{ label: 'flow', data: [] }];
const layout = { yaxis: 'flow', xaxis: '', title: 'wb-404' };

describe('LineChart', () => {
  it('draws a series', () => {
    const { container } = render(
      <LineChart width={800} height={400} data={series} layout={layout} />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    // One path per series, with real coordinates rather than an empty d attribute.
    const paths = [...container.querySelectorAll('path')].filter((p) => p.getAttribute('d'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].getAttribute('d')).toMatch(/^M[\d.]/);
  });

  it('labels the y axis with the variable and its units', () => {
    render(<LineChart width={800} height={400} data={series} layout={layout} />);

    expect(screen.getByText(/flow/i)).toBeInTheDocument();
  });

  it('tells you what to do rather than only that there is nothing', () => {
    render(<LineChart width={800} height={400} data={empty} layout={layout} />);

    // It used to say "No data to display": the chart's problem, not the reader's next move.
    expect(screen.getByText(/select a catchment/i)).toBeInTheDocument();
  });

  it('survives a zero-width container', () => {
    // The chart mounts before measurement, so this is the first render every time.
    expect(() =>
      render(<LineChart width={0} height={0} data={series} layout={layout} />)
    ).not.toThrow();
  });
});

/**
 * Every tick on the time axis says something different.
 *
 * The format used to be chosen from the forecast's name -- %H:%M for short range, %m/%d for
 * anything longer -- which says nothing about where the ticks actually land. A medium-range
 * chart spanning under two days put two ticks on the same calendar day and drew both of them as
 * "08/31". An axis with two identical labels is an axis with none.
 */
describe('distinctTickFormat', () => {
  const { timeFormat } = require('d3-time-format');
  const { distinctTickFormat } = require('features/DataStream/lib/utils');

  // Local, not UTC: d3's timeFormat renders in local time, so ticks built in UTC would land on
  // a different calendar day for any reader west of Greenwich and make this test's answer
  // depend on the machine running it.
  const at = (...args) => new Date(...args);
  const labels = (ticks, fmt) => ticks.map((t) => timeFormat(fmt)(t));

  it('separates two ticks that fall on the same day', () => {
    // The reported case: a medium-range chart, two ticks, one date.
    const ticks = [at(2026, 7, 31, 0), at(2026, 7, 31, 12), at(2026, 8, 1, 0)];

    const fmt = distinctTickFormat(ticks, timeFormat);

    expect(new Set(labels(ticks, fmt)).size).toBe(3);
  });

  it('stays coarse when the dates already differ', () => {
    // A ten-day chart should not be labelled to the minute to solve a problem it does not have.
    const ticks = [at(2026, 7, 29), at(2026, 7, 31), at(2026, 8, 2)];

    expect(distinctTickFormat(ticks, timeFormat)).toBe('%m/%d');
  });

  it('drops the date when every tick is on one day', () => {
    // Short range. Repeating 08/31 on all four ticks is noise, not a label.
    const ticks = [at(2026, 7, 31, 0), at(2026, 7, 31, 6), at(2026, 7, 31, 12)];

    expect(distinctTickFormat(ticks, timeFormat)).toBe('%H:%M');
  });

  it('goes to seconds only when minutes collide', () => {
    const ticks = [at(2026, 7, 31, 9, 0, 0), at(2026, 7, 31, 9, 0, 30)];

    expect(distinctTickFormat(ticks, timeFormat)).toBe('%H:%M:%S');
  });

  it('has nothing to decide with fewer than two ticks', () => {
    expect(distinctTickFormat([], timeFormat)).toBe('%m/%d');
    expect(distinctTickFormat([at(2026, 7, 31)], timeFormat)).toBe('%m/%d');
    expect(distinctTickFormat(undefined, timeFormat)).toBe('%m/%d');
  });

  it('ignores values that are not times', () => {
    expect(distinctTickFormat([null, undefined, NaN], timeFormat)).toBe('%m/%d');
  });
});

/**
 * The hydrograph has a value axis.
 *
 * It had a time axis and no other. The left margin already reserved 50px for one and
 * leftTickLabelProps was already written and passed into the chart, which never destructured it
 * -- so the props were handed over and dropped, and the reader got a shape with no numbers on
 * the only chart in the app.
 */
describe('the value axis', () => {
  const { formatAxisValue } = require('features/DataStream/components/forecast/Plot');

  it('keeps thousands short enough for the margin', () => {
    // Discharge on a main stem runs to thousands; "2911.00" does not fit in 50px.
    expect(formatAxisValue(2911)).toBe('3k');
    expect(formatAxisValue(12500)).toBe('13k');
  });

  it('drops decimals once they stop meaning anything', () => {
    expect(formatAxisValue(48)).toBe('48');
    expect(formatAxisValue(10)).toBe('10');
  });

  it('keeps them where the whole range is small', () => {
    // A headwater reach runs well under 1 m3/s, where rounding to integers is all zeroes.
    expect(formatAxisValue(4.27)).toBe('4.3');
    expect(formatAxisValue(0.0413)).toBe('0.04');
  });

  it('says nothing for a value it cannot read', () => {
    expect(formatAxisValue(null)).toBe('');
    expect(formatAxisValue(undefined)).toBe('');
    expect(formatAxisValue(NaN)).toBe('');
  });

  it('handles negatives, which a bias or an anomaly variable can produce', () => {
    expect(formatAxisValue(-48)).toBe('-48');
    expect(formatAxisValue(-0.5)).toBe('-0.50');
  });
});
