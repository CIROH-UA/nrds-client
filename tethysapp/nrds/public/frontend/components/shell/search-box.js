import { loadIndexData, searchIndexIds } from '../../lib/queryData.js';
import {
  buildSearchPattern,
  searchCandidates,
  shapeSuggestions,
} from '../../lib/searchQuery.js';
import { store, actions } from '../../store/app-store.js';
import { selectIndexedFeature } from '../../actions/selectIndexedFeature.js';

/**
 * The feature-id search box for the build-less NRDS client (migration unit U5d), the vanilla
 * replacement for the React SearchBar. `createSearchBox(container, store)` mounts an accessible
 * combobox/typeahead into the navbar's search slot and returns a teardown.
 *
 * On mount it loads the slim hydrofabric index into DuckDB once (from datastream.hydrofabric_index,
 * with the remote fallback), keeping datastream.index_status in step so the navbar's load-status
 * shows "Building the search index" while it loads and a retry notice if it fails. As the reader
 * types it queries the index (debounced) for matching ids and lists them; choosing one resolves the
 * feature (its vpu and centroid) and selects+loads it through selectIndexedFeature, exactly as a map
 * click would. It reuses the ported query layer for all DuckDB access and never opens a connection.
 *
 * Keyboard: Down/Up move the active option, Enter selects it (or submits the typed id when none is
 * active), Escape closes the list then clears the field. The input carries aria-activedescendant and
 * the listbox/option roles a combobox needs.
 */

const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

const DEBOUNCE_MS = 200;
const MAX_SUGGESTIONS = 8;

let boxCount = 0;

/** Merge a patch into the timeseries slice without a dedicated action for each field. */
const patchTimeseries = (patch) => {
  const s = store.get().timeseries;
  store.set({ timeseries: { ...s, ...patch } });
};

