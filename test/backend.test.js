const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createApp } = require('../server');
const http = require('node:http');
const { createHandler } = require('../api');

test('Vercel entry handles account creation and sign-in on the original API paths', async t => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), 'mbuddy-vercel-test-'));
  const server = http.createServer(createHandler({ dataFile: path.join(directory, 'data.json') }));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const credentials = JSON.stringify({ email: 'vercel.test@mmdc.mcl.edu.ph', password: 'test-vercel-password' });
  for (const [route, status] of [['/api/accounts', 201], ['/api/session', 200]]) {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: credentials });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.ok(body.token);
    assert.ok(body.user.id);
  }
  assert.ok(Array.isArray(await (await fetch(base + '/api/profiles')).json()));
});

test('frontend explains HTML hosting failures instead of a generic request error', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'object-store.js'), 'utf8');
  for (const status of [200, 404, 405, 502]) {
    const context = {
      window: {}, structuredClone, crypto: crypto.webcrypto, console: { error() {} },
      fetch: async () => new Response('<html>Hosting error</html>', { status, headers: { 'Content-Type': 'text/html' } })
    };
    vm.runInNewContext(source, context);
    await assert.rejects(context.window.mbuddyDb.signIn('test@mmdc.mcl.edu.ph', 'test-password'), /server is unavailable on this deployment/);
    await assert.rejects(context.window.mbuddyDb.signUp('test@mmdc.mcl.edu.ph', 'test-password'), /server is unavailable on this deployment/);
  }
});

