import { DEPARTMENTS, OFFICES } from './rules.mjs';

export function emptyCandidateSlate() {
  return [
    ...OFFICES.filter(([id]) => id !== 'vice-president').map(([id,title]) => ({id,title,scope:'general',candidates:[]})),
    ...Object.entries(DEPARTMENTS).map(([department,short]) => ({id:`vice-president-${short.toLowerCase()}`,title:`Vice President — ${department}`,scope:'department',department,candidates:[]})),
  ];
}

const acceptable = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
export function validateCandidateSlate(value) {
  const expected = emptyCandidateSlate();
  if (!Array.isArray(value) || value.length !== expected.length) throw new Error('All twelve departmental and association-wide contests are required.');
  const ids = new Set(), candidateIds = new Set();
  const normalized = value.map(p => {
    if (!p || typeof p !== 'object' || !acceptable(p.id,1,80) || ids.has(p.id)) throw new Error('Invalid or duplicate position.');
    ids.add(p.id);
    const reference=expected.find(e=>e.id===p.id);
    if (!reference || reference.scope!==p.scope || reference.department!==p.department || reference.title!==p.title) throw new Error('Position scope or department cannot be edited.');
    if (!Array.isArray(p.candidates) || p.candidates.length > 20) throw new Error(`Too many candidates for ${p.title}.`);
    return {...reference,candidates:p.candidates.map(c=>{
      if (!c || !/^cand-[a-z0-9-]{8,70}$/.test(c.id||'') || candidateIds.has(c.id)) throw new Error('Candidate IDs must be unique and use the editor-generated format.');
      candidateIds.add(c.id);
      if (!acceptable(c.name,3,120) || /^(demo|placeholder|tbd|candidate\s*[ab])$/i.test(c.name.trim())) throw new Error('Enter each candidate\'s real approved name.');
      const tagline = c.tagline == null ? '' : c.tagline;
      if (typeof tagline!=='string'||tagline.length>180)throw new Error('Candidate tagline must be 180 characters or fewer.');
      const photoUrl = c.photoUrl == null ? '' : c.photoUrl;
      if (typeof photoUrl!=='string'||photoUrl.length>400||(photoUrl && !/^https:\/\/[^\s]+$/i.test(photoUrl)))throw new Error('Candidate photo must be a valid HTTPS URL.');
      // Names are displayed as text in React. Only explicitly approved fields are retained.
      return {id:c.id,name:c.name.trim(),tagline:tagline.trim(),photoUrl:photoUrl.trim(),...(reference.department?{department:reference.department}:{})};
    })};
  });
  if (ids.size!==expected.length || expected.some(e=>!ids.has(e.id))) throw new Error('Missing required position.');
  return expected.map(e=>normalized.find(p=>p.id===e.id));
}

export function isAdminRequestAuthorized(claims) {
  if (!claims || claims.token_use!=='access' || typeof claims.sub!=='string' || !claims.sub.trim()) return false;
  const raw=claims['cognito:groups'];
  const groups=Array.isArray(raw)?raw:typeof raw==='string'?(raw.startsWith('[')?(()=>{try{return JSON.parse(raw);}catch{return [];}})():raw.split(',')):[];
  return Array.isArray(groups) && groups.includes('ElectionManagers');
}