/** Mount the search box into `container`, wired to `store`; returns a teardown. */
export function createSearchBox(container, appStore = store) {
  const uid = `nrds-search-${(boxCount += 1)}`;
  const listId = `${uid}-listbox`;
  const optionId = (i) => `${uid}-option-${i}`;

  const form = document.createElement('form');
  form.className = 'nrds-search';
  form.setAttribute('role', 'search');

  const box = document.createElement('div');
  box.className = 'nrds-search__box';

  const icon = document.createElement('span');
  icon.className = 'nrds-search__icon';
  icon.innerHTML = SEARCH_ICON;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'nrds-search__input';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-label', 'Search for a feature id');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.placeholder = 'Search for an id';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'nrds-search__submit';
  submit.setAttribute('aria-label', 'Search');
  submit.innerHTML = SEARCH_ICON;

  box.append(icon, input, submit);

  const listbox = document.createElement('ul');
  listbox.className = 'nrds-search__listbox';
  listbox.id = listId;
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Matching feature ids');
  listbox.hidden = true;

  const notice = document.createElement('div');
  notice.className = 'nrds-search__notice';
  notice.setAttribute('role', 'alert');
  notice.hidden = true;
  const noticeText = document.createElement('span');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'nrds-search__retry';
  retry.textContent = 'Try again';
  notice.append(noticeText, retry);

  form.append(box, listbox, notice);
  container.append(form);

  let suggestions = [];
  let activeIndex = -1;
  let searching = false;
  let debounceTimer = null;
  let queryTicket = 0;
  let indexLoadToken = 0;
  let destroyed = false;

  const indexStatus = () => appStore.get().datastream.index_status;

  /** Reflect the current phase on the input: disabled + hint while the index builds. */
  const reflectStatus = () => {
    const status = indexStatus();
    if (status === 'failed') {
      box.hidden = true;
      listbox.hidden = true;
      notice.hidden = false;
      return;
    }
    box.hidden = false;
    notice.hidden = true;
    const loading = status === 'loading';
    input.disabled = loading;
    submit.disabled = loading || searching || !input.value.trim();
    input.placeholder = loading ? 'Building the search index' : 'Search for an id';
    input.setAttribute('aria-busy', loading ? 'true' : 'false');
  };

  const closeList = () => {
    suggestions = [];
    activeIndex = -1;
    listbox.replaceChildren();
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const renderOptions = () => {
    listbox.replaceChildren();
    if (!suggestions.length) {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return;
    }
    suggestions.forEach((id, i) => {
      const li = document.createElement('li');
      li.className = 'nrds-search__option';
      li.id = optionId(i);
      li.setAttribute('role', 'option');
      li.textContent = id;
      const active = i === activeIndex;
      li.setAttribute('aria-selected', active ? 'true' : 'false');
      li.classList.toggle('is-active', active);
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        commit(id);
      });
      listbox.append(li);
    });
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (activeIndex >= 0) input.setAttribute('aria-activedescendant', optionId(activeIndex));
    else input.removeAttribute('aria-activedescendant');
  };

  const setActive = (next) => {
    const count = suggestions.length;
    if (!count) return;
    activeIndex = ((next % count) + count) % count;
    renderOptions();
    const el = listbox.children[activeIndex];
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  };

  const runQuery = async (raw) => {
    if (indexStatus() !== 'ready') return;
    const pattern = buildSearchPattern(raw);
    if (!pattern) {
      closeList();
      return;
    }
    const ticket = ++queryTicket;
    try {
      const ids = await searchIndexIds(pattern, { limit: MAX_SUGGESTIONS });
      if (destroyed || ticket !== queryTicket) return;
      if (input.value.trim() !== raw.trim()) return;
      suggestions = shapeSuggestions(ids, { limit: MAX_SUGGESTIONS });
      activeIndex = -1;
      renderOptions();
    } catch (err) {
      if (destroyed || ticket !== queryTicket) return;
      console.error('Search suggestions failed', err);
      closeList();
    }
  };

  const scheduleQuery = (raw) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runQuery(raw), DEBOUNCE_MS);
  };

  /** Resolve an id to its feature and select+load it, the way a map click would. */
  const commit = async (rawId) => {
    const id = String(rawId ?? '').trim();
    if (!id || indexStatus() !== 'ready' || searching) return;

    closeList();
    input.value = id;
    searching = true;
    reflectStatus();
    try {
      const matchedId = await selectIndexedFeature(searchCandidates(id));
      if (destroyed) return;
      if (!matchedId) {
        input.setAttribute('aria-invalid', 'true');
        patchTimeseries({
          loadingText: `No feature found with id ${id}`,
          last_error: { kind: 'search-miss', featureId: id },
        });
        return;
      }
      input.removeAttribute('aria-invalid');
      patchTimeseries({ loadingText: '', last_error: null });
    } catch (err) {
      if (destroyed) return;
      console.error('Search failed for', id, err);
      patchTimeseries({
        loadingText: `Search failed for ${id}`,
        last_error: { kind: 'search', featureId: id },
      });
    } finally {
      if (!destroyed) {
        searching = false;
        reflectStatus();
      }
    }
  };

  const onInput = () => {
    input.removeAttribute('aria-invalid');
    reflectStatus();
    scheduleQuery(input.value);
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length) setActive(activeIndex + 1);
        else scheduleQuery(input.value);
        break;
      case 'ArrowUp':
        if (suggestions.length) {
          e.preventDefault();
          setActive(activeIndex - 1);
        }
        break;
      case 'Enter':
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          e.preventDefault();
          commit(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        if (!listbox.hidden) {
          e.preventDefault();
          closeList();
        } else if (input.value) {
          input.value = '';
          reflectStatus();
        }
        break;
      default:
        break;
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) commit(suggestions[activeIndex]);
    else commit(input.value);
  };

  const onBlur = () => {
    setTimeout(() => {
      if (!destroyed) closeList();
    }, 120);
  };

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', onBlur);
  form.addEventListener('submit', onSubmit);

  /** Load the slim index into DuckDB once, keeping index_status in step. Re-runnable for retry. */
  const loadIndex = () => {
    const token = ++indexLoadToken;
    actions.set_index_status('loading');
    reflectStatus();
    loadIndexData({
      remoteUrl: appStore.get().datastream.hydrofabric_index,
      fallbackUrl: appStore.get().datastream.hydrofabric_index_fallback,
    })
      .then(() => {
        if (destroyed || token !== indexLoadToken) return;
        actions.set_index_status('ready');
      })
      .catch((err) => {
        if (destroyed || token !== indexLoadToken) return;
        console.error('Could not build the search index', err);
        actions.set_index_status('failed');
      });
  };

  retry.addEventListener('click', () => loadIndex());

  const unsubscribe = appStore.subscribe(() => reflectStatus());

  reflectStatus();
  loadIndex();

  return () => {
    destroyed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe();
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('blur', onBlur);
    form.removeEventListener('submit', onSubmit);
    form.remove();
  };
}

export default createSearchBox;