test('profile API and frontend adapter work together and survive a server restart', async t => {
  const directory = await fs.mkdtemp(path.join(process.cwd(), 'mbuddy-test-'));
  const dataFile = path.join(directory, 'data.json');
  let server;
  let base;
  async function start() {
    const app = await createApp({ dataFile });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  t.after(async () => {
    if (server?.listening) await stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await start();
  async function request(route, { method = 'GET', token, body, raw } = {}) {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw || (body === undefined ? undefined : JSON.stringify(body)) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  function adapter() {
    const context = { window: {}, crypto: crypto.webcrypto, structuredClone, fetch: (route, options) => fetch(base + route, options) };
    return fs.readFile(path.join(__dirname, '..', 'object-store.js'), 'utf8').then(source => {
      vm.runInNewContext(source, context);
      return context.window.mbuddyDb;
    });
  }
  let db;
  let owner;
  let created;
  let other;
  let valid;
  await t.test('frontend loads seeded profiles and creates an account over HTTP', async () => {
    db = await adapter();
    const profiles = await db.listProfiles();
    assert.equal(profiles.length, 1);
    valid = { first_name: ' Test Student ', course_specialization: profiles[0].course_specialization, year_level: 3, term: 1, goal: ' Study together ', work_style: 'Flexible', classes: [profiles[0].classes[0]], time_slot: null };
    owner = await db.signUp('test.student@mmdc.mcl.edu.ph', 'test-password-123');
    assert.ok(owner.user.id);
  });
  await t.test('server rejects missing authentication and invalid inputs', async () => {
    assert.equal((await request('/api/profiles', { method: 'POST', body: valid })).status, 401);
    assert.equal((await request('/api/accounts', { method: 'POST', body: { email: 'outside@example.com', password: '123456' } })).status, 400);
    assert.equal((await request('/api/accounts', { method: 'POST', raw: '{oops' })).status, 400);
    assert.equal((await request('/api/session', { method: 'POST', body: { email: 'test.student@mmdc.mcl.edu.ph', password: 'incorrect' } })).status, 401);
    await assert.rejects(db.createProfile({ ...valid, first_name: '   ' }), /Name must/);
    await assert.rejects(db.createProfile({ ...valid, year_level: 9 }), /year and term/);
    await assert.rejects(db.createProfile({ ...valid, classes: [] }), /1 to 8 classes/);
    await assert.rejects(db.createProfile({ ...valid, classes: ['Invalid - A'] }), /specialization/);
    await assert.rejects(db.createProfile({ ...valid, classes: [valid.classes[0], valid.classes[0]] }), /only be added once/);
    await assert.rejects(db.createProfile({ ...valid, classes: [valid.classes[0].slice(0, -1) + 'Z'] }), /time slot/);
  });
  await t.test('frontend creates and retrieves a trimmed persistent profile', async () => {
    created = await db.createProfile(valid);
    assert.equal(created.first_name, 'Test Student');
    assert.equal(created.goal, 'Study together');
    assert.equal(created.user_id, owner.user.id);
    assert.ok((await db.listProfiles()).some(item => item.id === created.id));
  });
  await t.test('repeat submissions cannot create duplicate profiles', async () => {
    const login = await request('/api/session', { method: 'POST', body: { email: 'test.student@mmdc.mcl.edu.ph', password: 'test-password-123' } });
    const result = await request('/api/profiles', { method: 'POST', token: login.body.token, body: valid });
    assert.equal(result.status, 409);
    assert.equal((await db.listProfiles()).filter(item => item.user_id === owner.user.id).length, 1);
  });
  await t.test('owner can edit, while another account cannot edit or delete', async () => {
    const updated = await db.createProfile({ ...valid, goal: 'Updated study goal' });
    assert.equal(updated.id, created.id);
    assert.equal(updated.goal, 'Updated study goal');
    other = (await request('/api/accounts', { method: 'POST', body: { email: 'other.student@mmdc.mcl.edu.ph', password: 'other-password-123' } })).body;
    assert.equal((await request(`/api/profiles/${created.id}`, { method: 'PUT', token: other.token, body: { ...valid, user_id: other.user.id } })).status, 403);
    assert.equal((await request(`/api/profiles/${created.id}`, { method: 'DELETE', token: other.token })).status, 403);
    assert.equal((await request(`/api/profiles/${created.id}`, { method: 'DELETE', token: owner.user.id })).status, 401);
  });
  await t.test('concurrent submissions produce one profile and no lost data', async () => {
    const responses = await Promise.all([1, 2].map(() => request('/api/profiles', { method: 'POST', token: other.token, body: valid })));
    assert.deepEqual(responses.map(item => item.status).sort(), [201, 409]);
    assert.equal((await db.listProfiles()).length, 3);
  });
  await t.test('private files and hashes are not exposed as static assets', async () => {
    for (const route of ['/data.js', '/storage/mbuddy.json', '/server.js', '/package.json']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await request('/api/missing')).status, 404);
    const file = await fs.readFile(dataFile, 'utf8');
    assert.ok(!file.includes('test-password-123'));
    assert.ok(!file.includes('test.student@mmdc.mcl.edu.ph'));
    assert.ok(!JSON.stringify((await request('/api/profiles')).body).includes('passwordHash'));
  });
  await t.test('accounts and edited profiles remain after a real server restart', async () => {
    await stop();
    await start();
    assert.equal((await request('/api/profiles', { method: 'POST', token: other.token, body: valid })).status, 401);
    db = await adapter();
    await db.signIn('test.student@mmdc.mcl.edu.ph', 'test-password-123');
    assert.equal((await db.listProfiles()).find(item => item.id === created.id).goal, 'Updated study goal');
    await db.deleteProfile(created.id);
    assert.ok(!(await db.listProfiles()).some(item => item.id === created.id));
    await db.signOut();
  });
  await t.test('administrator can delete another profile but cannot edit it', async () => {
    await stop();
    const contents = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    const admin = contents.users.find(item => item.id === 'user-edward-basilonia');
    admin.emailHash = crypto.createHash('sha256').update('admin.test@mmdc.mcl.edu.ph').digest('hex');
    admin.passwordSalt = crypto.randomBytes(16).toString('hex');
    admin.passwordHash = crypto.pbkdf2Sync('test-admin-password', Buffer.from(admin.passwordSalt, 'hex'), 120000, 32, 'sha256').toString('hex');
    await fs.writeFile(dataFile, JSON.stringify(contents));
    await start();
    // Synthetic password in an isolated test store; no real demo credential is committed.
    const result = await request('/api/session', { method: 'POST', body: { email: 'admin.test@mmdc.mcl.edu.ph', password: 'test-admin-password' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.isAdmin, true);
    const target = (await request('/api/profiles')).body.find(item => item.user_id === other.user.id);
    assert.equal((await request(`/api/profiles/${target.id}`, { method: 'PUT', token: result.body.token, body: valid })).status, 403);
    assert.equal((await request(`/api/profiles/${target.id}`, { method: 'DELETE', token: result.body.token })).status, 204);
    assert.equal((await request('/api/profiles')).body.length, 1);
  });
});

