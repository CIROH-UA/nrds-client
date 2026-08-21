import React, { useCallback, useEffect, useState } from 'react';
import { BsDatabaseX } from 'react-icons/bs';
import { useShallow } from 'zustand/react/shallow';

import Spinner from 'features/Tethys/components/loader/Spinner';
import { StyledButton } from 'features/Tethys/components/Styles';
import { useCacheTablesStore } from 'features/DataStream/store/CacheTables';

/**
 * Throw away the cached data file.
 *
 * Replaces a floating folder button and a table of cached files, each row with its own delete
 * control. That panel existed because the cache held up to ten files and needed managing; it
 * holds one, so there is nothing to choose between and a single control says all there is to
 * say. It sits in the header rather than over the map because the previous button was also
 * always reachable, and moving it into the forecast panel would have hidden it whenever no
 * feature was selected.
 *
 * No confirmation. Clearing costs a refetch of about 7 MB, and the button is disabled when
 * there is nothing to clear, so the destructive-sounding case is the one it will not offer.
 *
 * A struck-through database rather than a bin: a bin says "delete", which invites the reader to
 * wonder what of theirs is being deleted. Nothing here belongs to them and nothing is lost, so
 * the icon says stored data, removed.
 */
export const ClearCacheButton = React.memo(function ClearCacheButton() {
  const { cached, refresh, clear } = useCacheTablesStore(
    useShallow((s) => ({
      cached: s.cacheTables,
      refresh: s.refresh,
      clear: s.clear,
    }))
  );
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    // What is on disk survives a reload, so the button's state cannot come from this session.
    refresh();
  }, [refresh]);

  const onClear = useCallback(async () => {
    setClearing(true);
    try {
      // Caught, not just finally'd: the store swallows its own failures today, and a rejection
      // reaching here would be an unhandled one rather than a button that comes back.
      await clear();
    } catch (err) {
      console.error('Could not clear the cache', err);
    } finally {
      setClearing(false);
    }
  }, [clear]);

  const size = cached?.[0]?.size;
  const empty = !cached?.length;
  const label = clearing
    ? 'Clearing cached data'
    : empty
      ? 'No cached data to clear'
      : `Clear cached data${size ? ` (${size})` : ''}`;

  return (
    <StyledButton
      type="button"
      onClick={onClear}
      disabled={empty || clearing}
      aria-busy={clearing || undefined}
      aria-label={label}
      title={label}
    >
      {clearing ? <Spinner size={20} /> : <BsDatabaseX size="1.5rem" aria-hidden="true" />}
    </StyledButton>
  );
});

export default ClearCacheButton;
