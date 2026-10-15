'use client';
import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { api, auth } from '../../lib/firebase';
type Booking = { id:string; status:string; check_in:string; check_out:string; firebase_uid:string };
export default function Admin() {
  const [rows,setRows]=useState<Booking[]>([]);
  const [message,setMessage]=useState('Sign in using a Firebase UID listed in ADMIN_UIDS.');
  const [busy,setBusy]=useState(false);
  async function run(fn:()=>Promise<void>) {
    setBusy(true);
    try { await fn(); setMessage('Updated.'); } catch(e) {setMessage((e as Error).message);} finally {setBusy(false);}
  }
  async function load(){setRows(await api('admin/bookings',{},true));}
  return <><header><a className="brand" href="/">WH<span>ADMIN</span></a><a href="/">Customer website</a></header><main><h1>Booking requests</h1><p>Starter dashboard: review the latest 200 requests. Room editing and custom staff roles are planned.</p><div className="row"><button disabled={busy} onClick={()=>void run(async()=>{await signInWithPopup(auth(),new GoogleAuthProvider());await load();})}>Sign in with Google</button><button disabled={busy} onClick={()=>void run(load)}>Refresh</button></div><p role="status">{message}</p>{rows.map(b=><section className="booking" key={b.id}><strong>{b.status}</strong><p>{b.id}</p><p>{String(b.check_in).slice(0,10)} → {String(b.check_out).slice(0,10)}</p><small>Guest UID: {b.firebase_uid}</small>{b.status==='PENDING_APPROVAL'&&<div className="row">{['accept','reject'].map(action=><button disabled={busy} key={action} onClick={()=>void run(async()=>{await api(`admin/bookings/${b.id}`,{method:'PATCH',body:JSON.stringify({action})},true);await load();})}>{action}</button>)}</div>}</section>)}</main></>;
}
