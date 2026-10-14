// Regression checks for gateway errors and cancellation without a backend/model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/api.js'), 'utf8');
function api(fetch) {
  const context = { window: {}, fetch, AbortController };
  vm.runInNewContext(source, context);
  return context.window.LifeAPI;
}

test('HTML gateway failure becomes readable error instead of JSON syntax error', async () => {
  const client = api(async () => ({ status: 502, ok: false, json: async () => { throw new SyntaxError('HTML'); } }));
  await assert.rejects(client.request('/api/run', { mode: 'chat' }), error => error.status === 502 && error.message.includes('无法读取'));
});

test('session expiry retains HTTP status for clearing private UI', async () => {
  const client = api(async () => ({ status: 401, ok: false, json: async () => ({ message: '登录已失效' }) }));
  await assert.rejects(client.request('/api/memories'), error => error.status === 401 && error.message === '登录已失效');
});

test('network failures have an actionable message', async () => {
  const client = api(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(client.request('/api/run', {}), error => error.status === 0 && error.message.includes('连接失败'));
});

test('logout cancellation aborts all in-flight requests and leaves later requests usable', async () => {
  let immediate = false;
  const client = api(async (_, options) => {
    if (immediate) return { ok: true, json: async () => ({ ready: true }) };
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  });
  const one = client.request('/api/run', {}), two = client.request('/api/memories');
  client.abortAll();
  await assert.rejects(one, { name: 'AbortError' });
  await assert.rejects(two, { name: 'AbortError' });
  immediate = true;
  assert.equal((await client.request('/api/me')).ready, true);
});
