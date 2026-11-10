import React, {useEffect,useRef,useState} from 'react';
import {ArrowLeft,CheckCircle2,ClipboardList,Download,LockKeyhole,LogIn,LogOut,Plus,RefreshCw,Save,ShieldCheck,Trash2,UsersRound} from 'lucide-react';
import {adminConfigured,adminLogout,adminRequest,finishAdminLogin,startAdminLogin} from './lib/admin-auth.js';

const makeCandidate=()=>({id:`cand-${crypto.randomUUID()}`,name:'',tagline:'',photoUrl:''});
const countCandidates=positions=>(positions||[]).reduce((n,p)=>n+(p.candidates?.length||0),0);
const candidateLabel=p=>p.scope==='department'?'Departmental':'Association-wide';
function exportDraft(positions,revision,sha256){
  const data={kind:'NAMES_ELECO_CANDIDATE_DRAFT',revision,sha256,reviewRequired:true,positions};
  const objectUrl=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=objectUrl;a.download=`names-eleco-candidates-review-r${revision}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),500);
}

// Uses the protected AWS admin APIs. No local status toggle or direct DynamoDB edits.
// The Lambda performs the authoritative status, approval, window, and audit checks.
const approvalPattern = /^[\w .:/#-]{8,120}$/;
const lagosTime = value => {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not configured';
  return new Date(value).toLocaleString('en-NG', {timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'});
};

function ElectionControls({token}) {
  const [election,setElection]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [pendingAction,setPendingAction]=useState(null);
  const [approvalReference,setApprovalReference]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);

  const refresh=async()=>{
    setLoading(true);setError('');
    try { setElection(await adminRequest('/admin/election',token)); }
    catch(e) { setError(e.message||'Unable to retrieve election status.'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{refresh();},[token]);

  const configured=election?.configured===true;
  const storedStatus=election?.configuredStatus;
  const startsAt=Date.parse(election?.startsAt||'');
  const endsAt=Date.parse(election?.endsAt||'');
  const inWindow=Number.isFinite(startsAt)&&Number.isFinite(endsAt)&&Date.now()>=startsAt&&Date.now()<endsAt;
  const hasApprovedRegister=Boolean(election?.registerFinalized && Number.isSafeInteger(election?.eligibleCount) && election.eligibleCount>0);
  const canOpen=configured && storedStatus==='draft' && hasApprovedRegister && inWindow;
  // Closing is allowed for an open stored state even if the approved end time has passed.
  const canClose=configured && storedStatus==='open';
  const requiredPhrase=pendingAction==='open'?'OPEN ELECTION':'CLOSE ELECTION';
  const canConfirm=approvalPattern.test(approvalReference.trim()) && confirmation===requiredPhrase;
  const cancel=()=>{setPendingAction(null);setApprovalReference('');setConfirmation('');};
  const begin=action=>{
    if(busy||(action==='open'?!canOpen:!canClose))return;
    setError('');setFeedback('');setPendingAction(action);setApprovalReference('');setConfirmation('');
  };
  const submit=async()=>{
    if(busy||!pendingAction||!canConfirm||(pendingAction==='open'?!canOpen:!canClose))return;
    const action=pendingAction;
    const message=action==='open'
      ? 'This will enable real voting in the connected AWS environment. Continue only with recorded ELECO approval?'
      : 'Closing the election is irreversible through this interface. Further votes will be rejected. Continue only with recorded ELECO approval?';
    if(!window.confirm(message))return;
    setBusy(true);setError('');setFeedback('');
    try {
      const result=await adminRequest(`/admin/election/${action}`,token,{
        method:'POST',body:{approvalReference:approvalReference.trim(),confirmation:requiredPhrase}
      });
      cancel();
      await refresh();
      setFeedback(`Election ${result.status==='open'?'opened':'closed'} successfully. An audit entry was recorded by the backend.`);
    }catch(e){
      setError(e.message||'Unable to change election status. No change has been confirmed.');
      await refresh();
    }finally{setBusy(false);}
  };

  const statusLabel=!configured?'Not configured':storedStatus==='draft'?'Draft · voting disabled':
    storedStatus==='open'?(election?.status==='open'?'Voting open':'Voting window ended'):
    storedStatus==='closed'?'Closed · voting disabled':'Unknown state';

  return <div className="admin-work-card" aria-labelledby="election-controls-title">
    <div className="admin-card-head">
      <div>
        <div className="admin-eyebrow">SECURE ELECTION OPERATIONS</div>
        <h2 id="election-controls-title">Start / end voting</h2>
        <p>Controls use audited, Cognito-protected AWS endpoints. The backend, not the browser, decides whether voting is permitted.</p>
      </div>
      <button type="button" className="admin-secondary" disabled={busy||loading} onClick={refresh}><RefreshCw size={16}/> Refresh status</button>
    </div>
    {loading && <div className="admin-empty" role="status">Checking election status with AWS…</div>}
    {!loading && election && <>
      <div className="admin-notice" role="status"><ShieldCheck size={17}/> <strong>{statusLabel}</strong></div>
      <div className="admin-guide" style={{marginTop:14}}>
        <p><strong>Approved voting window (WAT):</strong> {lagosTime(election.startsAt)} – {lagosTime(election.endsAt)}</p>
        <p><strong>Final register:</strong> {election.registerFinalized?'Finalised':'Not finalised'} · <strong>Eligible voters:</strong> {Number.isSafeInteger(election.eligibleCount)?election.eligibleCount:'Not set'}</p>
        <p><strong>Last status change:</strong> {lagosTime(election.lastStatusChangedAt)}</p>
      </div>
      {!configured && <div className="admin-warning"><LockKeyhole size={18}/> No official election configuration has been imported. Starting and closing are unavailable. A candidate draft alone is not the official ballot.</div>}
      {configured && storedStatus==='draft' && !canOpen && <div className="admin-warning"><LockKeyhole size={18}/> Opening requires a finalised approved register, at least one eligible voter, and the current time to fall within the approved voting window. These conditions are enforced again by AWS.</div>}
      {configured && storedStatus==='closed' && <div className="admin-notice"><LockKeyhole size={17}/> This election is closed. It cannot be reopened using these controls.</div>}
      <div className="admin-toolbar" style={{marginTop:16,marginBottom:12}}>
        <button type="button" className="btn btn-primary" disabled={!canOpen||busy} onClick={()=>begin('open')}><CheckCircle2 size={16}/> Start election</button>
        <button type="button" className="admin-secondary" disabled={!canClose||busy} onClick={()=>begin('close')}><LockKeyhole size={16}/> End election</button>
      </div>
      {pendingAction && <div className="admin-work-card" style={{marginTop:14}}>
        <h3>{pendingAction==='open'?'Authorise election opening':'Authorise election closure'}</h3>
        <p>Use a genuine recorded ELECO approval reference. These actions change the connected AWS election state and are logged.</p>
        <label>ELECO approval reference
          <input value={approvalReference} maxLength={120} onChange={e=>setApprovalReference(e.target.value)} placeholder="Recorded approval reference (8–120 characters)" autoComplete="off"/>
        </label>
        <label>Type <strong>{requiredPhrase}</strong> exactly
          <input value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder={requiredPhrase} autoComplete="off"/>
        </label>
        <div className="admin-toolbar" style={{marginTop:12}}>
          <button type="button" className="btn btn-primary" disabled={!canConfirm||busy||loading} onClick={submit}>{busy?'Submitting…':`Confirm ${pendingAction==='open'?'opening':'closure'}`}</button>
          <button type="button" className="admin-secondary" disabled={busy} onClick={cancel}>Cancel</button>
        </div>
      </div>}
    </>}
    {error && <div className="admin-error" role="alert">{error}<button type="button" className="btn btn-text" onClick={refresh}><RefreshCw size={15}/> Retry</button></div>}
    {feedback && <div className="admin-good" role="status"><CheckCircle2 size={17}/>{feedback}</div>}
    <p className="admin-note">Before any public launch: verify the official slate and voter register, load test, audit voting-state enforcement, and obtain ELECO's documented approval. This control is not a launch-readiness check.</p>
  </div>;
}

export default function AdminPanel({onBack}){
  const [token,setToken]=useState(null);
  const [loading,setLoading]=useState(Boolean(adminConfigured));
  const [loadError,setLoadError]=useState('');
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [draft,setDraft]=useState(null);
  const [positions,setPositions]=useState([]);
  const [dirty,setDirty]=useState(false);
  const [selected,setSelected]=useState('president');
  const [section,setSection]=useState('candidates');
  const processed=useRef(false);
  const isLocked=draft?.locked||false;

  const load=async(t)=>{
    setLoading(true);setLoadError('');
    try{
      const data=await adminRequest('/admin/candidates',t);
      setDraft(data);setPositions(data.positions||[]);setSelected(id=>data.positions?.some(p=>p.id===id)?id:data.positions?.[0]?.id||'president');setDirty(false);
    }catch(e){setLoadError(e.status===403?'Your account is not in the ElectionManagers group. Ask Vaultr’s AWS administrator for access.':e.message);if(e.status===401)setToken(null);}
    finally{setLoading(false);}
  };
  useEffect(()=>{
    if(processed.current)return;
    processed.current=true;
    if(!adminConfigured){setLoading(false);return;}
    finishAdminLogin().then(t=>{
      if(t){setToken(t);return load(t);}
      setLoading(false);
    }).catch(e=>{setLoadError(e.message);setLoading(false);});
  },[]);
  const current=positions.find(p=>p.id===selected);
  const total=countCandidates(positions);
  const filled=positions.filter(p=>p.candidates?.length>0).length;
  const updatePosition=(id,fn)=>{setPositions(old=>old.map(p=>p.id===id?{...p,candidates:fn(p.candidates)}:p));setDirty(true);setFeedback('');};
  const addCandidate=id=>updatePosition(id,candidates=>[...candidates,makeCandidate()]);
  const updateCandidate=(id,cid,key,value)=>updatePosition(id,candidates=>candidates.map(c=>c.id===cid?{...c,[key]:value}:c));
  const removeCandidate=(id,cid)=>updatePosition(id,candidates=>candidates.filter(c=>c.id!==cid));
  const save=async()=>{
    if(!token||saving||isLocked)return;
    setSaving(true);setLoadError('');setFeedback('');
    try{
      const result=await adminRequest('/admin/candidates',token,{method:'PUT',body:{expectedRevision:draft.revision,positions}});
      setDraft(v=>({...v,revision:result.revision,updatedAt:result.updatedAt,sha256:result.sha256}));setDirty(false);setFeedback(`Draft revision ${result.revision} saved with an audit entry. It has NOT been published to voters.`);
    }catch(e){setLoadError(e.message);}
    finally{setSaving(false);}
  };
  return <main className="admin-page">
    <div className="admin-hero">
      <button className="admin-back" onClick={()=>{if(dirty&&!confirm('Discard your unsaved changes?'))return;onBack();}}><ArrowLeft size={15}/> Back to portal</button>
      <div className="overline">VAULTR TECHNOLOGIES · NAMES UNIBEN</div>
      <h1>Election <em>management.</em></h1>
      <p>Prepare candidate lists and manage election status with recorded ELECO approval. Drafts never change the live ballot automatically.</p>
      <div className="admin-badges"><span><ShieldCheck size={15}/> Administrator access required</span><span><LockKeyhole size={15}/> Not a public observer screen</span></div>
    </div>
    {!adminConfigured?<section className="admin-access"><LockKeyhole size={30}/><h2>Management panel not connected</h2><p>The admin Cognito login, client ID, callback URL and AWS API endpoint must be configured in the deployment environment. No candidate records are accessible here yet.</p><code>VITE_ADMIN_COGNITO_DOMAIN · VITE_ADMIN_CLIENT_ID · VITE_ADMIN_REDIRECT_URI · VITE_API_BASE_URL</code></section>
    : !token?<section className="admin-access"><LockKeyhole size={32}/><h2>Authorised staff only</h2><p>Unlike the public Situation Room, this screen changes election records. Sign in with your individually assigned ELECO management account and MFA.</p>{loadError&&<div className="admin-error" role="alert">{loadError}</div>}<button className="btn btn-primary" onClick={()=>startAdminLogin().catch(e=>setLoadError(e.message))}><LogIn size={17}/> Sign in with Cognito</button></section>
    : <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-side-title">MANAGEMENT <button title="Sign out" aria-label="Sign out" onClick={adminLogout}><LogOut size={16}/></button></div>
        <button className={`admin-section ${section==='candidates'?'selected':''}`} onClick={()=>setSection('candidates')}><ClipboardList size={17}/> Candidate drafts</button>
        <button className={`admin-section ${section==='voters'?'selected':''}`} onClick={()=>setSection('voters')}><UsersRound size={17}/> 100-level intake</button>
        <button className={`admin-section ${section==='election'?'selected':''}`} onClick={()=>setSection('election')}><LockKeyhole size={17}/> Election controls</button>
        {section==='candidates'&&<div className="admin-office-list">{positions.map(p=><button className={p.id===selected?'active':''} key={p.id} onClick={()=>setSelected(p.id)}><span>{p.title}</span><small>{p.candidates?.length||0}</small></button>)}</div>}
      </aside>
      <section className="admin-workspace">
        {loading?<div className="admin-empty">Loading the secured election records…</div>
        : section==='election'?<ElectionControls token={token}/>
        : loadError&&!draft?<div className="admin-error" role="alert">{loadError}<button className="btn btn-text" onClick={()=>load(token)}><RefreshCw size={15}/> Retry</button></div>
        : section==='voters'?<div className="admin-work-card"><div className="admin-card-head"><h2>100-level intake</h2><span className="admin-tag">Pending verification</span></div><p>Google Form responses are application records, <strong>not verified voters</strong>. Export the responses to CSV and use the private intake converter included with this update. ELECO must match students to the official register and verify their claimed email before marking any record approved.</p><div className="admin-guide"><strong>Safe ingestion workflow</strong><ol><li>Download the private Google Forms CSV to your computer.</li><li>Run the 100L converter locally to produce pending records.</li><li>Review duplicates and reconcile against university records.</li><li>Have an authorised operator import only validated records to the controlled DynamoDB environment.</li></ol></div><p className="admin-note">This screen intentionally does not expose raw student names, registration numbers or email addresses. No records have been imported by visiting this page.</p></div>
        : <>
          <div className="admin-card-head"><div><div className="admin-eyebrow">CANDIDATE SLATE · {draft?.locked?'READ ONLY':`DRAFT REVISION ${draft?.revision??0}`}</div><h2>Candidate lists</h2><p>{filled}/{positions.length} contests populated · {total} candidates recorded</p></div><div className="admin-toolbar"><button className="admin-icon-button" onClick={()=>{if(dirty&&!confirm('Discard unsaved edits?'))return;load(token);}} title="Reload"><RefreshCw size={16}/></button><button className="admin-secondary" disabled={dirty||!positions.length} onClick={()=>exportDraft(positions,draft.revision,draft.sha256)}><Download size={16}/> Export for review</button><button className="btn btn-primary" disabled={saving||!dirty||isLocked} onClick={save}><Save size={16}/>{saving?'Saving…':'Save draft'}</button></div></div>
          {draft?.locked?<div className="admin-warning"><LockKeyhole size={18}/> The official election configuration is already imported. Candidate editing is locked. Changes require ELECO-approved change control.</div>:<div className="admin-notice"><ShieldCheck size={17}/> Draft changes are audited and cannot affect a published ballot. ELECO approval and a separate backend import are required.</div>}
          {feedback&&<div className="admin-good" role="status"><CheckCircle2 size={17}/>{feedback}</div>}{loadError&&<div className="admin-error" role="alert">{loadError}</div>}
          {current&&<div className="admin-work-card"><div className="admin-office-head"><div><span className="admin-eyebrow">{candidateLabel(current)}</span><h3>{current.title}</h3><p>{current.scope==='department'?`Only verified ${current.department} students will see this VP contest.`:'All eligible students see this contest.'}</p></div><span className="admin-tag">{current.candidates.length} candidates</span></div>
            {current.candidates.length===0&&<div className="admin-empty">No candidates added to this office yet.</div>}
            <div className="admin-candidate-list">{current.candidates.map((c,index)=><div className="admin-candidate-card" key={c.id}><div className="admin-candidate-top"><strong>Candidate {index+1}</strong><span className="admin-candidate-id">{c.id.slice(0,18)}…</span>{!isLocked&&<button type="button" aria-label={`Remove candidate ${index+1}`} className="admin-remove" onClick={()=>{if(confirm('Remove this candidate from the draft?'))removeCandidate(current.id,c.id);}}><Trash2 size={16}/></button>}</div><label>Full name<input disabled={isLocked} value={c.name} maxLength={120} onChange={e=>updateCandidate(current.id,c.id,'name',e.target.value)} placeholder="Enter approved candidate name"/></label><label>Short description (optional)<input disabled={isLocked} value={c.tagline||''} maxLength={180} onChange={e=>updateCandidate(current.id,c.id,'tagline',e.target.value)} placeholder="Optional text, max 180 characters"/></label><label>Photo URL (optional · HTTPS)<input disabled={isLocked} value={c.photoUrl||''} maxLength={400} onChange={e=>updateCandidate(current.id,c.id,'photoUrl',e.target.value)} placeholder="https://…"/></label></div>)}</div>
            {!isLocked&&<button className="admin-add" onClick={()=>addCandidate(current.id)}><Plus size={16}/> Add candidate</button>}
          </div>}
          <div className="admin-note">Candidate IDs are generated automatically and remain stable when you edit a name. Don't delete and recreate a candidate simply to correct their spelling. Saving is version-checked to prevent overwriting another editor's changes.</div>
        </>}
      </section>
    </div>}
  </main>;
}
