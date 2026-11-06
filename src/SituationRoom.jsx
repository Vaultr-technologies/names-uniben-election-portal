import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BarChart3, CheckCircle2, CircleAlert, Clock3, Download, Eye, Info, RefreshCw, ShieldCheck, Users, Vote } from 'lucide-react';
import { DEMO_MODE, getSituation } from './lib/api.js';

const fmt = n => typeof n==='number' && Number.isFinite(n) ? n.toLocaleString('en-NG') : '—';
function dateLabel(value) {
  if(!value)return 'Not announced';
  const d = new Date(value);
  return Number.isNaN(d.valueOf())?'Not announced':d.toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'});
}
function safeCsvCell(value) {
  const text = String(value ?? '');
  const protectedValue = /^[=+@-]/.test(text) ? "'"+text : text;
  return '"'+protectedValue.replace(/"/g,'""')+'"';
}
export function resultsCsv(positions) {
  const rows=[['Position','Department','Candidate','Votes','Total contest votes','Share (%)']];
  for(const p of positions||[])for(const c of p.candidates||[]){
    rows.push([p.title,p.department||'Association-wide',c.name,c.votes,p.totalVotes,p.totalVotes?((c.votes/p.totalVotes)*100).toFixed(2):'0.00']);
  }
  return rows.map(row=>row.map(safeCsvCell).join(',')).join('\r\n');
}
function downloadCsv(snapshot) {
  const content=resultsCsv(snapshot.positions);
  const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8;'}));
  const el=document.createElement('a');el.href=url;el.download='names-uniben-provisional-results.csv';document.body.appendChild(el);el.click();el.remove();
  URL.revokeObjectURL(url);
}
function StagePill({stage}) {
 const label={upcoming:'Election upcoming',open:'Voting in progress',reconciling:'Vote counting',published:'Results available',review_required:'Review required',setup:'Awaiting configuration'}[stage]||'Unavailable';
 return <span className={'room-phase phase-'+stage}><span className="room-phase-dot"/>{label}</span>;
}
function SummaryCard({label,value,detail,icon:Icon}){
 return <div className="room-summary-card"><div className="room-summary-head"><span>{label}</span><Icon size={20}/></div><strong>{value}</strong><small>{detail}</small></div>;
}
function PositionResult({position}){
 const candidates=[...(position.candidates||[])].sort((a,b)=>b.votes-a.votes);
 return <article className="room-contest-card"><div className="room-contest-heading"><div><small>{position.department||'ASSOCIATION-WIDE CONTEST'}</small><h3>{position.title}</h3></div><span className="room-contest-count">{fmt(position.totalVotes)} votes</span></div>
   <div className="room-candidate-list">{candidates.map(candidate=>{
     const percent=position.totalVotes?100*candidate.votes/position.totalVotes:0;
     return <div className="room-candidate-row" key={candidate.id}><div className="room-candidate-caption"><span>{candidate.name}</span><strong>{fmt(candidate.votes)} <small>({percent.toFixed(1)}%)</small></strong></div><div className="room-bar-track"><span style={{width:`${percent}%`}}/></div></div>;
   })}</div></article>;
}
export default function SituationRoom({onBack}){
 const [previewStage,setPreviewStage]=useState('open');
 const [snapshot,setSnapshot]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [lastFetched,setLastFetched]=useState(null);
 const [filter,setFilter]=useState('all');
 const refresh=useCallback(async(signal)=>{
   try{
     const result=await getSituation({signal,previewStage});
     if(!signal?.aborted){setSnapshot(result);setError('');setLastFetched(new Date());}
   }catch(err){if(!signal?.aborted)setError('Unable to update the situation room. Figures may be out of date.');}
   finally{if(!signal?.aborted)setLoading(false);}
 },[previewStage]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);refresh(controller.signal);const timer=setInterval(()=>refresh(controller.signal),20000);return()=>{clearInterval(timer);controller.abort();};},[refresh]);
 const published=snapshot?.stage==='published'&&snapshot?.resultStatus==='provisional'&&Array.isArray(snapshot?.positions);
 const filtered=useMemo(()=>{
   if(!published)return [];
   return snapshot.positions.filter(p=>filter==='all'||(filter==='general'?p.scope==='general':p.department===filter));
 },[snapshot,filter,published]);
 const stage=snapshot?.stage||'setup';
 return <main className="situation-room"><div className="container room-container">
   <div className="room-actions-top"><button onClick={onBack} className="back-button"><ArrowLeft size={16}/> Back to electoral portal</button><span className="room-readonly"><Eye size={15}/> Public, read-only view</span></div>
   <div className="room-hero"><div className="room-hero-copy"><span className="room-overline">NAMES UNIBEN • 2026/2027</span><h1>Election<br/><em>Situation Room.</em></h1><p>Shared election monitoring for ELECO, departmental observers, campaign agents and the public. No individual observer accounts required.</p><StagePill stage={stage}/></div><div className="room-hero-mark"><BarChart3 size={69} strokeWidth={1.3}/><span>MONITOR • VERIFY • REPORT</span></div></div>
   {DEMO_MODE&&<div className="room-demo-controls"><span><Info size={15}/> <b>DEMO ONLY:</b> All figures and candidates are fictitious.</span><div>{[['upcoming','Before'],['open','During'],['reconciling','Counting'],['published','After']].map(([id,label])=><button className={previewStage===id?'active':''} key={id} onClick={()=>{setPreviewStage(id);setFilter('all');}}>{label}</button>)}</div></div>}
   <div className="room-section-bar"><div><span className="room-eyebrow">ELECTION OVERVIEW</span><h2>Participation at a glance</h2></div><button className="room-refresh" disabled={loading} onClick={()=>{setLoading(true);refresh();}}><RefreshCw size={15} className={loading?'spin':''}/> Refresh now</button></div>
   <div className="room-summary-grid"><SummaryCard label="Eligible voters" value={fmt(snapshot?.eligibleVoters)} detail="Committee-approved voter register" icon={Users}/><SummaryCard label="Accepted ballots" value={fmt(snapshot?.acceptedBallots)} detail="Count of accepted submissions" icon={Vote}/><SummaryCard label="Voter turnout" value={typeof snapshot?.turnoutPercent==='number'?`${snapshot.turnoutPercent.toFixed(1)}%`:'—'} detail="Of eligible voters" icon={BarChart3}/></div>
   {error&&<div className="room-warning room-warning-error" role="alert"><CircleAlert size={19}/><span>{error} Do not treat the displayed figures as current.</span></div>}
   <div className="room-turnout-panel"><div className="room-turnout-title"><div><span className="room-eyebrow">LIVE PARTICIPATION</span><h3>Overall turnout</h3></div><strong>{typeof snapshot?.turnoutPercent==='number'?`${snapshot.turnoutPercent.toFixed(1)}%`:'Not available'}</strong></div><div className="room-turnout-track"><span style={{width:`${Math.max(0,Math.min(100,snapshot?.turnoutPercent||0))}%`}}/></div><div className="room-turnout-bottom"><span><Clock3 size={14}/> {lastFetched?`Refreshed at ${lastFetched.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}`:'Connecting to election service'}</span><span>Auto-refresh every 20 seconds</span></div></div>
   {published?<section className="room-results-section"><div className="room-results-header"><div><span className="room-eyebrow">CANDIDATE RESULTS</span><h2>Provisional vote totals</h2><p>These results were released after the election closed and automated consistency checks passed. ELECO certification is still required.</p></div><button className="room-export" onClick={()=>downloadCsv(snapshot)}><Download size={16}/> Export totals (CSV)</button></div>
      <div className="room-reconciliation"><CheckCircle2 size={20}/><div><strong>Automated reconciliation passed</strong><span>{fmt(snapshot.reconciliation?.ballotRecords)} ballot records reconciled. This does not independently prove each choice was recorded as intended.</span></div></div>
      <div className="room-filters" aria-label="Filter by contest"><button className={filter==='all'?'selected':''} onClick={()=>setFilter('all')}>All contests</button><button className={filter==='general'?'selected':''} onClick={()=>setFilter('general')}>General offices</button>{['Marine Engineering','Mechanical Engineering','Mechatronics Engineering'].map(d=><button className={filter===d?'selected':''} key={d} onClick={()=>setFilter(d)}>{d.replace(' Engineering','')} VP</button>)}</div>
      <div className="room-contest-grid">{filtered.map(pos=><PositionResult key={pos.id} position={pos}/>)}</div>
      <div className="room-results-footer"><ShieldCheck size={18}/><div><b>Provisional results • Not certified</b><p>Published {dateLabel(snapshot?.publishedAt)} (Nigeria time). Final certification and any election disputes remain ELECO's responsibility.</p></div></div>
    </section>:<div className="room-results-locked"><div className="room-locked-icon">{stage==='open'?<Vote size={30}/>:<Clock3 size={30}/>}</div><h2>{stage==='open'?'Candidate totals are hidden while voting is open':stage==='reconciling'?'Voting has ended. Results are being reconciled.':stage==='review_required'?'Publication paused for review':stage==='upcoming'?'Results will appear after the election':'The election feed is being prepared'}</h2><p>{stage==='open'?'To avoid influencing voters, candidate-by-candidate counts will not be released during voting. Observers can monitor participation here.':stage==='reconciling'?'The backend is checking ballot totals and election records before releasing provisional results. This page will update automatically.':stage==='review_required'?'A reconciliation check requires ELECO and engineering review. Candidate totals will remain withheld until resolved.':stage==='upcoming'?'This read-only page will show turnout during voting and provisional results after an approved publication.':'We are not connected to an active election publication yet.'}</p><span><ShieldCheck size={15}/> Public totals are released only after closure and reconciliation.</span></div>}
   <p className="room-privacy"><Info size={16}/> No student names, identification numbers, individual ballots or live candidate totals are exposed on this page.</p>
 </div></main>;
}
