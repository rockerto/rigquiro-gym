/* Per-set targets (`rows` on a routine exercise) are invisible to a client built before they
   existed: saving that exercise's settings there rewrites it as flat sets × reps × weight, and
   the next push would erase the pyramid from the account. A push that does not declare it knows
   `rows` keeps the ones the server already holds; one that does is taken as written, so removing
   them on purpose still works. Real server.js in a child. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');

function mintSession(uid, sv = 0) {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}
const headers = uid => ({ Cookie: `gymsid=${mintSession(uid)}`, 'Content-Type': 'application/json' });

const freePort = () => new Promise(r => {
  const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
});

async function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-rows-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: 'u_rows_1', name: 'One', created: new Date().toISOString() }], creds: [], subs: [], invites: []
  }));
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost' }
  });
  const h = { api: `http://127.0.0.1:${port}`, log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    try { up = (await fetch(`${h.api}/api/health`)).ok; } catch { /* not up yet */ }
    if (!up) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(up, `server never came up:\n${h.log}`);
  return h;
}


const PYRAMID = [{ w: 20, r: 12 }, { w: 30, r: 9 }, { w: 40, r: 7 }];
const doc = ex => ({ unit: 'kg', workouts: [], routines: [{ id: 'tue', name: 'Martes', ex }] });

test('PUT /api/data: a client that does not know per-set targets cannot erase them', async t => {
  const h = await startServer(t);
  const uid = 'u_rows_1';
  const put = async body => { const r = await fetch(`${h.api}/api/data`, { method: 'PUT', headers: headers(uid), body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const onDisk = () => JSON.parse(fs.readFileSync(path.join(h.dataDir, `state-${uid}.json`), 'utf8'));
  const press = (extra = {}) => ({ id: 'press', sets: 3, reps: 12, weight: 20, ...extra });

  let r = await put({ state: doc([press({ rows: PYRAMID }), { id: 'curl', sets: 4, reps: 5, weight: 40 }]), caps: ['rows'] });
  assert.equal(r.status, 200);

  // The old phone saves the press settings (rows gone, a different flat target) and pushes.
  r = await put({ state: doc([press({ sets: 5, weight: 25 }), { id: 'curl', sets: 4, reps: 6, weight: 40 }]), baseRev: r.body.rev });
  assert.equal(r.status, 200);
  let ex = onDisk().routines[0].ex;
  assert.deepEqual(ex[0].rows, PYRAMID, 'the pyramid survives the old client');
  assert.equal(ex[0].weight, 25, 'what the old client could express is still taken');
  assert.equal(ex[1].reps, 6);
  assert.equal(ex[1].rows, undefined, 'nothing is invented for an exercise that never had rows');

  // A current client removes the rows on purpose ("same target for every set").
  r = await put({ state: doc([press(), { id: 'curl', sets: 4, reps: 6, weight: 40 }]), baseRev: r.body.rev, caps: ['rows'] });
  assert.equal(r.status, 200);
  assert.equal(onDisk().routines[0].ex[0].rows, undefined);

  // Exercises are matched by routine, id and occurrence: a second press in the same routine
  // keeps its own rows, and a routine the old client deleted is not brought back.
  r = await put({ state: { unit: 'kg', workouts: [], routines: [{ id: 'tue', ex: [press({ rows: PYRAMID }), press({ rows: [{ w: 50, r: 6 }] })] }, { id: 'wed', ex: [press({ rows: PYRAMID })] }] }, baseRev: r.body.rev, caps: ['rows'] });
  r = await put({ state: { unit: 'kg', workouts: [], routines: [{ id: 'tue', ex: [press(), press()] }] }, baseRev: r.body.rev });
  assert.equal(r.status, 200);
  const d = onDisk();
  assert.deepEqual(d.routines[0].ex.map(e => e.rows), [PYRAMID, [{ w: 50, r: 6 }]]);
  assert.deepEqual(d.routines.map(x => x.id), ['tue']);
});
