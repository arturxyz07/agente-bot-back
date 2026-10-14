const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: connect } = require('socket.io-client');
const { User } = require('../dist/db');
const { attachRealtime, askGeminiModerator, isBotInvoked, censor, BOT_NAME } = require('../dist/realtime');

const USERS = { '0123456789abcdef01234567': 'Ana', '0123456789abcdef01234568': 'Bruno' };
const [ANA, BRUNO] = Object.keys(USERS);

function once(socket, event, predicate = () => true, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout esperando ${event}`)); }, timeout);
    function handler(data) {
      if (!predicate(data)) return;
      clearTimeout(timer); socket.off(event, handler); resolve(data);
    }
    socket.on(event, handler);
  });
}

async function setup(t, askBot) {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  t.mock.method(User, 'findById', (id) => ({ select: async () => (USERS[id] ? { name: USERS[id] } : null) }));
  const calls = [];
  const server = http.createServer();
  const io = attachRealtime(server, { askBot: askBot ?? (async (texto) => { calls.push(texto); return 'Olá, sala!'; }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const client = (token) => {
    const socket = connect(url, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    return socket;
  };
  const join = async (userId) => {
    const socket = client(jwt.sign({ userId }, 'test-secret'));
    await once(socket, 'connect');
    return socket;
  };
  t.after(async () => {
    sockets.forEach(socket => socket.disconnect());
    io.close();
    await new Promise(resolve => server.close(resolve));
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  });
  return { client, join, calls };
}

test('socket recusa conexões sem token, com token inválido ou de usuário inexistente', async (t) => {
  const { client } = await setup(t);
  for (const token of [undefined, 'invalido', jwt.sign({ userId: ANA }, 'outra-chave'), jwt.sign({ userId: 'abc' }, 'test-secret'),
    jwt.sign({ userId: 'ffffffffffffffffffffffff' }, 'test-secret')]) {
    const error = await once(client(token), 'connect_error');
    assert.ok(error.message);
  }
});

test('mensagem enviada na aba A aparece na aba B com o nome do autor; IA fica em silêncio', async (t) => {
  const { join, calls } = await setup(t);
  const a = await join(ANA);
  const b = await join(BRUNO);
  let botMessages = 0;
  b.on('mensagemRecebida', (m) => { if (m.tipo === 'bot') botMessages++; });
  const received = once(b, 'mensagemRecebida');
  const ack = await a.emitWithAck('novaMensagem', { texto: '  Oi, Bruno!  ' });
  assert.deepEqual(ack, { ok: true });
  const message = await received;
  assert.equal(message.autor, 'Ana');
  assert.equal(message.autorId, ANA);
  assert.equal(message.texto, 'Oi, Bruno!');
  assert.equal(message.tipo, 'usuario');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(botMessages, 0);
  assert.equal(calls.length, 0);
});

test('@gemini invoca o moderador e a resposta chega para todos da sala', async (t) => {
  const { join, calls } = await setup(t);
  const a = await join(ANA);
  const b = await join(BRUNO);
  const isBot = (m) => m.tipo === 'bot';
  const forA = once(a, 'mensagemRecebida', isBot);
  const forB = once(b, 'mensagemRecebida', isBot);
  const thinking = once(b, 'usuarioDigitando', (d) => d.nome === BOT_NAME && d.digitando);
  await a.emitWithAck('novaMensagem', { texto: '@gemini, me ajude' });
  assert.equal((await forA).texto, 'Olá, sala!');
  const reply = await forB;
  assert.equal(reply.autor, BOT_NAME);
  await thinking;
  assert.deepEqual(calls, ['@gemini, me ajude']);
});

test('falha da IA vira mensagem amigável do moderador', async (t) => {
  const { join } = await setup(t, async () => { throw new Error('quota'); });
  const a = await join(ANA);
  const reply = once(a, 'mensagemRecebida', (m) => m.tipo === 'bot');
  await a.emitWithAck('novaMensagem', '@bot qual a capital?');
  assert.match((await reply).texto, /não consegui responder/);
});

test('palavrões são censurados e o moderador adverte a sala', async (t) => {
  const { join, calls } = await setup(t);
  const a = await join(ANA);
  const b = await join(BRUNO);
  const userMessage = once(b, 'mensagemRecebida', (m) => m.tipo === 'usuario');
  const warning = once(b, 'mensagemRecebida', (m) => m.tipo === 'bot');
  await a.emitWithAck('novaMensagem', { texto: 'que PORRA é essa' });
  assert.equal((await userMessage).texto, 'que ***** é essa');
  assert.match((await warning).texto, /Ana, vamos manter o respeito/);
  assert.equal(calls.length, 0);
});

test('mensagens vazias, longas ou em flood são rejeitadas sem broadcast', async (t) => {
  const { join } = await setup(t);
  const a = await join(ANA);
  let broadcasts = 0;
  a.on('mensagemRecebida', () => broadcasts++);
  for (const payload of ['   ', {}, null, { texto: 42 }, 'x'.repeat(1001)]) {
    assert.equal((await a.emitWithAck('novaMensagem', payload)).ok, false);
  }
  assert.equal((await a.emitWithAck('novaMensagem', 'primeira')).ok, true);
  assert.equal((await a.emitWithAck('novaMensagem', 'flood')).ok, false);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(broadcasts, 1);
});

test('contador de usuários online sobe e desce; indicador de digitação chega aos outros', async (t) => {
  const { join } = await setup(t);
  const a = await join(ANA);
  const up = once(a, 'usuariosOnline', (n) => n === 2);
  const b = await join(BRUNO);
  await up;
  const typing = once(b, 'usuarioDigitando', (d) => d.nome === 'Ana' && d.digitando === true);
  a.emit('digitando', true);
  await typing;
  const stopped = once(b, 'usuarioDigitando', (d) => d.nome === 'Ana' && d.digitando === false);
  const down = once(b, 'usuariosOnline', (n) => n === 1);
  a.disconnect();
  await Promise.all([stopped, down]);
});

test('novos usuários recebem o histórico recente da sala', async (t) => {
  const { client, join } = await setup(t);
  const a = await join(ANA);
  await a.emitWithAck('novaMensagem', 'mensagem antiga');
  const lateHistory = await once(client(jwt.sign({ userId: BRUNO }, 'test-secret')), 'historico');
  assert.ok(lateHistory.some((m) => m.texto === 'mensagem antiga' && m.autor === 'Ana'));
});

test('gatilho e censura reconhecem apenas comandos e palavras inteiras', () => {
  for (const text of ['@gemini oi', 'oi @Gemini', 'ei, @bot!', '(@bot) ajuda']) assert.ok(isBotInvoked(text), text);
  for (const text of ['oi gemini', 'meu email é ana@gemini.com', '@botafogo ganhou', '@geminis']) assert.ok(!isBotInvoked(text), text);
  assert.deepEqual(censor('computador e disputa'), { texto: 'computador e disputa', found: false });
  assert.deepEqual(censor('Desgraçado!'), { texto: '**********!', found: true });
});

test('moderador Gemini recebe instrução de sistema, histórico da sala e a pergunta', async (t) => {
  t.mock.method(global, 'fetch', async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.systemInstruction.parts[0].text, /Moderador Gemini/);
    assert.ok(payload.contents[0].parts[0].text.includes('mensagem anterior'));
    assert.ok(payload.contents[0].parts[1].text.includes('@gemini resuma'));
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Resumo.' }] }, finishReason: 'STOP' }] }), { status: 200 });
  });
  const original = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  try {
    const history = [{ autor: 'Ana', texto: 'mensagem anterior' }];
    assert.equal(await askGeminiModerator('@gemini resuma', history), 'Resumo.');
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    await assert.rejects(askGeminiModerator('@gemini', []), /não configurado/);
  } finally {
    if (original === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; else process.env.GOOGLE_GENERATIVE_AI_API_KEY = original;
  }
});
