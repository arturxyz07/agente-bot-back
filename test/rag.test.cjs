const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { extractDocumentText, answerFromDocument, MAX_DOCUMENT_CHARS } = require('../dist/rag');
const { User } = require('../dist/db');
const { adminRoutes, KnowledgeDocument } = require('../dist/adminRoutes');

// A tiny valid PDF fixture, generated without external dependencies.
function pdf(text) {
  const content = text ? `BT /F1 12 Tf 50 100 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(result)); result += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}

test('extracts complete TXT and PDF; rejects empty, invalid, binary and oversized documents', async () => {
  assert.equal(await extractDocumentText(Buffer.from('Prazo: 30 dias.\nCondição: aprovação.'), 'regras.TXT'), 'Prazo: 30 dias.\nCondição: aprovação.');
  assert.match(await extractDocumentText(pdf('Prazo de 30 dias'), 'regras.pdf'), /Prazo de 30 dias/);
  for (const [buffer, name] of [
    [Buffer.from('   '), 'empty.txt'], [Buffer.alloc(0), 'empty.txt'],
    [Buffer.from([255, 0]), 'binary.txt'], [Buffer.from('a\0b'), 'binary.txt'],
    [Buffer.from('fake'), 'fake.pdf'], [Buffer.from('%PDF-broken'), 'broken.pdf'],
    [pdf(''), 'scan.pdf'], [Buffer.from('text'), 'script.exe'],
    [Buffer.from('x'.repeat(MAX_DOCUMENT_CHARS + 1)), 'large.txt'],
  ]) await assert.rejects(extractDocumentText(buffer, name));
});

test('Gemini receives full document and strict system instruction without tools or chat history', async (t) => {
  t.mock.method(global, 'fetch', async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.systemInstruction.parts[0].text, /ÚNICA E EXCLUSIVAMENTE/);
    assert.equal(payload.tools, undefined);
    assert.equal(payload.contents.length, 1);
    assert.ok(payload.contents[0].parts[0].text.includes('CONTEUDO PRIVADO'));
    assert.ok(payload.contents[0].parts[1].text.includes('Qual o prazo?'));
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '30 dias.' }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const original = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  try { assert.equal(await answerFromDocument('CONTEUDO PRIVADO: prazo de 30 dias.', 'Qual o prazo?'), '30 dias.'); }
  finally { if (original === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; else process.env.GOOGLE_GENERATIVE_AI_API_KEY = original; }
});

test('admin HTTP routes enforce roles, upload limits, metadata privacy and document-only answers', async (t) => {
  const realFetch = global.fetch;
  const oldSecret = process.env.JWT_SECRET;
  const oldKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  const id = '0123456789abcdef01234567';
  let role = 'admin'; let stored = null;
  t.mock.method(User, 'findById', () => ({ select: async () => ({ role }) }));
  t.mock.method(KnowledgeDocument, 'create', async (data) => (stored = { ...data, _id: id, createdAt: new Date().toISOString() }));
  t.mock.method(KnowledgeDocument, 'find', () => ({ select: (fields) => {
    assert.ok(!fields.includes('text'));
    return { sort: async () => stored ? [{ _id: id, name: stored.name }] : [] };
  } }));
  t.mock.method(KnowledgeDocument, 'findById', () => ({ select: async () => stored }));
  t.mock.method(KnowledgeDocument, 'findByIdAndDelete', async () => { const previous = stored; stored = null; return previous; });
  t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'O prazo é de 30 dias.' }] }, finishReason: 'STOP' }] }), { status: 200 }));
  const app = express(); app.use(express.json()); app.use('/api/admin', adminRoutes);
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const token = jwt.sign({ userId: id }, process.env.JWT_SECRET);
  const request = (path, options = {}, auth = token) => realFetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`, { ...options, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...options.headers } });
  const upload = (content, filename) => { const form = new FormData(); form.append('file', new Blob([content]), filename); return { method: 'POST', body: form }; };
  const ask = (question) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  try {
    assert.equal((await request('/documents', {}, null)).status, 401);
    assert.equal((await request('/documents', {}, 'invalid')).status, 401);
    role = 'user';
    for (const [path, options] of [['/documents', {}], ['/documents', upload('text', 'a.txt')], [`/documents/${id}`, { method: 'DELETE' }], [`/documents/${id}/ask`, ask('Pergunta')]]) {
      assert.equal((await request(path, options)).status, 403);
    }
    role = 'admin';
    assert.equal((await request('/documents', upload('x'.repeat(4 * 1024 * 1024 + 1), 'large.txt'))).status, 413);
    assert.equal((await request('/documents', upload('text', 'bad.exe'))).status, 400);
    const created = await request('/documents', upload('CONTEUDO PRIVADO: prazo de 30 dias.', 'prazo.txt'));
    assert.equal(created.status, 201);
    assert.equal((await created.json()).document.text, undefined);
    assert.ok(!(await (await request('/documents')).text()).includes('CONTEUDO PRIVADO'));
    assert.equal((await request('/documents/bad/ask', ask('Pergunta'))).status, 400);
    for (const question of ['', {}, 'x'.repeat(4001)]) assert.equal((await request(`/documents/${id}/ask`, ask(question))).status, 400);
    const answer = await request(`/documents/${id}/ask`, ask('Qual o prazo?'));
    assert.equal(answer.status, 200);
    assert.deepEqual(await answer.json(), { answer: 'O prazo é de 30 dias.', document: { _id: id, name: 'prazo.txt' } });
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    assert.equal((await request(`/documents/${id}/ask`, ask('Pergunta'))).status, 503);
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    assert.equal((await request(`/documents/${id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await request(`/documents/${id}/ask`, ask('Pergunta'))).status, 404);
    assert.equal((await request(`/documents/${id}`, { method: 'DELETE' })).status, 404);
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    if (oldKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; else process.env.GOOGLE_GENERATIVE_AI_API_KEY = oldKey;
    await new Promise(resolve => server.close(resolve));
  }
});
