import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, CalendarClock, Check, CheckCircle2,
  CircleAlert, CircleCheck, ClipboardCheck, Clock3, Fingerprint, Globe2,
  HelpCircle, Info, KeyRound, LockKeyhole, LogOut, Mail, Menu, RefreshCw, Shield,
  ShieldCheck, Users, Vote, X
} from 'lucide-react';
import namesLogo from './assets/names-logo.jpg';
import unibenLogo from './assets/uniben-logo.png';
import { previewVoters } from './lib/demo';
import {
  API_CONFIGURED, DEMO_MODE, ApiError, castVote, exchangeGoogleCode,
  getBallot, getElection, getGoogleLoginUrl, getMe, getVoteStatus, logout,
  previewSignIn, requestOtp, verifyOtp
} from './lib/api';

const processSteps = ['Verify identity', 'Voter dashboard', 'Cast ballot', 'Review', 'Confirmation'];
function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toLocaleString('en-NG', {dateStyle:'medium', timeStyle:'short'});
}
function displayError(error) {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
function shortenId(str) {
  if (!str) return 'Not available';
  return str.length > 7 ? `${str.slice(0,3)}••••${str.slice(-3)}` : str;
}
function brandInitials(name = '') { return name.split(' ').filter(Boolean).slice(0,2).map(s => s[0]).join('').toUpperCase(); }
function Brand() {
  return <div className="brand-block"><div className="brand-logos"><img src={namesLogo} alt="NAMES association crest" className="logo-names"/><span className="brand-rule"/><img src={unibenLogo} alt="University of Benin crest" className="logo-uniben"/></div><div className="brand-text"><strong>NAMES UNIBEN</strong><small>Electoral Portal</small></div></div>;
}
function StatusBadge({status}) {
  const text = status === 'open' ? 'Voting open' : status === 'upcoming' ? 'Upcoming election' : status === 'closed' ? 'Voting closed' : status === 'preview' ? 'Preview' : 'Election information';
  return <span className={`status-pill status-${status || 'idle'}`}><span className="status-dot"/>{text}</span>;
}
function InfoBox({children,kind='info'}) {
  return <div className={`info-box ${kind}`} role={kind==='error'?'alert':'note'}>{kind==='error'?<CircleAlert size={17}/>:kind==='success'?<CheckCircle2 size={17}/>:<Info size={17}/>}<div>{children}</div></div>;
}
function Shell({children, page, setPage, election, session, onSignOut, openHelp}) {
  const [menuOpen,setMenuOpen]=useState(false);
  const go = (pageName) => { setPage(pageName); setMenuOpen(false); };
  return <div className="app-shell">
    <header className="site-header"><div className="site-header-inner"><button className="brand-control" onClick={()=>go(session?'dashboard':'home')} aria-label="Return to portal home"><Brand/></button>
      <nav className={`site-nav ${menuOpen?'expanded':''}`} aria-label="Primary navigation">
        <button onClick={()=>go(session?'dashboard':'home')}>{session?'My dashboard':'Home'}</button>
        <button onClick={()=>{openHelp();setMenuOpen(false);}}>How to vote</button>
        {session ? <button className="nav-link-cta" onClick={()=>{setMenuOpen(false);onSignOut();}}>Sign out <LogOut size={15}/></button> : <button className="nav-link-cta" onClick={()=>go('login')}>Access ballot <ArrowRight size={15}/></button>}
      </nav>
      <button type="button" className="mobile-menu" onClick={()=>setMenuOpen(s=>!s)} aria-label="Toggle navigation" aria-expanded={menuOpen}>{menuOpen?<X size={21}/>:<Menu size={21}/>}</button>
    </div></header>
    {DEMO_MODE && <div className="preview-ribbon"><Info size={15}/><span><b>DEMONSTRATION ONLY</b> — Synthetic voters and candidates. No real authentication or votes.</span></div>}
    {children}
    <footer className="site-footer"><div className="footer-inner"><div><b>NAMES UNIBEN</b><span>National Association of Mechanical, Mechatronics and Marine Engineering Students</span></div><div className="footer-right"><small>© 2026 NAMES UNIBEN</small><span className="footer-credit">© Vaultr Technologies 2026</span></div></div></footer>
  </div>;
}
function FlowProgress({active}) {
  return <div className="flow-progress" aria-label="Voting steps">{processSteps.map((step,i)=><div className={`flow-item ${i===active?'current':i<active?'complete':''}`} key={step}><span className="flow-num">{i<active?<Check size={13}/>:i+1}</span><span className="flow-name">{step}</span></div>)}</div>;
}
function Home({onStart,openHelp,election,loading,loadError}) {
  const ready = election?.status === 'open';
  return <main>
    <section className="hero"><div className="hero-copy"><div className="overline"><span className="overline-dot"/>NAMES UNIBEN • 2026/2027 ELECTION</div>
      <h1>Your voice.<br/><em>Your choice.</em><br/>Our future.</h1>
      <p>The official digital election portal for the National Association of Mechanical, Mechatronics and Marine Engineering Students, University of Benin.</p>
      <div className="hero-buttons"><button className="btn btn-primary" disabled={!ready||loading} onClick={onStart}>{loading?'Checking election…':ready?'Proceed to vote':'Voting not yet available'} <ArrowRight size={18}/></button><button className="btn btn-text" onClick={openHelp}><HelpCircle size={18}/> How voting works</button></div>
      {loadError && <InfoBox kind="error">The election service is not connected. Voting is unavailable until the secure backend is online.</InfoBox>}
      {!loadError && election?.status === 'upcoming' && <InfoBox>Voting has not opened yet. Return during the scheduled election window.</InfoBox>}
      {!loadError && election?.status === 'closed' && <InfoBox>Voting has ended. Official results will be published by the Electoral Committee.</InfoBox>}
      <div className="hero-trust"><ShieldCheck size={17}/> Student-focused • Secure access • Confidential ballot</div>
    </div><div className="hero-graphic" aria-hidden="true"><div className="orbit orbit-large"/><div className="orbit orbit-small"/><div className="illustration-card"><div className="illustration-top"><span className="illustration-icon"><Vote size={23}/></span><b>NAMES STUDENT VOTE</b><span className="illustration-indicator"/></div><div className="paper"><span className="paper-title"/><span className="paper-line"/><span className="paper-line short"/>{[1,2,3].map(i=><div key={i} className="paper-choice"><span/><b/></div>)}</div><div className="illustration-check"><Check size={28}/></div><div className="illustration-bottom"><div><strong>One student</strong><small>One accepted ballot</small></div><ArrowUpRight size={19}/></div></div><span className="float-label float-a"><ShieldCheck size={15}/> Identity checked</span><span className="float-label float-b"><CheckCircle2 size={15}/> Your vote matters</span></div></section>
    <section className="feature-band" aria-label="Portal benefits"><div><span className="feature-icon"><Fingerprint/></span><span><strong>Verified access</strong><small>Approved student records</small></span></div><div><span className="feature-icon alt"><Vote/></span><span><strong>Your department, your ballot</strong><small>Relevant VP candidates only</small></span></div><div><span className="feature-icon green"><ShieldCheck/></span><span><strong>Confidential voting</strong><small>Designed to protect your choices</small></span></div></section>
    <section className="content-section"><div className="section-intro"><div className="overline">BE INFORMED. TAKE PART.</div><h2>Three simple steps.</h2><p>A clear, mobile-friendly voting experience for every eligible NAMES student.</p></div><div className="feature-cards"><article><span className="step-index">01</span><span className="feature-icon large"><LockKeyhole/></span><h3>Verify your identity</h3><p>Sign in using your approved student account or verified registration details.</p></article><article><span className="step-index">02</span><span className="feature-icon large alt"><Users/></span><h3>Review your ballot</h3><p>View association-wide candidates and only the Vice President candidates for your department.</p></article><article><span className="step-index">03</span><span className="feature-icon large green"><ClipboardCheck/></span><h3>Submit once</h3><p>Review your selections and submit your ballot securely. Wait for confirmation.</p></article></div></section>
    <section className="callout"><div><span className="callout-overline">EVERY ELIGIBLE VOICE MATTERS</span><h2>Leadership begins with participation.</h2><p>Check the official election schedule and review the approved candidates before casting your ballot.</p></div><button className="btn btn-white" onClick={onStart} disabled={!ready}>Access voting portal <ArrowRight size={16}/></button></section>
  </main>;
}
function Login({onBack, onDemoSignIn, onAuth, error, setError}) {
  const [authTab,setAuthTab]=useState('institutional');
  const [identifier,setIdentifier]=useState('');
  const [challenge,setChallenge]=useState(null);
  const [otp,setOtp]=useState('');
  const [working,setWorking]=useState(false);
  const [previewIdentifier,setPreviewIdentifier]=useState('DEMO-MAR-001');
  const startGoogle = () => { setError(''); try {window.location.assign(getGoogleLoginUrl());} catch(e){setError(displayError(e));} };
  const sendCode = async(e)=>{e.preventDefault();setError('');setWorking(true);try{const response=await requestOtp(identifier.trim(),'registration');setChallenge(response);setOtp('');}catch(e){setError(displayError(e));}finally{setWorking(false);}};
  const confirmCode=async(e)=>{e.preventDefault();setError('');setWorking(true);try{const response=await verifyOtp(challenge.challengeId,otp.trim());await onAuth(response);}catch(e){setError(displayError(e));}finally{setWorking(false);}};
  return <main className="inner-page"><div className="container"><button className="back-button" onClick={onBack}><ArrowLeft size={16}/> Back to home</button><FlowProgress active={0}/><div className="two-column form-layout"><div className="side-copy"><div className="overline">VOTER ACCESS</div><h1>Verify that<br/><em>it's you.</em></h1><p>Use your approved student record to access your personal election dashboard. Your department and eligible positions are assigned automatically.</p><div className="side-help"><ShieldCheck size={19}/><span>Never share your university password or email verification code with anyone, including Vaultr or ELECO representatives.</span></div></div>
    <div className="panel auth-panel"><div className="panel-title"><span className="panel-symbol"><LockKeyhole size={22}/></span><div><h2>Student verification</h2><p>Choose the method appropriate for your level.</p></div></div>
      {DEMO_MODE ? <div className="demo-login"><InfoBox>Preview only. Enter a synthetic student number below. Department and ballot eligibility will be retrieved automatically from the matching test record.</InfoBox>
        <form onSubmit={e=>{e.preventDefault();const matched = previewVoters.find(v=>v.identifier.toUpperCase()===previewIdentifier.trim().toUpperCase());if(!matched){setError('Unknown preview student number. Use one of the synthetic examples below.');return;}onDemoSignIn(matched.id);}}>
          <label className="field-label" htmlFor="demo-identifier">Student matric / registration number (preview)</label>
          <input id="demo-identifier" className="text-field" autoComplete="off" value={previewIdentifier} onChange={e=>{setPreviewIdentifier(e.target.value);setError('');}} required placeholder="Enter a demo student number"/>
          <p className="demo-help-title">Try one of these synthetic student numbers:</p>
          <div className="demo-example-ids">{previewVoters.map(v=><button type="button" key={v.id} className={previewIdentifier===v.identifier?'demo-example active':'demo-example'} onClick={()=>{setPreviewIdentifier(v.identifier);setError('');}}>{v.identifier}</button>)}</div>
          <button className="btn btn-primary btn-full" type="submit">Preview voter dashboard <ArrowRight size={17}/></button>
        </form>
      </div> : <>
        <div className="auth-tabs" role="tablist" aria-label="Student level"><button type="button" role="tab" aria-selected={authTab==='institutional'} className={authTab==='institutional'?'active':''} onClick={()=>{setAuthTab('institutional');setError('');}}>200–500 Level</button><button type="button" role="tab" aria-selected={authTab==='registration'} className={authTab==='registration'?'active':''} onClick={()=>{setAuthTab('registration');setError('');}}>100 Level</button></div>
        {authTab==='institutional'?<div className="login-method"><div className="method-label"><Mail size={18}/> Institutional Google account</div><p>Sign in with your existing <b>@eng.uniben.edu</b> account. Your university password is never entered on this website.</p><button className="google-button" type="button" onClick={startGoogle}><span className="google-g">G</span> Continue with Google <ArrowRight size={17}/></button><div className="muted-foot">Access is granted only after the signed-in account matches an approved voter record.</div></div> : <div className="login-method">{!challenge?<form onSubmit={sendCode}><p>Enter the UB/B1 registration number linked to your ELECO-approved student record. We'll send a code to the verified email already on file.</p><label className="field-label" htmlFor="registration-id">UB / B1 registration number</label><input className="text-field" id="registration-id" autoComplete="off" value={identifier} onChange={e=>setIdentifier(e.target.value)} required placeholder="Enter your registration number"/><button className="btn btn-primary btn-full" type="submit" disabled={working||!identifier.trim()}>{working?'Requesting…':'Send verification code'} <ArrowRight size={16}/></button></form>:<form onSubmit={confirmCode}><p>Enter the code sent to your previously verified email address.</p>{challenge.deliveryHint&&<div className="delivery-hint"><Mail size={17}/> {challenge.deliveryHint}</div>}<label className="field-label" htmlFor="email-code">Email verification code</label><input className="text-field otp-input" id="email-code" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)} placeholder="Enter your code" required/><button className="btn btn-primary btn-full" type="submit" disabled={working||!otp.trim()}>{working?'Verifying…':'Verify and continue'} <ArrowRight size={16}/></button><button type="button" className="text-action" onClick={()=>{setChallenge(null);setOtp('');setError('');}}>Use another registration number</button></form>}</div>}
        <InfoBox>Don't have access to your institutional account or approved email? Contact ELECO through its officially announced support channel.</InfoBox>
      </>}
      {error&&<InfoBox kind="error">{error}</InfoBox>}
    </div></div></div></main>;
}
function Dashboard({voter,election,onBallot,onSignOut,working,error}) {
  return <main className="inner-page"><div className="container"><FlowProgress active={1}/><div className="dashboard-header"><div><div className="overline">PERSONALISED VOTER PORTAL</div><h1>Welcome, <em>{voter?.fullName?.split(' ')[0] || 'student'}.</em></h1><p>Your identity has been verified for this session. Please confirm your information before continuing.</p></div><StatusBadge status={election?.status}/></div><div className="dashboard-grid"><section className="panel voter-card"><div className="voter-card-title"><span className="profile-avatar"><Users size={24}/></span><span><b>Verified student</b><small>NAMES UNIBEN voter register</small></span><BadgeCheck size={21} className="verified-mark"/></div><div className="voter-lines"><div><small>Full name</small><b>{voter.fullName}</b></div><div><small>Department</small><b>{voter.department}</b></div><div><small>Level</small><b>{voter.level} Level</b></div><div><small>Student identifier</small><b>{shortenId(voter.identifier)}</b></div></div><div className="voter-alert"><ShieldCheck size={17}/> Your department is assigned from your verified record. It cannot be changed on this page.</div></section><section className="panel dashboard-action"><div className="action-icon"><Vote size={26}/></div><span className="overline">YOUR ELECTION ACCESS</span><h2>{voter.hasVoted?'Your ballot has been received':'Your ballot is ready'}</h2><p>{voter.hasVoted?'Our records show that a ballot has already been accepted for this account.':'Your ballot contains association-wide positions and the Vice President contest for your department.'}</p><div className="dashboard-facts"><div><CheckCircle2 size={17}/><span>General NAMES electoral positions</span></div><div><CheckCircle2 size={17}/><span>Vice President — {voter.department}</span></div><div><LockKeyhole size={17}/><span>One accepted ballot per eligible student</span></div></div>{!voter.hasVoted&&<button className="btn btn-primary btn-full" onClick={onBallot} disabled={working||election?.status!=='open'}>{working?'Preparing your ballot…':'Proceed to your ballot'} <ArrowRight size={17}/></button>}{voter.hasVoted&&<InfoBox kind="success">This student account has already voted. No additional ballot can be submitted.</InfoBox>}{error&&<InfoBox kind="error">{error}</InfoBox>}<button className="text-action" onClick={onSignOut}>Sign out of this session</button></section></div></div></main>;
}
function CandidateCard({candidate,selected,onSelect}) {
  return <button type="button" className={`candidate-card ${selected?'chosen':''}`} onClick={onSelect} aria-pressed={selected}><div className="candidate-card-top">{candidate.photoUrl && /^https:\/\//.test(candidate.photoUrl) ? <img className="avatar-photo" src={candidate.photoUrl} alt=""/>:<span className="candidate-avatar">{brandInitials(candidate.name)}</span>}<span className="candidate-check">{selected&&<Check size={14}/>}</span></div><h3>{candidate.name}</h3><small>{candidate.department||'Candidate'}</small><p>{candidate.tagline||'Candidate information provided by the Electoral Committee.'}</p><span className="candidate-select-text">{selected?'Selected':'Select candidate'}</span></button>;
}
function Ballot({ballot,choices,setChoices,index,setIndex,onReview,onDashboard,error}) {
  const positions=ballot?.positions||[];
  const position=positions[index];
  const completed = positions.filter(p=>choices[p.id]).length;
  if (!position) return <main className="inner-page"><div className="container"><InfoBox kind="error">No electoral positions are available for your verified account. Contact ELECO.</InfoBox><button className="btn btn-outline" onClick={onDashboard}>Back to dashboard</button></div></main>;
  return <main className="inner-page"><div className="container"><button className="back-button" onClick={onDashboard}><ArrowLeft size={16}/> Back to dashboard</button><FlowProgress active={2}/><div className="ballot-top"><div><div className="overline">PRIVATE BALLOT • {ballot.election?.title||'NAMES UNIBEN'}</div><h1>Choose your <em>leaders.</em></h1><p>Review each candidate before selecting. Your selections are only submitted after final confirmation.</p></div><div className="count-card"><b>{completed}<span> / {positions.length}</span></b><small>Positions selected</small><div className="count-track"><span style={{width:`${completed/positions.length*100}%`}}/></div></div></div>
      <div className="ballot-grid"><aside className="position-sidebar"><div className="sidebar-title">ELECTORAL POSITIONS</div>{positions.map((p,i)=><button type="button" key={p.id} className={`position-link ${index===i?'active':''}`} onClick={()=>setIndex(i)}><span className="position-index">{String(i+1).padStart(2,'0')}</span><span className="position-text">{p.title}</span>{choices[p.id]&&<CheckCircle2 className="position-done" size={17}/>}</button>)}</aside><section className="panel ballot-panel"><div className="ballot-panel-head"><div><div className="overline">POSITION {index+1} OF {positions.length}</div><h2>{position.title}</h2><p>{position.scope==='department'?'Only students belonging to your verified department can vote in this contest.':'This position is open to all eligible NAMES voters.'}</p></div><span className="small-tag">Choose one</span></div><div className="candidate-grid">{position.candidates.map(c=><CandidateCard key={c.id} candidate={c} selected={choices[position.id]===c.id} onSelect={()=>setChoices(prev=>({...prev,[position.id]:c.id}))}/>)}</div>{position.candidates.length===0&&<InfoBox kind="error">No candidates have been published for this position. Please contact ELECO.</InfoBox>}<div className="ballot-controls"><button type="button" className="btn btn-text" disabled={index===0} onClick={()=>setIndex(index-1)}><ArrowLeft size={16}/> Previous</button>{index<positions.length-1?<button className="btn btn-primary" onClick={()=>setIndex(index+1)}>Next position <ArrowRight size={16}/></button>:<button className="btn btn-primary" onClick={onReview} disabled={completed!==positions.length}>Review selections <ArrowRight size={16}/></button>}</div>{index===positions.length-1&&completed!==positions.length&&<p className="helper-line">Select a candidate in all {positions.length} positions to review your ballot.</p>}{error&&<InfoBox kind="error">{error}</InfoBox>}</section></div></div></main>;
}
function Review({ballot,choices,onEdit,onSubmit,busy,error,confirmed,setConfirmed,onCheckStatus,checking}) {
  const selected = ballot.positions.map((p,i)=>({index:i,title:p.title,candidate:p.candidates.find(c=>c.id===choices[p.id])}));
  return <main className="inner-page"><div className="container"><button className="back-button" onClick={()=>onEdit(0)}><ArrowLeft size={16}/> Back to ballot</button><FlowProgress active={3}/><div className="two-column review-layout"><div className="side-copy"><div className="overline">FINAL CONFIRMATION</div><h1>Review your<br/><em>selections.</em></h1><p>Please check every candidate carefully. Once submitted, your ballot cannot be changed or submitted a second time.</p><div className="side-help"><LockKeyhole size={19}/><span>Your confirmation receipt should not disclose who you voted for.</span></div></div><section className="panel review-card"><div className="review-header"><div><h2>Ballot summary</h2><p>{selected.length} electoral positions</p></div><span className="small-tag success"><CheckCircle2 size={14}/> Complete</span></div><div className="review-rows">{selected.map(s=><div className="review-line" key={s.title}><div><small>{String(s.index+1).padStart(2,'0')} / {s.title}</small><strong>{s.candidate?.name||'Selection missing'}</strong></div><button className="text-action" onClick={()=>onEdit(s.index)}>Edit</button></div>)}</div><InfoBox>Confirm only when you are satisfied with every choice. This is a one-time submission.</InfoBox><label className="confirmation-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I have reviewed all my selections and understand my ballot cannot be edited after submission.</span></label>{error&&<InfoBox kind="error">{error}</InfoBox>}<button className="btn btn-primary btn-full" onClick={onSubmit} disabled={!confirmed||busy||checking}>{busy?'Submitting securely…':'Submit my ballot'} <Check size={17}/></button>{error&&<button className="btn btn-outline btn-full check-status" onClick={onCheckStatus} disabled={checking}>{checking?'Checking…':'Check whether a ballot was received'} <RefreshCw size={15}/></button>}<p className="secure-note"><LockKeyhole size={13}/> Confirmation appears only after a successful server response.</p></section></div></div></main>;
}
function Confirmation({receipt,onFinish}) {
  return <main className="confirmation-page"><FlowProgress active={4}/><div className="success-symbol"><Check size={39}/></div><div className="overline">{DEMO_MODE?'PREVIEW COMPLETED':'BALLOT RECEIVED'}</div><h1>{DEMO_MODE?'Demo ballot':'Your vote'}<br/><em>{DEMO_MODE?'journey complete.':'has been received.'}</em></h1><p>{DEMO_MODE?'This was a synthetic demonstration. Nothing was saved to an election database.':'The voting service confirmed receipt of your ballot. Your selections are not displayed on this confirmation page.'}</p>{receipt?.receiptId&&<div className="receipt-box"><small>{receipt.statusOnly?'BALLOT STATUS':DEMO_MODE?'DEMO REFERENCE':'CONFIRMATION REFERENCE'}</small><strong>{receipt.statusOnly?'Accepted':receipt.receiptId}</strong><span>{receipt.statusOnly?'Your ballot status is confirmed. The unique receipt cannot be retrieved without linking it to your identity.':DEMO_MODE?'Not a valid voting receipt.':'Keep this confirmation reference for any follow-up with the Electoral Committee.'}</span></div>}<button className="btn btn-primary" onClick={onFinish}>Return to portal <ArrowRight size={17}/></button></main>;
}
function HelpModal({onClose}) {
  useEffect(()=>{const key=e=>{if(e.key==='Escape') onClose();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[onClose]);
  return <div className="modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="help-dialog"><button className="modal-x" onClick={onClose} aria-label="Close guide"><X size={20}/></button><div className="overline">STUDENT VOTING GUIDE</div><h2 id="modal-title">How the portal works</h2>{[
    ['01','Open the election portal','Read the instructions and check whether voting is currently open.'],
    ['02','Verify your identity','200–500 level use approved institutional Google sign-in. 100 level use their approved registration number and verified email OTP.'],
    ['03','Confirm your record','Check your name, level and department on your private dashboard. Contact ELECO if any detail is wrong.'],
    ['04','Cast your ballot','Select candidates for association-wide positions and your department’s Vice President contest.'],
    ['05','Review and submit','Check each choice, submit once and wait for confirmation. If connectivity fails, check ballot status before trying again.'],
  ].map(([no,title,desc])=><div className="help-step" key={no}><span>{no}</span><div><strong>{title}</strong><p>{desc}</p></div></div>)}<InfoBox>Only the Electoral Committee may resolve disputed or incorrect student records. Do not share OTPs or passwords with anyone.</InfoBox><button className="btn btn-primary btn-full" onClick={onClose}>Understood <Check size={16}/></button></section></div>;
}
export default function App() {
  const [page,setPage]=useState('home');
  const [election,setElection]=useState(null);
  const [loadingElection,setLoadingElection]=useState(true);
  const [electionError,setElectionError]=useState('');
  const [accessToken,setAccessToken]=useState('');
  const [voter,setVoter]=useState(null);
  const [ballot,setBallot]=useState(null);
  const [choices,setChoices]=useState({});
  const [positionIndex,setPositionIndex]=useState(0);
  const [receipt,setReceipt]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [showHelp,setShowHelp]=useState(false);
  const oauthProcessed=useRef(false);
  const idempotencyKey=useRef('');
  const navigate=useCallback(next=>{setError('');setPage(next);window.scrollTo({top:0,behavior:'smooth'});},[]);
  const goHome=()=>navigate('home');

  useEffect(()=>{
    let alive=true;
    getElection().then(data=>{if(alive){setElection(data);setElectionError('');}}).catch(e=>{if(alive){setElectionError(displayError(e));}}).finally(()=>{if(alive)setLoadingElection(false);});
    return()=>{alive=false;};
  },[]);

  const onAuthenticated=useCallback(async(result)=>{
    if(!result?.accessToken)throw new ApiError('The authentication service did not return an access token.');
    const currentVoter=result.voter||await getMe(result.accessToken);
    if(!currentVoter?.id||!currentVoter?.department)throw new ApiError('The verified student record is incomplete. Contact ELECO.');
    setAccessToken(result.accessToken);
    setVoter(currentVoter);
    navigate('dashboard');
  },[navigate]);

  useEffect(()=>{
    if (oauthProcessed.current) return;
    const url=new URL(window.location.href);
    const code=url.searchParams.get('login_code');
    const authError=url.searchParams.get('auth_error');
    if(!code&&!authError)return;
    oauthProcessed.current=true;
    url.searchParams.delete('login_code');url.searchParams.delete('auth_error');
    window.history.replaceState(null,'',url.pathname+url.search+url.hash);
    if(authError){setError('Institutional sign-in could not be completed. Please try again or contact ELECO.');setPage('login');return;}
    setBusy(true);
    exchangeGoogleCode(code).then(onAuthenticated).catch(e=>{setError(displayError(e));setPage('login');}).finally(()=>setBusy(false));
  },[onAuthenticated]);

  const handleSignout=async()=>{
    const token=accessToken;
    setAccessToken('');setVoter(null);setBallot(null);setChoices({});setReceipt(null);setConfirmed(false);idempotencyKey.current='';
    navigate('home');
    if(token)await logout(token);
  };
  const startBallot=async()=>{
    if(!accessToken){navigate('login');return;}
    setError('');setBusy(true);
    try {
      const response=await getBallot(accessToken);
      if(!Array.isArray(response.positions)||!response.positions.length)throw new ApiError('No ballot positions are available for this student.');
      if(response.voter?.department&&response.voter.department!==voter.department)throw new ApiError('The server returned an inconsistent student department. Contact ELECO.');
      setBallot(response);setChoices({});setPositionIndex(0);setConfirmed(false);
      idempotencyKey.current='';navigate('ballot');
    }catch(e){setError(displayError(e));}finally{setBusy(false);}
  };
  const reviewBallot=()=>{if(ballot?.positions.every(p=>choices[p.id]))navigate('review');else setError('Please select a candidate for every position.');};
  const editSelection=(index)=>{setPositionIndex(index);navigate('ballot');};
  const handleStatus=async()=>{
    if(!accessToken)return;
    setChecking(true);
    try {
      const response=await getVoteStatus(accessToken);
      if(response.status==='accepted'){
        setReceipt(response);setVoter(v=>({...v,hasVoted:true}));navigate('success');
      }else if(response.status==='not_submitted')setError('No accepted ballot was found. Your selections are still here. You may try submitting again.');
      else setError('The server could not confirm your ballot status. Contact ELECO before attempting another submission.');
    }catch(e){setError(displayError(e));}finally{setChecking(false);}
  };
  const submitBallot=async()=>{
    if(!confirmed||!ballot||busy)return;
    setError('');setBusy(true);
    if(!idempotencyKey.current)idempotencyKey.current=globalThis.crypto?.randomUUID?.()||`vote-${Date.now()}`;
    const selections=ballot.positions.map(p=>({positionId:p.id,candidateId:choices[p.id]}));
    try{
      const response=await castVote(accessToken,selections,idempotencyKey.current);
      if(response?.status!=='accepted'||!response.receiptId)throw new ApiError('The server did not confirm ballot acceptance. Check your status before retrying.');
      setReceipt(response);setVoter(v=>({...v,hasVoted:true}));navigate('success');
    }catch(e){setError(e.code==='ALREADY_VOTED'?'A ballot has already been accepted for this student. Check the ballot status.':displayError(e));}
    finally{setBusy(false);}
  };
  const onDemoSignIn=async(id)=>{
    setBusy(true);setError('');
    try{await onAuthenticated(await previewSignIn(id));}catch(e){setError(displayError(e));}finally{setBusy(false);}
  };
  const resetToHome=async()=>{await handleSignout();};
  const canVote=election?.status==='open';
  const protectedPage=Boolean(accessToken&&voter);
  const effectivePage = !protectedPage && ['dashboard','ballot','review','success'].includes(page)?'login':page;
  return <Shell page={effectivePage} setPage={navigate} election={election} session={protectedPage} onSignOut={handleSignout} openHelp={()=>setShowHelp(true)}>
    {effectivePage==='home'&&<Home election={election} loading={loadingElection} loadError={electionError} onStart={()=>navigate('login')} openHelp={()=>setShowHelp(true)}/>}
    {effectivePage==='login'&&<Login onBack={goHome} onDemoSignIn={onDemoSignIn} onAuth={onAuthenticated} error={error} setError={setError}/>}
    {effectivePage==='dashboard'&&voter&&<Dashboard voter={voter} election={election} onBallot={startBallot} onSignOut={handleSignout} working={busy} error={error}/>}
    {effectivePage==='ballot'&&ballot&&<Ballot ballot={ballot} choices={choices} setChoices={setChoices} index={positionIndex} setIndex={setPositionIndex} onReview={reviewBallot} onDashboard={()=>navigate('dashboard')} error={error}/>}
    {effectivePage==='review'&&ballot&&<Review ballot={ballot} choices={choices} onEdit={editSelection} onSubmit={submitBallot} busy={busy} error={error} confirmed={confirmed} setConfirmed={setConfirmed} onCheckStatus={handleStatus} checking={checking}/>}
    {effectivePage==='success'&&receipt&&<Confirmation receipt={receipt} onFinish={resetToHome}/>}
    {showHelp&&<HelpModal onClose={()=>setShowHelp(false)}/>}
  </Shell>;
}
