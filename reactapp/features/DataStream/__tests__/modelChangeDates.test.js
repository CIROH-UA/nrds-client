/**
 * Changing the model rebuilds the date list, and it has to come out the same shape as the one
 * built at load: newest first, readable runs only, no children that are not runs at all. It did
 * not -- the two lists were built by separate code and only the load-time one carried the rules,
 * so switching models silently reverted the control to oldest-first and re-offered dates with
 * nothing to show. This drives the real s3Utils against a mocked bucket rather than mocking the
 * helper, since the bug was in which code the handler called, not in what the helper returns.
 */
import { act, render, screen } from '@testing-library/react';

import useS3DataStreamBucketStore from 'features/DataStream/store/s3Store';

jest.mock('features/DataStream/actions/loadVpu', () => ({ loadVpu: jest.fn() }));
jest.mock('features/DataStream/lib/duckdbClient', () => ({ terminateDatabase: jest.fn() }));
/* eslint-disable react/prop-types -- a three-prop stand-in for react-select, not a component. */
jest.mock('features/DataStream/components/SelectComponent', () => function SelectComponent({
  inputId, optionsList, onChangeHandler,
}) {
  return (
    <button type="button" data-testid={inputId} onClick={() => onChangeHandler(optionsList[0])}>
      {inputId}
    </button>
  );
});

const { DataMenuControls } = require('features/DataStream/components/forecast/dataMenu');

const prefixOf = (url) => decodeURIComponent(new URL(url).searchParams.get('prefix'));

// `test` sorts after every real date, which is where the newest run is looked for.
const CHILDREN = ['ngen.20260101', 'ngen.20260102', 'test'];

beforeEach(() => {
  useS3DataStreamBucketStore.setState({
    models: [{ value: 'aa', label: 'aa' }, { value: 'bb', label: 'bb' }],
    dates: [], forecasts: [], cycles: [], ensembles: [], outputFiles: [],
  });
  global.fetch = jest.fn(async (url) => {
    const prefix = prefixOf(url);
    const xml = (inner) => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => `<?xml version="1.0"?><ListBucketResult>${inner}</ListBucketResult>`,
    });
    if (!new URL(url).searchParams.has('delimiter')) {
      const ext = prefix.includes('/test/') ? 'nc' : 'parquet';
      return xml(`<Contents><Key>${prefix}f/c/VPU_16/ngen-run/outputs/troute/o.${ext}</Key></Contents>`);
    }
    const children = prefix.endsWith('v2.2_hydrofabric/') ? CHILDREN : ['aa', 'bb'];
    return xml(children.map((c) => `<CommonPrefixes><Prefix>${prefix}${c}/</Prefix></CommonPrefixes>`).join(''));
  });
});

it('rebuilds the date list on a model change with the same rules as the first load', async () => {
  render(<DataMenuControls />);

  await act(async () => {
    screen.getByTestId('select-model').click();
  });

  expect(useS3DataStreamBucketStore.getState().dates.map((d) => d.value))
    .toEqual(['ngen.20260102', 'ngen.20260101']);
});
