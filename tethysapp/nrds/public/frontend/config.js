/**
 * Runtime config, read once at startup (KTD5). The Django template injects `window.__NRDS__`
 * with the app id, app root URL, debug flag, loader delay, and portal host, replacing webpack's
 * dotenv `process.env.TETHYS_*` injection. Defaults keep the module importable outside a browser
 * (tests, tooling), where `window` is absent, and give the shell's bootstrap a usable app slug.
 */
const defaults = {
  appRootUrl: '/',
  appId: 'nrds',
  debug: false,
  loaderDelay: 0,
  portalHost: '',
};

const injected = (typeof window !== 'undefined' && window.__NRDS__) || {};

export const config = { ...defaults, ...injected };
