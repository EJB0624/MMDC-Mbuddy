const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const pbkdf2 = promisify(crypto.pbkdf2);
const ROOT = __dirname;

function failure(status, message) {
  return Object.assign(new Error(message), { status });
}

async function loadScript(filename, key) {
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(ROOT, filename), 'utf8'), context);
  return JSON.parse(JSON.stringify(context.window[key]));
}

async function passwordHash(password, salt) {
  // Match the original classroom demo hash, including its legacy salt format.
  const saltBytes = Buffer.from(salt.match(/.{2}/g).join(''), 'hex');
  return (await pbkdf2(password, saltBytes, 120000, 32, 'sha256')).toString('hex');
}

async function createApp({ dataFile = path.join(ROOT, 'storage', 'mbuddy.json') } = {}) {
  const seed = await loadScript('data.js', 'MBUDDY_DATA');
  const curricula = await loadScript('courses.js', 'MBUDDY_CURRICULA');
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  let data;
  try {
    data = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    if (!Array.isArray(data.users) || !Array.isArray(data.profiles)) throw new Error('Invalid MBuddy storage file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = { users: seed.users, profiles: seed.profiles };
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2), { flag: 'wx' });
  }
  // Serialize writes, publish changes only after an atomic file replacement succeeds.
  let pending = Promise.resolve();
  function mutate(change) {
    const work = pending.then(async () => {
      const next = structuredClone(data);
      const result = change(next);
      const temporary = `${dataFile}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(next, null, 2));
      await fs.rename(temporary, dataFile);
      data = next;
      return result;
    });
    pending = work.catch(() => {});
    return work;
  }

  const sessions = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  function identity(body = {}) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;
    if (!/^[^\s@]+@mmdc\.mcl\.edu\.ph$/.test(email)) throw failure(400, 'Use your MMDC email');
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      throw failure(400, 'Password must contain 6 to 128 characters');
    }
    return { email, password, emailHash: crypto.createHash('sha256').update(email).digest('hex') };
  }

  function session(user, email) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 8 * 60 * 60 * 1000;
    for (const [key, value] of sessions) if (value.expires <= Date.now()) sessions.delete(key);
    sessions.set(token, { userId: user.id, expires });
    return { token, user: { id: user.id, email }, isAdmin: seed.adminUserIds.includes(user.id) };
  }

  function requireUser(req, res, next) {
    const token = req.get('Authorization')?.replace(/^Bearer /, '');
    const current = sessions.get(token);
    if (!current || current.expires <= Date.now()) {
      sessions.delete(token);
      return next(failure(401, 'Sign in to continue'));
    }
    req.userId = current.userId;
    req.token = token;
    next();
  }

  function validateProfile(body = {}) {
    function text(key, max) {
      if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > max) {
        throw failure(400, `${key === 'first_name' ? 'Name' : 'Study goal'} must contain 1 to ${max} characters`);
      }
      return body[key].trim();
    }
    const first_name = text('first_name', 80);
    const goal = text('goal', 300);
    const course = body.course_specialization;
    if (!Object.hasOwn(curricula, course)) throw failure(400, 'Choose a valid course and specialization');
    if (![1, 2, 3, 4].includes(body.year_level) || ![1, 2, 3].includes(body.term)) throw failure(400, 'Choose a valid year and term');
    if (!['Morning', 'Afternoon', 'Evening', 'Flexible'].includes(body.work_style)) throw failure(400, 'Choose a preferred work time');
    if (!Array.isArray(body.classes) || !body.classes.length || body.classes.length > 8) throw failure(400, 'Add 1 to 8 classes');
    const allowed = new Set(curricula[course].map(([code, title]) => `${code} - ${title}`));
    const seen = new Set();
    for (const entry of body.classes) {
      if (typeof entry !== 'string' || !/ - [AHS]$/.test(entry) || !allowed.has(entry.slice(0, -4))) throw failure(400, 'Choose classes from your specialization with an A, H, or S time slot');
      const name = entry.slice(0, -4);
      if (seen.has(name)) throw failure(400, 'A class can only be added once');
      seen.add(name);
    }
    return { first_name, goal, course_specialization: course, year_level: body.year_level, term: body.term, work_style: body.work_style, classes: [...body.classes], time_slot: null };
  }

  app.post('/api/accounts', async (req, res) => {
    const credentials = identity(req.body);
    const salt = crypto.randomBytes(16).toString('hex');
    const user = { id: `user-${crypto.randomUUID()}`, emailHash: credentials.emailHash, passwordSalt: salt, passwordHash: await passwordHash(credentials.password, salt) };
    await mutate(next => {
      if (next.users.some(item => item.emailHash === user.emailHash)) throw failure(409, 'An account with this email already exists');
      next.users.push(user);
    });
    res.status(201).json(session(user, credentials.email));
  });
  app.post('/api/session', async (req, res) => {
    const credentials = identity(req.body);
    const user = data.users.find(item => item.emailHash === credentials.emailHash);
    const salt = user?.passwordSalt || '00000000000000000000000000000000';
    const actual = await passwordHash(credentials.password, salt);
    if (!user || actual !== user.passwordHash) throw failure(401, 'Incorrect email or password');
    res.json(session(user, credentials.email));
  });
  app.delete('/api/session', requireUser, (req, res) => {
    sessions.delete(req.token);
    res.status(204).end();
  });
  app.get('/api/profiles', (req, res) => res.json([...data.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at))));
  app.post('/api/profiles', requireUser, async (req, res) => {
    const profile = { ...validateProfile(req.body), id: `profile-${crypto.randomUUID()}`, user_id: req.userId, created_at: new Date().toISOString() };
    await mutate(next => {
      if (next.profiles.some(item => item.user_id === req.userId)) throw failure(409, 'You already have a profile. Edit it instead');
      next.profiles.push(profile);
    });
    res.status(201).json(profile);
  });
  app.put('/api/profiles/:id', requireUser, async (req, res) => {
    const fields = validateProfile(req.body);
    const updated = await mutate(next => {
      const profile = next.profiles.find(item => item.id === req.params.id);
      if (!profile) throw failure(404, 'Profile could not be found');
      if (profile.user_id !== req.userId) throw failure(403, 'You can only edit your own profile');
      Object.assign(profile, fields, { updated_at: new Date().toISOString() });
      return profile;
    });
    res.json(updated);
  });
  app.delete('/api/profiles/:id', requireUser, async (req, res) => {
    await mutate(next => {
      const profile = next.profiles.find(item => item.id === req.params.id);
      if (!profile) throw failure(404, 'Profile could not be found');
      if (profile.user_id !== req.userId && !seed.adminUserIds.includes(req.userId)) throw failure(403, 'You cannot delete this profile');
      next.profiles = next.profiles.filter(item => item.id !== profile.id);
    });
    res.status(204).end();
  });
  app.use('/api', (req, res, next) => next(failure(404, 'API endpoint could not be found')));
  // Serve only public assets, never storage files, server source, or demo hashes.
  for (const file of ['index.html', 'styles.css', 'script.js', 'object-store.js', 'courses.js', 'mbuddy-logo.png']) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (req, res) => res.sendFile(path.join(ROOT, file)));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Could not save or load data. Please try again' : error.type === 'entity.parse.failed' ? 'Send valid JSON' : error.message });
  });
  return app;
}

if (require.main === module) {
  createApp().then(app => app.listen(Number(process.env.PORT) || 3000, process.env.HOST || '127.0.0.1', () => console.log('MBuddy is running at http://localhost:3000'))).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { createApp };
