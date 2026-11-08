import { createHash } from 'node:crypto';

export const DEPARTMENTS = new Set(['mechanical', 'mechatronics', 'marine']);

export class ElectionError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.name = 'ElectionError';
    this.status = status;
    this.code = code;
  }
}

export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new ElectionError('Invalid manifest');
  if (typeof manifest.electionId !== 'string' || !/^[a-z0-9_-]{4,80}$/i.test(manifest.electionId)) throw new ElectionError('Invalid election ID');
  if (!['open', 'closed'].includes(manifest.status)) throw new ElectionError('Election must be open or closed');
  if (!Array.isArray(manifest.positions) || manifest.positions.length === 0) throw new ElectionError('Missing positions');
  const seenPositions = new Set();
  for (const position of manifest.positions) {
    if (!position || typeof position.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(position.id) || seenPositions.has(position.id)) throw new ElectionError('Invalid or duplicated position');
    seenPositions.add(position.id);
    if (!(position.scope === 'all' || DEPARTMENTS.has(position.scope))) throw new ElectionError('Unrecognised position scope');
    if (typeof position.name !== 'string' || !position.name.trim()) throw new ElectionError('Position missing name');
    if (!Array.isArray(position.candidates) || !position.candidates.length) throw new ElectionError('Missing candidates');
    const seenCandidates = new Set();
    for (const candidate of position.candidates) {
      if (!candidate || typeof candidate.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(candidate.id) || seenCandidates.has(candidate.id)) throw new ElectionError('Invalid or duplicated candidate');
      if (typeof candidate.name !== 'string' || !candidate.name.trim()) throw new ElectionError('Candidate missing name');
      seenCandidates.add(candidate.id);
    }
  }
  return manifest;
}

export function digestManifest(manifest) {
  validateManifest(manifest);
  return createHash('sha256').update(canonicalJSON(manifest)).digest('hex');
}

export function eligiblePositions(manifest, department) {
  validateManifest(manifest);
  if (!DEPARTMENTS.has(department)) throw new ElectionError('Unknown department');
  return manifest.positions.filter(p => p.scope === 'all' || p.scope === department);
}

export function validateBallot(manifest, department, selections) {
  const offices = eligiblePositions(manifest, department);
  if (!selections || Array.isArray(selections) || typeof selections !== 'object') throw new ElectionError('Selections must be an object');
  const keys = Object.keys(selections);
  if (keys.length !== offices.length) throw new ElectionError('Missing or extra position selections');
  const expected = new Set(offices.map(p => p.id));
  if (keys.some(key => !expected.has(key))) throw new ElectionError('Ineligible position selection');
  const normalized = {};
  for (const position of offices) {
    const chosen = selections[position.id];
    if (typeof chosen !== 'string' || !position.candidates.some(c => c.id === chosen)) throw new ElectionError(`Invalid candidate for ${position.id}`);
    normalized[position.id] = chosen;
  }
  return normalized;
}

export function recount(manifest, ballots) {
  validateManifest(manifest);
  if (!Array.isArray(ballots)) throw new ElectionError('Invalid ballot snapshot');
  const totals = Object.fromEntries(manifest.positions.map(p => [p.id, Object.fromEntries(p.candidates.map(c => [c.id, 0]))]));
  const seen = new Set();
  for (const ballot of ballots) {
    if (typeof ballot.ballotId !== 'string' || ballot.ballotId.length < 8 || seen.has(ballot.ballotId)) throw new ElectionError('Duplicate/invalid ballot ID');
    if (ballot.electionId !== manifest.electionId || !DEPARTMENTS.has(ballot.department)) throw new ElectionError('Invalid ballot election/department');
    seen.add(ballot.ballotId);
    const choices = validateBallot(manifest, ballot.department, ballot.selections);
    for (const [position, candidate] of Object.entries(choices)) totals[position][candidate]++;
  }
  return { electionId: manifest.electionId, manifestSha256: digestManifest(manifest), acceptedBallots: ballots.length, totals };
}
