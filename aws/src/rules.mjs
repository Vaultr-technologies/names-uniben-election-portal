export const DEPARTMENTS = Object.freeze({
  'Marine Engineering': 'MRE',
  'Mechanical Engineering': 'MEE',
  'Mechatronics Engineering': 'MTE',
});

export const OFFICES = Object.freeze([
  ['president', 'President'],
  ['vice-president', 'Vice President'],
  ['secretary-general', 'Secretary General'],
  ['assistant-secretary-general', 'Assistant Secretary General'],
  ['public-relations-officer', 'Public Relations Officer'],
  ['assistant-pro', 'Assistant PRO'],
  ['director-of-finance', 'Director of Finance'],
  ['director-of-social', 'Director of Social'],
  ['director-of-welfare', 'Director of Welfare'],
  ['director-of-sports', 'Director of Sports'],
]);

export function normalizeIdentifier(input) {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
}
export function normalizeEmail(input) {
  return String(input ?? '').trim().toLowerCase();
}
export function toVoterKey(type, identifier) {
  if (!['matric', 'registration'].includes(type)) throw new Error('Invalid student identification type');
  const normalized = normalizeIdentifier(identifier);
  if (!/^[A-Z0-9/\-]{4,48}$/.test(normalized)) throw new Error('Invalid student identification number');
  return `${type.toUpperCase()}#${normalized}`;
}
export function getStatus(config, nowISO = new Date().toISOString()) {
  if (!config || config.status !== 'open') return config?.status === 'closed' ? 'closed' : 'upcoming';
  if (nowISO < config.startsAt) return 'upcoming';
  if (nowISO >= config.endsAt) return 'closed';
  return 'open';
}
export function ballotFor(config, voter) {
  if (!DEPARTMENTS[voter?.department]) throw new Error('Unknown verified department');
  if (!config || !Array.isArray(config.positions)) throw new Error('Missing election configuration');
  const positions = config.positions.filter(p => p.scope === 'general' || (p.scope === 'department' && p.department === voter.department));
  if (positions.some(p => !Array.isArray(p.candidates) || p.candidates.length < 1)) throw new Error('Unconfigured ballot');
  return positions;
}
export function validateSelections(config, voter, selections) {
  const positions = ballotFor(config, voter);
  if (!Array.isArray(selections) || selections.length !== positions.length) throw new Error('One selection required per eligible position');
  const ids = new Set();
  for (const s of selections) {
    if (!s || typeof s.positionId !== 'string' || typeof s.candidateId !== 'string') throw new Error('Invalid ballot selection');
    if (ids.has(s.positionId)) throw new Error('Duplicate position');
    ids.add(s.positionId);
    const p = positions.find(p => p.id === s.positionId);
    if (!p || !p.candidates.some(c => c.id === s.candidateId)) throw new Error('Ineligible candidate or position');
  }
  return positions;
}
export function validateElection(config) {
  if (!config || !Array.isArray(config.positions) || !Number.isInteger(config.version)) throw new Error('Invalid election configuration');
  if (!['draft','open','closed'].includes(config.status)) throw new Error('Invalid election status');
  if (!Number.isFinite(Date.parse(config.startsAt)) || !Number.isFinite(Date.parse(config.endsAt)) || config.startsAt >= config.endsAt || !/Z$/.test(config.startsAt) || !/Z$/.test(config.endsAt)) throw new Error('Invalid election date window; use UTC timestamps ending in Z');
  const general = config.positions.filter(p => p.scope === 'general');
  const vp = config.positions.filter(p => p.scope === 'department');
  const expectedGeneral = OFFICES.filter(p => p[0]!=='vice-president').map(p=>p[0]);
  if (general.length !== expectedGeneral.length || !expectedGeneral.every(id => general.some(p=>p.id===id))) throw new Error('All nine general offices are required');
  if (vp.length !== 3 || !Object.keys(DEPARTMENTS).every(d => vp.some(p=>p.id === `vice-president-${DEPARTMENTS[d].toLowerCase()}` && p.department === d))) throw new Error('Each department must have exactly one VP contest');
  // Election imports must not reassign offices or departmental VP eligibility.
  for(const [id,title] of OFFICES){
    if(id==='vice-president'){
      for(const [department,short] of Object.entries(DEPARTMENTS)){
        const p=vp.find(v=>v.id===`vice-president-${short.toLowerCase()}`);
        if(!p || p.title!==`Vice President — ${department}` || p.department!==department)throw new Error('Incorrect department VP definition');
      }
    }else{
      const p=general.find(v=>v.id===id);
      if(!p || p.title!==title || p.department)throw new Error('Incorrect association-wide office definition');
    }
  }
  const positionIds = new Set();
  const candidateIds = new Set();
  for (const p of config.positions) {
    if (positionIds.has(p.id)) throw new Error('Repeated position ID');
    positionIds.add(p.id);
    if (!Array.isArray(p.candidates) || !p.candidates.length) throw new Error(`Missing candidates for ${p.id}`);
    for (const c of p.candidates) {
      if (!c.id || !c.name || /demo|placeholder|tbd/i.test(c.name)) throw new Error(`Invalid or placeholder candidate for ${p.id}`);
      if (candidateIds.has(c.id)) throw new Error('Candidate IDs must be globally unique');
      candidateIds.add(c.id);
    }
  }
  return true;
}
