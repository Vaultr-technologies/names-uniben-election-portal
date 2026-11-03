import React, { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp,
  ClipboardList, LockKeyhole, Menu, ShieldCheck, Vote, X, Info, Clock3,
  Users, BookOpen, ExternalLink, AlertCircle
} from "lucide-react";
import namesLogo from "./assets/names-logo.jpg";
import unibenLogo from "./assets/uniben-logo.png";
import { positions } from "./data";

const steps = ["Verify identity", "Cast your ballot", "Review selections", "Confirmation"];

function Brand({ compact = false }) {
  return <div className="brand">
    <img src={namesLogo} alt="NAMES logo" className="brand-logo names-logo" />
    <div className="brand-divider" />
    <img src={unibenLogo} alt="University of Benin logo" className="brand-logo uniben-logo" />
    {!compact && <div className="brand-copy">
      <strong>NAMES UNIBEN</strong>
      <span>Electoral Portal</span>
    </div>}
  </div>;
}

function Footer() {
  return <footer className="footer">
    <div className="footer-inner">
      <span>© 2026 NAMES UNIBEN. All rights reserved.</span>
      <span className="powered"><span className="copyright-mark">©</span> <b>Vaultr Technologies</b> <span>2026</span></span>
    </div>
  </footer>;
}

function App() {
  const [page, setPage] = useState("home");
  const [studentId, setStudentId] = useState("");
  const [pin, setPin] = useState("");
  const [idType, setIdType] = useState("Matriculation number");
  const [selections, setSelections] = useState({});
  const [activePosition, setActivePosition] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState("");
  const [receipt] = useState(() => "NMS-2026-" + Math.random().toString(36).slice(2, 8).toUpperCase());

  const selectedCount = Object.keys(selections).length;
  const allSelected = selectedCount === positions.length;
  const currentPosition = positions[activePosition];
  const chosen = useMemo(() => positions.map(p => ({
    ...p, candidate: p.candidates.find(c => c.id === selections[p.id])
  })), [selections]);

  const go = (next) => { setError(""); setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  function verify(e) {
    e.preventDefault();
    if (!studentId.trim() || !pin.trim()) {
      setError("Enter your student identification number and voting PIN to continue.");
      return;
    }
    // Frontend demonstration only. Production verification must be performed by a secure backend.
    go("ballot");
  }

  function submitDemo() {
    if (!allSelected) {
      setError("Please make a selection for every position before continuing.");
      go("ballot");
      return;
    }
    go("success");
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand-button" onClick={() => go("home")} aria-label="Go to home"><Brand /></button>
        <nav className={mobileMenu ? "nav-links open" : "nav-links"}>
          <button onClick={() => go("home")}>Home</button>
          <button onClick={() => setShowHelp(true)}>How to vote</button>
          <button onClick={() => setShowHelp(true)}>Help & support</button>
          <button className="nav-cta" onClick={() => go("verify")}>Access ballot <ArrowRight size={16}/></button>
        </nav>
        <button className="menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">
          {mobileMenu ? <X/> : <Menu/>}
        </button>
      </div>
    </header>

    <div className="demo-notice"><Info size={15}/><span><b>Frontend demonstration</b> — this preview does not verify students or record real votes.</span></div>

    {page === "home" && <main>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-dot"/> STUDENT LEADERSHIP • 2026</div>
          <h1>Your voice.<br/><em>Your choice.</em><br/>Our future.</h1>
          <p className="hero-lead">The NAMES UNIBEN Electoral Portal is the official digital space for eligible students to participate in the association's elections.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => go("verify")}>Proceed to vote <ArrowRight size={18}/></button>
            <button className="button button-quiet" onClick={() => setShowHelp(true)}><CircleHelp size={17}/> How voting works</button>
          </div>
          <div className="hero-assurance"><ShieldCheck size={17}/><span>Designed for a secure, accessible and transparent voting experience.</span></div>
        </div>
        <div className="hero-art">
          <div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/>
          <div className="hero-card">
            <div className="hero-card-top"><span className="mini-seal"><Vote size={21}/></span><span>THE STUDENT VOICE</span><span className="live-dot"/></div>
            <div className="ballot-illustration">
              <div className="ballot-sheet"><div className="sheet-head"/><div className="sheet-line"/><div className="sheet-line short"/><div className="sheet-option"><span/><i/></div><div className="sheet-option"><span/><i/></div><div className="sheet-option"><span/><i/></div></div>
              <div className="ballot-check"><Check size={31}/></div>
            </div>
            <div className="hero-card-bottom"><div><b>One student</b><span>One verified ballot</span></div><div className="card-arrow"><ArrowRight/></div></div>
          </div>
          <div className="floating-chip chip-top"><ShieldCheck size={16}/> Identity protection</div>
          <div className="floating-chip chip-bottom"><CheckCircle2 size={16}/> Every vote counts</div>
        </div>
      </section>

      <section className="quick-strip">
        <div><span className="strip-icon"><LockKeyhole/></span><div><b>Verified access</b><small>For eligible NAMES students</small></div></div>
        <div><span className="strip-icon orange"><ClipboardList/></span><div><b>Simple ballot</b><small>Clear candidate selections</small></div></div>
        <div><span className="strip-icon green"><ShieldCheck/></span><div><b>Election integrity</b><small>Built around fair participation</small></div></div>
      </section>

      <section className="welcome-section">
        <div className="section-heading">
          <span className="eyebrow">BE INFORMED. TAKE PART.</span>
          <h2>Make your vote count.</h2>
          <p>Participating is straightforward. Review the instructions before accessing your ballot.</p>
        </div>
        <div className="steps-grid">
          <div className="step-card"><span className="step-number">01</span><div className="step-icon"><Users/></div><h3>Verify your identity</h3><p>Use your matriculation number or approved 100-level registration number together with your assigned voting PIN.</p></div>
          <div className="step-card"><span className="step-number">02</span><div className="step-icon orange"><Vote/></div><h3>Choose your candidates</h3><p>Review the candidates and make your selection for each available electoral position.</p></div>
          <div className="step-card"><span className="step-number">03</span><div className="step-icon green"><CheckCircle2/></div><h3>Review and submit</h3><p>Check your selections carefully before submitting your ballot. Follow the on-screen confirmation.</p></div>
        </div>
      </section>
      <section className="callout">
        <div><span className="eyebrow">YOUR ASSOCIATION. YOUR DECISION.</span><h2>Leadership begins with participation.</h2><p>Take a moment to understand the candidates, their plans and the responsibilities of each office.</p></div>
        <button className="button button-light" onClick={() => go("verify")}>Enter the voting portal <ArrowRight size={17}/></button>
      </section>
    </main>}

    {page === "verify" && <main className="flow-page">
      <button className="back-link" onClick={() => go("home")}><ArrowLeft size={16}/> Back to home</button>
      <FlowHeader active={0}/>
      <div className="form-layout">
        <div className="form-intro">
          <span className="eyebrow">VOTER ACCESS</span><h1>Let's verify<br/><em>it's you.</em></h1>
          <p>Enter the details provided to you by the NAMES Electoral Committee. Your eligibility will be checked before a ballot is issued.</p>
          <div className="privacy-note"><LockKeyhole size={18}/><span>Your identification details should only be used for voter verification. Never share your voting PIN.</span></div>
        </div>
        <form className="form-card" onSubmit={verify}>
          <div className="form-card-heading"><span className="form-icon"><ShieldCheck/></span><div><h2>Voter verification</h2><p>All fields are required</p></div></div>
          <label className="field-label">Identification type</label>
          <div className="select-wrap"><select value={idType} onChange={e => setIdType(e.target.value)}><option>Matriculation number</option><option>100-level registration number</option></select><ChevronDown size={17}/></div>
          <label className="field-label" htmlFor="student-id">{idType}</label>
          <input id="student-id" className="text-input" value={studentId} onChange={e => setStudentId(e.target.value)} placeholder={idType === "Matriculation number" ? "Enter your matric number" : "Enter your registration number"} autoComplete="off"/>
          <label className="field-label" htmlFor="pin">Unique voting PIN</label>
          <input id="pin" className="text-input" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter your assigned PIN" type="password" autoComplete="off"/>
          {error && <div className="inline-error"><AlertCircle size={16}/>{error}</div>}
          <button className="button button-primary full-button" type="submit">Verify and continue <ArrowRight size={17}/></button>
          <p className="form-footnote"><LockKeyhole size={13}/> Your details are not sent anywhere in this frontend preview.</p>
        </form>
      </div>
    </main>}

    {page === "ballot" && <main className="flow-page ballot-page">
      <button className="back-link" onClick={() => go("verify")}><ArrowLeft size={16}/> Back to verification</button>
      <FlowHeader active={1}/>
      <div className="ballot-heading"><div><span className="eyebrow">YOUR BALLOT</span><h1>Choose your <em>leaders.</em></h1><p>Select one candidate for each position. You can review your choices before final submission.</p></div><div className="progress-card"><b>{selectedCount} <span>/ {positions.length}</span></b><small>Positions selected</small><div className="progress-track"><i style={{width: `${selectedCount / positions.length * 100}%`}}/></div></div></div>
      <div className="ballot-layout">
        <aside className="position-list"><span className="aside-label">ELECTORAL POSITIONS</span>{positions.map((p,i)=><button key={p.id} className={activePosition===i?"position-tab active": "position-tab"} onClick={()=>setActivePosition(i)}><span className="position-index">0{i+1}</span><span>{p.title}</span>{selections[p.id] && <CheckCircle2 size={17} className="tab-check"/>}</button>)}</aside>
        <section className="candidate-panel">
          <div className="candidate-panel-top"><div><span className="eyebrow">POSITION 0{activePosition+1} OF 0{positions.length}</span><h2>{currentPosition.title}</h2><p>{currentPosition.description}</p></div><span className="required-tag">Select one</span></div>
          <div className="candidate-grid">{currentPosition.candidates.map((c,i)=><button key={c.id} className={selections[currentPosition.id]===c.id?"candidate-card selected":"candidate-card"} onClick={()=>setSelections(s=>({...s,[currentPosition.id]:c.id}))}>
            <div className="candidate-top"><div className={`candidate-avatar avatar-${i}`}>{c.initials}</div><span className="radio-mark">{selections[currentPosition.id]===c.id && <Check size={14}/>}</span></div>
            <h3>{c.name}</h3><span className="candidate-dept">{c.department}</span><p>{c.manifesto}</p><span className="select-label">{selections[currentPosition.id]===c.id?"Selected":"Select candidate"}</span>
          </button>)}</div>
          <div className="candidate-nav"><button className="button button-quiet" disabled={activePosition===0} onClick={()=>setActivePosition(i=>i-1)}><ArrowLeft size={16}/> Previous</button>{activePosition<positions.length-1?<button className="button button-primary" onClick={()=>setActivePosition(i=>i+1)}>Next position <ArrowRight size={16}/></button>:<button className="button button-primary" onClick={()=>{if(allSelected)go("review");else setError("Please select a candidate for every position.")}}>Review ballot <ArrowRight size={16}/></button>}</div>
          {error && <div className="inline-error ballot-error"><AlertCircle size={16}/>{error}</div>}
        </section>
      </div>
    </main>}

    {page === "review" && <main className="flow-page">
      <button className="back-link" onClick={() => go("ballot")}><ArrowLeft size={16}/> Back to ballot</button>
      <FlowHeader active={2}/>
      <div className="review-layout"><div className="review-intro"><span className="eyebrow">FINAL CHECK</span><h1>Review your<br/><em>selections.</em></h1><p>Make sure everything is correct. In a live election, a submitted ballot may not be changed.</p></div>
        <div className="review-card"><div className="review-card-head"><div><h2>Ballot summary</h2><p>{positions.length} electoral positions</p></div><span className="review-badge"><CheckCircle2 size={15}/> Complete</span></div>
          {chosen.map((p,i)=><div className="review-row" key={p.id}><div><span className="review-position">0{i+1} / {p.title}</span><b>{p.candidate?.name || "No selection"}</b></div><button onClick={()=>{setActivePosition(i);go("ballot")}}>Edit</button></div>)}
          <div className="review-warning"><Info size={17}/><span>Take a final moment to review. The live election rules will determine whether a submitted ballot can be changed.</span></div>
          {error && <div className="inline-error"><AlertCircle size={16}/>{error}</div>}
          <button className="button button-primary full-button" onClick={submitDemo}>Confirm selections <Check size={17}/></button>
          <p className="form-footnote"><LockKeyhole size={13}/> Demo only — this action will not submit a real vote.</p>
        </div>
      </div>
    </main>}

    {page === "success" && <main className="success-page">
      <div className="success-icon"><Check size={38}/></div><span className="eyebrow">DEMONSTRATION COMPLETE</span><h1>Your ballot journey<br/><em>is complete.</em></h1>
      <p>This is a frontend preview. No vote has been cast, stored or transmitted. A live confirmation screen will only appear after the secure election backend confirms receipt of a ballot.</p>
      <div className="receipt-card"><span>DEMO REFERENCE</span><b>{receipt}</b><small>Illustrative reference only — not a valid voting receipt.</small></div>
      <button className="button button-primary" onClick={()=>{setSelections({});setStudentId("");setPin("");setActivePosition(0);go("home")}}>Return to portal <ArrowRight size={17}/></button>
    </main>}

    <Footer/>

    {showHelp && <div className="modal-backdrop" onClick={()=>setShowHelp(false)}><div className="help-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowHelp(false)} aria-label="Close"><X/></button><span className="eyebrow">VOTER GUIDE</span><h2>How to vote</h2><div className="help-item"><span>01</span><div><b>Get your voter details</b><p>Use the matriculation number or approved 100-level registration number and unique PIN issued by the Electoral Committee.</p></div></div><div className="help-item"><span>02</span><div><b>Verify your eligibility</b><p>Enter your details on the voter access page. If verification fails, contact the committee through its official support channel.</p></div></div><div className="help-item"><span>03</span><div><b>Make your selections</b><p>Review each position and select one candidate according to the published election rules.</p></div></div><div className="help-item"><span>04</span><div><b>Review before submitting</b><p>Confirm your selections and wait for the live system to acknowledge successful ballot receipt.</p></div></div><div className="help-contact"><Info size={16}/> This demonstration does not connect to the official voter register or election database.</div><button className="button button-primary full-button" onClick={()=>{setShowHelp(false);go("verify")}}>Continue to voter access <ArrowRight size={16}/></button></div></div>}
  </div>;
}

function FlowHeader({active}) {
  return <div className="flow-header"><div className="flow-title"><span className="eyebrow">NAMES UNIBEN • 2026 ELECTION</span><h2>Electoral portal</h2></div><div className="flow-steps">{steps.map((s,i)=><div className={i===active?"flow-step active":i<active?"flow-step done":"flow-step"} key={s}><span>{i<active?<Check size={13}/>:i+1}</span><small>{s}</small></div>)}</div></div>;
}

export default App;
