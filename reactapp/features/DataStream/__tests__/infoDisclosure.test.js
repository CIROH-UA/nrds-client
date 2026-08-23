/**
 * The layer and data notes used to be dialogs.
 *
 * Explaining what a layer is, in a window covering that layer, behind a scrim over the map the
 * explanation is about, meant dismissing the answer in order to look at the thing. They open in
 * place now, which also drops the focus trap, the backdrop and the escape handling that a
 * dialog needs and a paragraph does not.
 */
import { render, screen, act } from '@testing-library/react';

import { InfoToggle } from 'features/DataStream/components/InfoDisclosure';
import { ForecastHeader } from 'features/DataStream/components/forecast/ForecastHeader';
import { useFeatureStore } from 'features/DataStream/store/Layers';

const initialFs = useFeatureStore.getState();
beforeEach(() => { useFeatureStore.setState(initialFs, true); });

const click = (el) => act(() => { el.click(); });

describe('the disclosure control', () => {
  test('is a disclosure, not a button that happens to change something', () => {
    const onToggle = jest.fn();
    render(<InfoToggle open={false} onToggle={onToggle} controls="x" label="layer information" />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'x');
  });

  test('says which way it will go, so the second press is obviously the undo', () => {
    const { rerender } = render(
      <InfoToggle open={false} onToggle={() => {}} controls="x" label="layer information" />
    );
    expect(screen.getByRole('button')).toHaveAccessibleName('Show layer information');

    rerender(<InfoToggle open onToggle={() => {}} controls="x" label="layer information" />);
    expect(screen.getByRole('button')).toHaveAccessibleName('Hide layer information');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  test('reports the press rather than owning the state, since the note renders elsewhere', () => {
    const onToggle = jest.fn();
    render(<InfoToggle open={false} onToggle={onToggle} controls="x" label="l" />);

    screen.getByRole('button').click();

    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('the data note in the forecast header', () => {
  const open = () => screen.getByRole('button', { name: /show notes on this data/i });

  test('is closed to begin with', () => {
    render(<ForecastHeader title="Cat 2884494 Short Range Forecast" onClick={() => {}} />);
    expect(open()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/availability varies by date/i)).toBeNull();
  });

  test('opens in place, without a dialog', async () => {
    render(<ForecastHeader title="Cat 2884494" onClick={() => {}} />);

    await click(open());

    expect(screen.getByText(/availability varies by date/i)).toBeInTheDocument();
    // The whole point: no dialog, so nothing covers the map or traps focus.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('the control points at the note it opened', async () => {
    render(<ForecastHeader title="Cat 2884494" onClick={() => {}} />);
    await click(open());

    const button = screen.getByRole('button', { name: /hide notes on this data/i });
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent(/availability varies by date/i);
  });

  test('closes again on a second press', async () => {
    render(<ForecastHeader title="Cat 2884494" onClick={() => {}} />);
    await click(open());
    await click(screen.getByRole('button', { name: /hide notes on this data/i }));

    expect(screen.queryByText(/availability varies by date/i)).toBeNull();
  });

  test('leaves the clear-selection control alone', async () => {
    const onClick = jest.fn();
    render(<ForecastHeader title="Cat 2884494" onClick={onClick} />);
    await click(open());

    await click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClick).toHaveBeenCalled();
  });
});

/**
 * There used to be a second copy of the layer note here, inside the side panel's Feature
 * Information block. That block moved onto the map as a popup and did not take a nested help
 * disclosure with it, so the layer panel now holds the only copy -- and the test that checked
 * the two used distinct aria-controls ids has nothing left to compare.
 */
