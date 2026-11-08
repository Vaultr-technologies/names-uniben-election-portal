// DEVELOPMENT-ONLY server with fake, unauthenticated demo login. Never expose publicly.
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ElectionError, eligiblePositions, digestManifest } from '../core/election.mjs';
import { LocalElectionStore } from './store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const load = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const manifest = load('fixtures/manifest.json');
const voters = load('fixtures/voters.json');
const allowOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

export function createLocalApi({ store }) {
  const sessions = new Map();
  return http.createServer(async (req, res) => {
    const send = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(obj));
    };
    const origin = req.headers.origin;
    if (origin && allowOrigins.has(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      res.setHeader('access-control-allow-headers', 'Content-Type,Authorization');
    } else if (origin) {
      return send(403, { error: 'ORIGIN_REJECTED' });
    }
    if (req.method === 'OPTIONS') return send(204, {});
    try {
      let body = {};
      if (req.method === 'POST') {
        let data = '';
        for await (const chunk of req) {
          data += chunk;
          if (data.length > 16384) throw new ElectionError('Request too large', 413);
        }
        try { body = JSON.parse(data || '{}'); }
        catch { throw new ElectionError('Invalid JSON body'); }
      }
      const path = new URL(req.url || '/', 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/health') return send(200, { ok: true, mode: 'LOCAL_DEMO_ONLY', electionId: store.manifest.electionId });
      if (req.method === 'POST' && path === '/api/dev/login') {
        if (typeof body.voterId !== 'string') throw new ElectionError('Supply a demo voterId');
        const voter = store.getVoter(body.voterId);
        if (!voter) throw new ElectionError('Unknown demo voter', 403, 'NOT_ELIGIBLE');
        const token = randomBytes(32).toString('hex');
        sessions.set(token, { voterId: voter.id, expiresAt: Date.now() + 60 * 60 * 1000 });
        return send(200, { token, voter });
      }
      const auth = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
      const session = auth && sessions.get(auth[1]);
      if (!session || session.expiresAt < Date.now()) throw new ElectionError('Demo login required', 401, 'NOT_AUTHENTICATED');
      const voter = store.getVoter(session.voterId);
      if (!voter) throw new ElectionError('Not eligible', 403, 'NOT_ELIGIBLE');
      if (req.method === 'GET' && path === '/api/me') return send(200, voter);
      if (req.method === 'GET' && path === '/api/ballot') {
        return send(200, { electionId: store.manifest.electionId, manifestSha256: digestManifest(store.manifest), status: store.manifest.status, department: voter.department, hasVoted: voter.hasVoted, positions: eligiblePositions(store.manifest, voter.department) });
      }
      if (req.method === 'POST' && path === '/api/votes') {
        return send(201, store.cast(voter.id, body.selections));
      }
      if (req.method === 'GET' && path === '/api/demo/results') return send(200, store.demoResults());
      return send(404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = error instanceof ElectionError ? error.status : 500;
      // Avoid logging voter choices, token or request body.
      if (status === 500) console.error('Local API internal error:', error.message);
      return send(status, { error: error instanceof ElectionError ? error.code : 'SERVER_ERROR', message: status === 500 ? 'Unexpected error' : error.message });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw new Error('Local demo server MUST NOT run in production');
  const dbPath = resolve(root, '.local/demo.sqlite');
  mkdirSync(dirname(dbPath), { recursive: true });
  const store = new LocalElectionStore({ databasePath: dbPath, manifest, voters });
  const server = createLocalApi({ store });
  const port = Number(process.env.PORT || 8787);
  server.listen(port, '127.0.0.1', () => {
    console.log(`LOCAL SIMULATION ONLY: http://127.0.0.1:${port}`);
    console.log('Dummy voter IDs are listed in fixtures/voters.json');
    console.log('Do not use real student information or expose this port publicly.');
  });
}
