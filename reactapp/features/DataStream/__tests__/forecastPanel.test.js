/**
 * The feature panel says what you are looking at, then how to change it.
 *
 * It was one stack: a chart, five selects and a button, all weighted the same, so the reading
 * and the query that produced it read as one list of nine things. A reader separates those two
 * anyway; the layout was not doing it for them.
 */
import fs from 'fs';
import path from 'path';

import { render, screen } from '@testing-library/react';

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const dataMenu = read('../components/forecast/dataMenu.js');
const plot = read('../components/forecast/Plot.js');
const styles = read('../components/styles/Styles.js');

describe('the run controls', () => {
  it('sit under a heading that names them', () => {
    expect(dataMenu).toMatch(/<PanelSectionHeading>Change the run<\/PanelSectionHeading>/);
  });

  it('use a heading level below the panel title, not a box', () => {
    // The panel title is an h2. A card inside a panel is the nesting this palette cannot rescue,
    // so the separation is a heading.
    const i = styles.indexOf('export const PanelSectionHeading');
    const decl = styles.slice(i, styles.indexOf('\n`;', i));
    expect(styles.slice(i, i + 120)).toMatch(/styled\.h3/);
    expect(decl).not.toMatch(/border:|box-shadow:|background/);
  });

  it('carry no decorative icons', () => {
    // Five labels, five unrelated metaphors -- a box, a calendar, a tag, a refresh arrow and a
    // page -- none of which say more than the one word beside them.
    ['ModelIcon', 'DateIcon', 'ForecastIcon', 'CycleIcon', 'EnsembleIcon'].forEach((icon) => {
      expect(dataMenu).not.toContain(`<${icon}`);
    });
  });

  it('leaves none on the variable label either', () => {
    // With the other five gone this was the only icon left on a field label, which is worse
    // than five: one decorated row among plain ones reads as a mistake.
    const variables = read('../components/forecast/variablesMenu.js');
    expect(variables).not.toContain('<VariableIcon');
  });

  it('keeps the icon that carries meaning', () => {
    // The one in the "no output file" notice is doing a job: it marks a state, not a label.
    expect(dataMenu).toMatch(/<FileIcon aria-hidden/);
  });

  it('still labels every control for a screen reader', () => {
    const fors = [...dataMenu.matchAll(/htmlFor=\{`select-\$\{r\.key\}`\}/g)];
    expect(fors.length).toBeGreaterThan(0);
    expect(dataMenu).toMatch(/inputId=\{`select-\$\{r\.key\}`\}/);
  });
});

describe('the chart tooltip', () => {
  it('is pinned to the top of the plot area', () => {
    // It used to sit at the data point, which put it over the time axis whenever the reader
    // scrubbed across a low flow -- and on a hydrograph the recession is most of the chart.
    expect(plot).toMatch(/tooltipTop: margin\.top/);
  });

  it('does not follow the value, so it stops jumping as you scrub', () => {
    expect(plot).not.toMatch(/const top = Math\.min\(\.\.\.yPositions\)/);
  });
});

describe('the panel still works', () => {
  const ForecastMenu = require('features/DataStream/components/menus/ForecastMenu').default;
  const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;

  beforeEach(() => useTimeSeriesStore.setState({ feature_id: 'cat-7' }));

  it('opens for a selected feature and offers the run controls', () => {
    render(<ForecastMenu />);

    expect(screen.getByRole('heading', { name: /change the run/i })).toBeInTheDocument();
  });
});

/**
 * The panel is grouped by when a change takes effect.
 *
 * Variable applies the moment it is picked: variablesMenu loads the series and sets the layer's
 * variable itself. The run selectors do nothing until Update. Those are two different kinds of
 * control and the panel had them in one run, with Variable last -- below the Update button, so
 * it read as an afterthought to the query rather than a property of the reading.
 */
describe('the order of the panel', () => {
  const ForecastMenu = require('features/DataStream/components/menus/ForecastMenu').default;
  const useTimeSeriesStore = require('features/DataStream/store/Timeseries').default;

  const useDataStreamStore = require('features/DataStream/store/Datastream').default;

  beforeEach(() => {
    useTimeSeriesStore.setState({ feature_id: 'cat-7', variable: 'flow' });
    // The variable row renders only once a run has told us what variables it has.
    useDataStreamStore.setState({ variables: ['flow', 'velocity'] });
  });

  const positionOf = (container, text) => {
    const all = [...container.querySelectorAll('*')];
    return all.findIndex((el) => el.children.length === 0 && new RegExp(text, 'i').test(el.textContent));
  };

  it('puts the variable before the run controls', () => {
    const { container } = render(<ForecastMenu />);

    const variable = positionOf(container, '^Variable$');
    const heading = positionOf(container, '^Change the run$');

    expect(variable).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(-1);
    expect(variable).toBeLessThan(heading);
  });

  it('puts the variable before Update, not after it', () => {
    const { container } = render(<ForecastMenu />);

    const variable = positionOf(container, '^Variable$');
    const update = positionOf(container, '^Update$');

    expect(update).toBeGreaterThan(-1);
    expect(variable).toBeLessThan(update);
  });

  it('keeps the variable in the same block as the chart it changes', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../components/menus/ForecastMenu.js'), 'utf8'
    );
    const firstBlock = src.slice(src.indexOf('<Content>'), src.indexOf('</Content>'));

    expect(firstBlock).toContain('<TimeSeriesCard />');
    expect(firstBlock).toContain('<VariablesMenu />');
    expect(firstBlock).not.toContain('<DataMenu />');
  });
});

/**
 * The heading names the catchment; the caption says which run.
 *
 * They used to be one string -- "Cat 2863225 Short Range Forecast" -- which wrapped to two lines
 * in a 400px panel and repeated what the Forecast select said two blocks below. They are facts
 * of different kinds: one names the thing and does not change while the panel is open, the other
 * is a property of it that the controls can change.
 */
describe('the panel heading', () => {
  const { ForecastHeader } = require('features/DataStream/components/forecast/ForecastHeader');
  const { makeFeatureTitle, makeRunLabel } = require('features/DataStream/lib/utils');

  it('names the catchment alone', () => {
    expect(makeFeatureTitle('cat-2863225')).toBe('Cat 2863225');
  });

  it('names the run separately', () => {
    expect(makeRunLabel('short_range')).toBe('Short Range Forecast');
    expect(makeRunLabel('analysis_assim')).toBe('Analysis Assim Forecast');
  });

  it('says nothing rather than "Forecast" when there is no run', () => {
    // A selection whose output listing is empty has no forecast to name.
    render(<ForecastHeader title="Cat 1" subtitle="" onClick={() => {}} />);

    expect(screen.getByRole('heading', { level: 2, name: /cat 1/i })).toBeInTheDocument();
    expect(screen.queryByText(/forecast/i)).not.toBeInTheDocument();
  });

  it('keeps the run out of the heading', () => {
    render(<ForecastHeader title="Cat 1" subtitle="Short Range Forecast" onClick={() => {}} />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/cat 1/i);
    expect(heading).not.toHaveTextContent(/short range/i);
    expect(screen.getByText('Short Range Forecast')).toBeInTheDocument();
  });
});
