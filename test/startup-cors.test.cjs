const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const express = require('express');
const { createCorsMiddleware } = require('../dist/corsMiddleware');

test('API starts and TXT extraction works even when native PDF modules are unavailable', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function(name, ...args) {
      if (name === 'pdf-parse' || name.startsWith('@napi-rs/canvas')) throw new Error('Native dependency unavailable');
      return original.call(this, name, ...args);
    };
    require('./dist/index');
    require('./dist/rag').extractDocumentText(Buffer.from('Texto'), 'doc.txt')
      .then(text => { if (text !== 'Texto') process.exitCode = 1; })
      .catch(() => { process.exitCode = 1; });
  `], { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, JWT_SECRET: 'test-secret', MONGO_URI: '' } });
  assert.equal(result.status, 0, result.stderr);
});

test('CORS permits deployed frontend preflight and error responses but not unknown origins', async () => {
  const oldOrigins = process.env.CORS_ALLOWED_ORIGINS;
  delete process.env.CORS_ALLOWED_ORIGINS;
  const app = express();
  app.use(createCorsMiddleware());
  app.post('/api/auth/login', (_req, res) => res.status(401).json({ error: 'Invalid credentials' }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
  try {
    const origin = 'https://agente-bot-phi.vercel.app';
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    const login = await fetch(url, { method: 'POST', headers: { Origin: origin } });
    assert.equal(login.status, 401);
    assert.equal(login.headers.get('access-control-allow-origin'), origin);
    const unknown = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://unknown.example' } });
    assert.equal(unknown.headers.get('access-control-allow-origin'), null);
  } finally {
    if (oldOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS; else process.env.CORS_ALLOWED_ORIGINS = oldOrigins;
    await new Promise(resolve => server.close(resolve));
  }
});
