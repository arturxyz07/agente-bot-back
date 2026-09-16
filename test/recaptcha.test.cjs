const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requireRecaptcha } = require('../dist/recaptcha');

test('CAPTCHA gates both auth routes before credential handling', async () => {
  const oldFetch = global.fetch;
  const oldSecret = process.env.RECAPTCHA_SECRET_KEY;
  const oldHosts = process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
  process.env.RECAPTCHA_SECRET_KEY = 'test-only';
  process.env.RECAPTCHA_ALLOWED_HOSTNAMES = 'app.example.com';
  let verifierCalls = 0;
  let response = {success: true, hostname: 'app.example.com'};
  global.fetch = async (url, opts) => {
    verifierCalls++;
    assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
    assert.equal(opts.body.get('secret'), 'test-only');
    assert.ok(opts.signal);
    if (response instanceof Error) throw response;
    return {ok: true, json: async () => response};
  };
  const app = express();
  app.use(express.json());
  for (const route of ['login', 'register']) app.post('/' + route, requireRecaptcha, (_req,res) => res.json({authenticated: true}));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const request = (route, body) => oldFetch(`http://127.0.0.1:${server.address().port}/${route}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    for (const route of ['login','register']) {
      const before = verifierCalls;
      for (const token of [undefined, '', {}, 'x'.repeat(8193)]) assert.equal((await request(route, {recaptchaToken: token})).status, 400);
      assert.equal(verifierCalls, before);
      response = {success:true,hostname:'app.example.com'};
      assert.equal((await request(route,{recaptchaToken:'valid-token'})).status,200);
      for (const invalid of [null, {success:false,'error-codes':['timeout-or-duplicate']}, {success:true,hostname:'evil.example.com'}, {success:true}]) {
        response = invalid;
        assert.equal((await request(route,{recaptchaToken:'rejected'})).status,403);
      }
      response = new Error('unavailable');
      assert.equal((await request(route,{recaptchaToken:'token'})).status,503);
      delete process.env.RECAPTCHA_SECRET_KEY;
      assert.equal((await request(route,{recaptchaToken:'token'})).status,503);
      process.env.RECAPTCHA_SECRET_KEY = 'test-only';
      delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES;
      assert.equal((await request(route,{recaptchaToken:'token'})).status,503);
      process.env.RECAPTCHA_ALLOWED_HOSTNAMES = 'app.example.com';
    }
  } finally {
    global.fetch = oldFetch;
    if (oldSecret === undefined) delete process.env.RECAPTCHA_SECRET_KEY; else process.env.RECAPTCHA_SECRET_KEY = oldSecret;
    if (oldHosts === undefined) delete process.env.RECAPTCHA_ALLOWED_HOSTNAMES; else process.env.RECAPTCHA_ALLOWED_HOSTNAMES = oldHosts;
    await new Promise(resolve=>server.close(resolve));
  }
});
