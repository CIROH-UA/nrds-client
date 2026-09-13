import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  endpoints,
  resolveBase,
  buildUrl,
  loginUrl,
  parseCookie,
  csrfHeaders,
} from './api.js';

test('endpoints build the same API paths the React tethysAPI used', () => {
  assert.equal(endpoints.appData('nrds'), '/api/apps/nrds/');
  assert.equal(endpoints.appData('other-app'), '/api/apps/other-app/');
  assert.equal(endpoints.whoami(), '/api/whoami/');
  assert.equal(endpoints.token(), '/api/token/');
  assert.equal(endpoints.csrf(), '/api/csrf/');
});

test('resolveBase prefers the configured portal host', () => {
  assert.equal(resolveBase('https://portal.example.com', 'https://fallback.dev'), 'https://portal.example.com');
});

test('resolveBase falls back to the origin when the portal host is blank', () => {
  assert.equal(resolveBase('', 'https://fallback.dev'), 'https://fallback.dev');
  assert.equal(resolveBase(undefined, 'https://fallback.dev'), 'https://fallback.dev');
});

test('resolveBase trims a trailing slash so joins never double it', () => {
  assert.equal(resolveBase('https://portal.example.com/', 'https://fallback.dev'), 'https://portal.example.com');
  assert.equal(resolveBase('https://portal.example.com///', ''), 'https://portal.example.com');
});

test('buildUrl joins the portal host and the endpoint path', () => {
  assert.equal(
    buildUrl(endpoints.appData('nrds'), { portalHost: 'https://portal.example.com', origin: '' }),
    'https://portal.example.com/api/apps/nrds/'
  );
  assert.equal(
    buildUrl(endpoints.whoami(), { portalHost: 'https://portal.example.com', origin: '' }),
    'https://portal.example.com/api/whoami/'
  );
});

test('buildUrl uses the origin fallback when no portal host is set', () => {
  assert.equal(
    buildUrl(endpoints.csrf(), { portalHost: '', origin: 'https://host.dev' }),
    'https://host.dev/api/csrf/'
  );
});

test('buildUrl gives a relative path a leading slash', () => {
  assert.equal(
    buildUrl('api/token/', { portalHost: 'https://portal.example.com', origin: '' }),
    'https://portal.example.com/api/token/'
  );
});

test('loginUrl points at the portal login carrying the current path as next', () => {
  assert.equal(
    loginUrl('/apps/nrds/', { portalHost: 'https://portal.example.com', origin: '' }),
    'https://portal.example.com/accounts/login?next=/apps/nrds/'
  );
  assert.equal(
    loginUrl('/apps/nrds/', { portalHost: '', origin: 'https://host.dev' }),
    'https://host.dev/accounts/login?next=/apps/nrds/'
  );
});

test('parseCookie reads one cookie value from a cookie string', () => {
  assert.equal(parseCookie('a=1; csrftoken=abc123; b=2', 'csrftoken'), 'abc123');
  assert.equal(parseCookie('csrftoken=lead', 'csrftoken'), 'lead');
  assert.equal(parseCookie('x=1; csrftoken=tail', 'csrftoken'), 'tail');
});

test('parseCookie decodes the value and returns null when absent', () => {
  assert.equal(parseCookie('csrftoken=hello%20world', 'csrftoken'), 'hello world');
  assert.equal(parseCookie('other=1', 'csrftoken'), null);
  assert.equal(parseCookie('', 'csrftoken'), null);
  assert.equal(parseCookie(null, 'csrftoken'), null);
});

test('csrfHeaders is empty when there is no document to read a cookie from', () => {
  assert.deepEqual(csrfHeaders(), {});
});
