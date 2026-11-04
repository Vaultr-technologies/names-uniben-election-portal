import { makePreviewBallot, previewElection, previewVoters } from './demo';

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const API_CONFIGURED = DEMO_MODE || Boolean(API_BASE);

export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const localSessions = new Map(); // demo only; does not survive a page reload
const demoReceipts = new Map();
const sleep = (ms=220) => new Promise((resolve)=>setTimeout(resolve, ms));
function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'demo-' + String(Date.now());
}

async function request(path, { method = 'GET', body, token, signal } = {}) {
  if (!API_BASE) throw new ApiError('The secure voting service is not connected. Please try again later.', 503, 'NOT_CONFIGURED');
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type':'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the voting service. Check your internet connection and try again.', 0, 'NETWORK_ERROR');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.message || 'The request could not be completed.', response.status, payload.code || 'REQUEST_FAILED');
  }
  return payload;
}

export async function getElection() {
  if (DEMO_MODE) { await sleep(); return previewElection; }
  return request('/election');
}

// The backend initiates Google OAuth, checks state/PKCE and Google claims, then
// redirects to the frontend with a SHORT-LIVED, SINGLE-USE `login_code`.
// It must NOT put long-lived tokens in a URL.
export function getGoogleLoginUrl() {
  if (!API_BASE) throw new ApiError('Secure Google sign-in is not yet configured.', 503);
  return `${API_BASE}/auth/google/start`;
}

export async function exchangeGoogleCode(code) {
  if (DEMO_MODE) throw new ApiError('Google sign-in is not used in preview mode.');
  return request('/auth/google/exchange', { method: 'POST', body: { code } });
}

export async function requestOtp(identifier, identifierType) {
  if (DEMO_MODE) throw new ApiError('Select a demonstration voter instead.');
  return request('/auth/email/request', { method:'POST', body: { identifier, identifierType } });
}
export async function verifyOtp(challengeId, code) {
  if (DEMO_MODE) throw new ApiError('Select a demonstration voter instead.');
  return request('/auth/email/verify', { method:'POST', body: { challengeId, code } });
}
export async function getMe(token) {
  if (DEMO_MODE) { await sleep(); return localSessions.get(token) || null; }
  return request('/voter/me', { token });
}
export async function getBallot(token) {
  if (DEMO_MODE) {
    await sleep();
    const voter = localSessions.get(token);
    if (!voter) throw new ApiError('Preview session has expired. Start again.', 401);
    return makePreviewBallot(voter);
  }
  return request('/voter/ballot', { token });
}
export async function castVote(token, selections, idempotencyKey) {
  if (DEMO_MODE) {
    await sleep(480);
    const voter = localSessions.get(token);
    if (!voter) throw new ApiError('Preview session has expired.', 401);
    if (voter.hasVoted) throw new ApiError('This demonstration voter already submitted a ballot.', 409, 'ALREADY_VOTED');
    const ballot = makePreviewBallot(voter);
    if (ballot.positions.some((p) => !selections.some((s) => s.positionId === p.id && p.candidates.some((c) => c.id === s.candidateId))) || selections.length !== ballot.positions.length) {
      throw new ApiError('Complete each position before submitting.', 422);
    }
    const receiptId = `PREVIEW-${makeId().slice(0,8).toUpperCase()}`;
    const record = { status:'accepted', receiptId, submittedAt: new Date().toISOString(), demo:true };
    demoReceipts.set(token, record);
    localSessions.set(token, {...voter, hasVoted:true});
    return record;
  }
  return request('/vote', { method:'POST', body: { selections, idempotencyKey }, token });
}
export async function getVoteStatus(token) {
  if (DEMO_MODE) { await sleep(); return demoReceipts.get(token) || {status:'not_submitted'}; }
  return request('/voter/vote-status', { token });
}
export async function logout(token) {
  if (DEMO_MODE) { localSessions.delete(token); return; }
  try { await request('/auth/logout', { method: 'POST', token }); } catch { /* Always clear client session */ }
}
export async function previewSignIn(voterId) {
  if (!DEMO_MODE) throw new ApiError('Demonstration sign-in is not available.');
  const voter = previewVoters.find((v) => v.id === voterId);
  if (!voter) throw new ApiError('Unknown demonstration voter.');
  await sleep();
  const accessToken = makeId();
  localSessions.set(accessToken, {...voter});
  return { accessToken, voter: {...voter} };
}
