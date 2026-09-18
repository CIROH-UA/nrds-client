/**
 * The four bootstrap calls for the build-less NRDS client (migration unit U6), the native-fetch
 * replacement for the React axios `services/api` layer (client.js + tethys.js + utilities.js): the
 * app data, the signed-in user, a JWT token, and the CSRF token. `bootstrap` (aliased `initShell`)
 * runs the four in parallel and resolves { tethysApp, user, csrf, token }, or throws so the shell
 * renders its error view.
 *
 * How axios became fetch: the axios instance's baseURL is `resolveBase` (config.portalHost, or
 * window.location.origin when it is blank); `withCredentials: true` became `credentials: 'include'`;
 * the request interceptor that set `X-CSRFToken` from the csrftoken cookie became `csrfHeaders`;
 * and the response interceptor that redirected to the portal login on 401 and rejected otherwise
 * became `handleResponse` inside `apiGet`. The endpoint paths are unchanged from tethys.js.
 */
import { config } from '../config.js';

export const ACCESS_TOKEN_KEY = 'jwt_access';
export const REFRESH_TOKEN_KEY = 'jwt_refresh';
const CSRF_COOKIE = 'csrftoken';

/** The API paths, identical to the ones the React `tethysAPI` called. */
export const endpoints = {
  appData: (appId) => `/api/apps/${appId}/`,
  whoami: () => '/api/whoami/',
  token: () => '/api/token/',
  csrf: () => '/api/csrf/',
};

/** The current page origin, or '' where there is no window (tests, tooling). */
const currentOrigin = () =>
  typeof window !== 'undefined' && window.location ? window.location.origin : '';

/**
 * The API base: the configured portal host, or the current origin when none is set (the React
 * getTethysPortalHost fallback). The trailing slash is trimmed so a join never doubles it.
 */
export function resolveBase(portalHost, origin = currentOrigin()) {
  const host = portalHost && portalHost.length ? portalHost : origin;
  return String(host).replace(/\/+$/, '');
}

/** Join the API base and a path into an absolute URL. */
export function buildUrl(path, { portalHost = config.portalHost, origin } = {}) {
  const base = resolveBase(portalHost, origin ?? currentOrigin());
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The portal login URL a 401 is sent to, carrying the current path as `next`. */
export function loginUrl(nextPath, { portalHost = config.portalHost, origin } = {}) {
  const base = resolveBase(portalHost, origin ?? currentOrigin());
  return `${base}/accounts/login?next=${nextPath}`;
}

/** Read one cookie value from a cookie string; null when absent. Pure, so it is testable. */
export function parseCookie(cookieString, name) {
  if (!cookieString) return null;
  const match = cookieString.match(new RegExp(`(^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/** One cookie value from the live document, or null (the React utilities.getCookie). */
export function getCookie(name) {
  return typeof document !== 'undefined' ? parseCookie(document.cookie, name) : null;
}

/** The request headers that carry the CSRF token, matching axios's xsrf defaults. */
export function csrfHeaders() {
  const csrf = getCookie(CSRF_COOKIE);
  return csrf ? { 'X-CSRFToken': csrf } : {};
}

/**
 * GET a JSON endpoint with credentials and the CSRF header, returning { data, headers }. A 401
 * redirects to the portal login (the axios interceptor's behaviour) and then rejects; any other
 * non-2xx rejects with a labelled error.
 */
async function apiGet(path) {
  const url = buildUrl(path);
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json', ...csrfHeaders() },
    });
  } catch (cause) {
    throw new Error(`Network request to ${path} failed`, { cause });
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined' && window.location) {
      window.location.assign(loginUrl(window.location.pathname));
    }
    throw new Error('Not authenticated');
  }
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { data, headers: response.headers };
}

/** Persist the JWT pair the way the React client did; storage failures are swallowed. */
function setTokens(access, refresh) {
  try {
    if (access != null) window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
    if (refresh != null) window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  } catch {
    /* empty */
  }
}

/** The app metadata (title, icon, root url) for the navbar brand. */
export async function getAppData(appId) {
  const { data } = await apiGet(endpoints.appData(appId));
  return data;
}

/** The signed-in user, or the anonymous stand-in the portal returns. */
export async function getUserData() {
  const { data } = await apiGet(endpoints.whoami());
  return data;
}

/** A fresh JWT access/refresh pair, stored for later API calls. */
export async function getJWTToken() {
  const { data } = await apiGet(endpoints.token());
  const access = data?.access;
  const refresh = data?.refresh;
  setTokens(access, refresh);
  return { access, refresh };
}

/** The CSRF token the portal echoes back in the `x-csrftoken` response header. */
export async function getCSRF() {
  const { headers } = await apiGet(endpoints.csrf());
  return headers.get('x-csrftoken');
}

/**
 * Run the four bootstrap calls in parallel and resolve the composed app context, or throw. The app
 * slug comes from config.appId, falling back to the fixed `nrds` root url when none is injected.
 */
export async function bootstrap({ appId = config.appId || 'nrds' } = {}) {
  const [tethysApp, user, token, csrf] = await Promise.all([
    getAppData(appId),
    getUserData(),
    getJWTToken(),
    getCSRF(),
  ]);
  return { tethysApp, user, csrf, token };
}

export const initShell = bootstrap;

export default bootstrap;
