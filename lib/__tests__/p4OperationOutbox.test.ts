import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './workoutIdentityHarness.ts';

const row = { id:'r',exercise:'Bench',set:1,weightLbs:'100',reps:'8',notes:'',timestamp:1 };
function fixture() {
  let raw: string | null = null;
  const calls: any[]=[];
  let send = async (operation:any) => { calls.push(operation); throw new Error('offline'); };
  const module = sourceModule('lib/sessionOperationOutbox.ts');
  const deps = { read:async()=>raw, write:async(value:string)=>{raw=value;}, send:(op:any)=>send(op) };
  return { create:()=>module.createSessionOperationOutbox(deps), calls, raw:()=>raw, send:(fn:any)=>send=fn };
}
test('failed live edit is durable, revised and retried with the exact identity after restart', async()=>{
  const f=fixture(); const box=f.create();
  await box.rows('u','s','2026-10-08',[row]); await box.flush('u');
  await box.rows('u','s','2026-10-08',[{...row,weightLbs:'120'}]); await box.flush('u');
  assert.equal(f.calls[1].payload.rowId,'r'); assert.ok(f.calls[1].payload.revision>f.calls[0].payload.revision);
  const latest=f.calls[1]; f.send(async(op:any)=>{f.calls.push(op); return {ok:true};});
  await f.create().flush('u'); assert.deepEqual(f.calls[2],latest);
  assert.equal(JSON.parse(f.raw()!).pending.length,0);
});
test('Clear supersedes pending put and retries row tombstones while a new row stays allowed', async()=>{
  const f=fixture(); const box=f.create();
  await box.rows('u','s','2026-10-08',[row]);
  await box.rows('u','s','2026-10-08',[row],'drop');
  await box.rows('u','s','2026-10-08',[{...row,id:'new'}]);
  await box.flush('u'); assert.deepEqual(f.calls.map(op=>op.payload.operation),['drop','put']);
  assert.equal(JSON.parse(f.raw()!).pending.length,2);
  await assert.rejects(box.rows('u','s','2026-10-08',[row]),/Deleted row/);
});
test('acknowledging an in-flight old put cannot remove a newer durable tombstone', async()=>{
  const f=fixture(); const box=f.create(); let release!:(value:any)=>void; let started!:()=>void;
  const barrier=new Promise<void>(r=>started=r);
  f.send((op:any)=>{f.calls.push(op);started();return new Promise(r=>release=r);});
  await box.rows('u','s','2026-10-08',[row]); const flushing=box.flush('u'); await barrier;
  await box.rows('u','s','2026-10-08',[row],'drop'); release({ok:true}); await flushing;
  assert.equal(JSON.parse(f.raw()!).pending[0].payload.operation,'drop');
});
test('explicit abandon is durable before cleanup and prevents subsequent writes to the old identity', async()=>{
  const f=fixture(); const box=f.create();
  await box.rows('u','s','2026-10-08',[row]);
  await box.abandon('u','s','2026-10-08'); await box.flush('u');
  const pending=JSON.parse(f.raw()!).pending;
  assert.equal(pending.at(-1).kind,'delete');
  assert.equal(pending.at(-1).payload.operationKey,'delete:s:terminal:v1');
  await assert.rejects(box.rows('u','s','2026-10-08',[{...row,id:'late'}]),/abandoned/);
  await box.rows('u','new-session','2026-10-08',[row]);
  const before=f.calls.length; await box.flush('other-user'); assert.equal(f.calls.length,before);
});
test('owner-bound HTTP refuses a replacement login before sending the operation',async()=>{
  const auth=sourceModule('lib/auth.ts',{'./supabase':{supabaseAnonKey:'offline',supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'other'},access_token:'offline'}},error:null})}}}});
  await assert.rejects(auth.getAuthHeaders('owner'),/Session operation owner changed/);
  // fetch is not defined in this offline context: reaching the network would throw a
  // ReferenceError instead of the owner error, so this proves the request never starts.
  await assert.rejects(auth.fetchWithAuth('https://offline.invalid/log-set',{method:'POST'},1,'owner'),/Session operation owner changed/);
});
test('actual modal edit gateway reconciles a changed performed row without replacing its identity',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts');
  let rows=[row]; const operations:any[]=[];
  const context:any={draftRowsRef:{current:rows},editingCell:null,applyPendingEdit:(r:any)=>({nextRows:r}),
    setRows:(fn:any)=>{rows=typeof fn==='function'?fn(rows):fn;context.draftRowsRef.current=rows;},
    queueLiveRows:(r:any,op:any)=>{operations.push({r,op});return Promise.resolve();},
    setEditingCell:()=>{},setEditValue:()=>{},useCallback:(fn:any)=>fn};
  context.withPendingRows=sourceClosure('withPendingRows',context);
  const edit=sourceClosure('handleSaveSet',{...context,resequenceSets:(r:any)=>r,normalizeExercise:(s:any)=>s});
  edit({...row,weightLbs:'120'}); await Promise.resolve();
  assert.equal(operations.length,1); assert.equal(operations[0].r[0].id,'r'); assert.equal(operations[0].r[0].weightLbs,'120');
});
test('actual Clear waits for durable row tombstones, cancellation has no operations',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts');
  let actions:any[]=[]; let visible=[row]; let release!:()=>void; const ops:any[]=[];
  const run=sourceClosure('onClearRows',{draftRowsRef:{current:visible},commitPendingAndGet:()=>visible,
    Alert:{alert:(_a:any,_b:any,buttons:any)=>actions=buttons},persistDraftRows:()=>{},
    setRows:(r:any)=>visible=r,setEditingCell:()=>{},setEditValue:()=>{},
    queueLiveRows:(r:any,op:any)=>{ops.push({r,op});return new Promise<void>(r=>release=r);}});
  run(); actions[0].onPress?.(); assert.equal(ops.length,0); assert.equal(visible.length,1);
  const cleared=actions[1].onPress(); await Promise.resolve();
  assert.equal(ops.length,1); assert.equal(ops[0].op,'drop'); assert.equal(visible.length,1);
  release(); await cleared; assert.equal(visible.length,0);
});
test('actual inline commit reconciles its changed performed evidence',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts');const ops:any[]=[];
  const edited={...row,reps:'6'};
  const run=sourceClosure('commitCellEdit',{editingCell:{rowId:'r',field:'reps'},draftRowsRef:{current:[row]},
    applyPendingEdit:()=>({nextRows:[edited],changed:true}),setRows:()=>{},setEditingCell:()=>{},setEditValue:()=>{},
    queueLiveRows:async(r:any)=>ops.push(r),useCallback:(fn:any)=>fn});
  run();await Promise.resolve();assert.equal(ops.length,1);assert.equal(ops[0][0].reps,'6');
});
test('actual confirmed empty End persists abandon before clearing recovery',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts'); const events:string[]=[];
  const run=sourceClosure('onEndWorkout',{workoutActive:true,commitPendingAndGet:()=>[],
    Alert:{alert:(_a:any,_b:any,buttons:any)=>buttons[1].onPress()},setSavePhase:()=>{},
    queueAbandon:async()=>{events.push('abandon');},clearWorkoutDraft:async()=>{events.push('clear');},
    endWorkoutSession:()=>{},setRows:()=>{},setMessageInput:()=>{},setEditingCell:()=>{},setEditValue:()=>{}});
  await run();assert.deepEqual(events,['abandon','clear']);
});
test('actual composer dispatches through the durable session operation gateway',async()=>{
  const {runWorkoutRoute}=await import('./inSessionHarness.ts');const operations:any[]=[];
  const result=await runWorkoutRoute('Bench 100 8',[],undefined,1,false,{queueLiveRows:async(r:any)=>operations.push(r)});
  assert.equal(operations.length,1);assert.equal(operations[0][0].id,result.rows[0].id);
  assert.equal(result.calls.filter(c=>c.method==='logSet').length,0);
});
test('repeating durable drop intent preserves its original retry identity',async()=>{
  const f=fixture();const box=f.create();await box.rows('u','s','2026-10-08',[row],'drop');
  const before=f.raw();await box.rows('u','s','2026-10-08',[row],'drop');assert.equal(f.raw(),before);
});

test('actual reorder reconciles changed set ordinals with unchanged row identities',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts');const ops:any[]=[];
  const original=[row,{...row,id:'second',set:2}];
  const context:any={useCallback:(fn:any)=>fn,draftRowsRef:{current:original},editingCell:null,applyPendingEdit:(r:any)=>({nextRows:r}),
    setRows:(fn:any)=>fn(original),resequenceSets:(r:any[])=>r.map((v,i)=>({...v,set:i+1})),
    queueLiveRows:async(r:any)=>ops.push(r)};
  context.withPendingRows=sourceClosure('withPendingRows',context);
  const run=sourceClosure('handleReorderRow',context);
  run(0,1,'r');await Promise.resolve();assert.equal(ops.length,1);
  assert.deepEqual(Array.from(ops[0],(r:any)=>[r.id,r.set]),[['second',1],['r',2]]);
});

test('switching inline focus reconciles the prior performed correction',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts'); const ops:any[]=[];
  const run=sourceClosure('beginCellEdit',{editingCell:{rowId:'r',field:'reps'},rows:[row],
    applyPendingEdit:()=>({nextRows:[{...row,reps:'6'}],changed:true}),setRows:()=>{},
    queueLiveRows:async(r:any)=>ops.push(r),setEditingCell:()=>{},setEditValue:()=>{},
    requestAnimationFrame:()=>{},scrollRef:{current:null}});
  run('second','reps','8');await Promise.resolve();assert.equal(ops.length,1);assert.equal(ops[0][0].reps,'6');
});

test('composer pending edit commits live correction while End snapshot can suppress pre-confirmation IO',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts');const ops:any[]=[];
  const run=sourceClosure('commitPendingAndGet',{workoutActive:true,editingCell:{rowId:'r',field:'reps'},draftRowsRef:{current:[row]},
    applyPendingEdit:()=>({nextRows:[{...row,reps:'6'}],changed:true}),setRows:()=>{},setEditingCell:()=>{},setEditValue:()=>{},
    queueLiveRows:async(r:any)=>ops.push(r)});
  run(false);await Promise.resolve();assert.equal(ops.length,0);
  run();await Promise.resolve();assert.equal(ops.length,1);assert.equal(ops[0][0].id,'r');
});

test('actual deletion reconciles remaining performed row ordinals after the durable tombstone',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts');const ops:any[]=[];
  const rows=[row,{...row,id:'second',set:2}];
  const run=sourceClosure('deleteRow',{draftRowsRef:{current:rows},applyPendingEdit:()=>({invalid:false}),
    queueLiveRows:async(r:any,op:any)=>ops.push({r,op}),resequenceSets:(r:any[])=>r.map((v,i)=>({...v,set:i+1})),
    persistDraftRows:()=>{},setRows:()=>{},setEditingCell:()=>{},setEditValue:()=>{}});
  await run('r');assert.equal(ops.length,2);assert.equal(ops[0].op,'drop');
  assert.equal(ops[1].r[0].id,'second');assert.equal(ops[1].r[0].set,1);
});

test('actual inline incomplete correction retracts prior live evidence',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts'); const ops:any[]=[];
  const run=sourceClosure('commitCellEdit',{editingCell:{rowId:'r',field:'reps'},draftRowsRef:{current:[row]},
    applyPendingEdit:()=>({nextRows:[{...row,reps:'',performance:'planned'}],changed:true}),
    setRows:()=>{},setEditingCell:()=>{},setEditValue:()=>{},queueLiveRows:async(r:any,op:any)=>ops.push({r,op}),useCallback:(fn:any)=>fn});
  run(); await Promise.resolve(); assert.equal(ops.length,1); assert.equal(ops[0].op,'revise');
  assert.equal(ops[0].r[0].id,'r');
});

test('actual performed-to-incomplete edit retracts evidence without terminally deleting the stable row',async()=>{
  const {sourceClosure}=await import('./workoutIdentityHarness.ts'); const ops:any[]=[];
  const run=sourceClosure('withPendingRows',{draftRowsRef:{current:[row]},editingCell:null,
    applyPendingEdit:(r:any)=>({nextRows:r}),useCallback:(fn:any)=>fn,setRows:(fn:any)=>fn([row]),
    setEditingCell:()=>{},setEditValue:()=>{},queueLiveRows:async(r:any,op:any)=>ops.push({r,op})});
  run((rows:any[])=>rows.map(r=>({...r,reps:'',performance:'planned'})));
  await Promise.resolve();assert.equal(ops.length,1);assert.equal(ops[0].op,'revise');assert.equal(ops[0].r[0].id,'r');
});

test('account-deletion purge removes only the deleted owner pending, seen and abandoned entries',async()=>{
  const f=fixture(); const box=f.create();
  await box.rows('a','sa','2026-10-08',[row]); await box.rows('b','sb','2026-10-08',[row]);
  await box.abandon('a','sa-old','2026-10-08'); await box.abandon('b','sb-old','2026-10-08');
  await box.purge('a');
  const state=JSON.parse(f.raw()!);
  assert.deepEqual(state.pending.map((op:any)=>op.owner).filter((o:string)=>o==='a'),[]);
  assert.ok(state.pending.some((op:any)=>op.owner==='b'));
  assert.deepEqual(Object.keys(state.seen).filter(k=>JSON.parse(k)[0]==='a'),[]);
  assert.ok(Object.keys(state.seen).some(k=>JSON.parse(k)[0]==='b'));
  assert.deepEqual(state.abandoned.filter((k:string)=>JSON.parse(k)[0]==='a'),[]);
  assert.deepEqual(state.abandoned,[JSON.stringify(['b','sb-old',''])]);
  f.send(async(op:any)=>{f.calls.push(op);return {ok:true};});
  assert.equal(await f.create().flush('a'),0);
  assert.ok(f.calls.every((op:any)=>op.owner!=='a'));
});
test('terminal server rejection leaves the queue; transient failure keeps the exact identity',async()=>{
  const f=fixture(); const box=f.create();
  await box.rows('u','s','2026-10-08',[row]); await box.rows('u','s2','2026-10-08',[row]);
  f.send(async(op:any)=>{f.calls.push(op); return op.sessionId==='s' ? {ok:false,terminal:true,code:'legacy_session'} : null;});
  let receipts=0;
  await box.flush('u',()=>{receipts++;});
  assert.equal(receipts,0);
  const pending=JSON.parse(f.raw()!).pending;
  assert.deepEqual(pending.map((op:any)=>op.sessionId),['s2']);
  const before=f.calls.length; await box.flush('u');
  assert.deepEqual(f.calls.slice(before).map((op:any)=>op.sessionId),['s2']);
});
test('operation HTTP classification: 403/409 terminal, 5xx/429/network transient, 2xx receipt',()=>{
  const { classifyOperationResponse: raw }=sourceModule('lib/sessionOperationOutbox.ts');
  const classifyOperationResponse=(status:number,body:unknown)=>JSON.parse(JSON.stringify(raw(status,body)));
  assert.deepEqual(classifyOperationResponse(409,{error:'x',code:'legacy_session'}),{ok:false,terminal:true,code:'legacy_session'});
  assert.deepEqual(classifyOperationResponse(403,{error:'x',code:'forbidden'}),{ok:false,terminal:true,code:'forbidden'});
  // Only a known stable code is terminal: a gateway/WAF 403 page or an unknown code stays transient.
  for (const body of [null,'<html>forbidden</html>',{error:'x'},{error:'x',code:'something_else'}]) {
    assert.equal(classifyOperationResponse(403,body),null,JSON.stringify(body));
    assert.equal(classifyOperationResponse(409,body),null,JSON.stringify(body));
  }
  for (const status of [500,502,503,429,401]) assert.equal(classifyOperationResponse(status,{error:'x'}),null,String(status));
  assert.deepEqual(classifyOperationResponse(200,{ok:true,pr:null}),{ok:true,pr:null});
});

test('QUALITY: a transient failure blocks later operations of the same session in that pass (abandon delete waits for its bootstrap)',async()=>{
  const f=fixture(); const box=f.create();
  await box.abandon('u','s','2026-10-08');
  await box.rows('u','other','2026-10-08',[row]);
  const kinds:string[]=[];
  f.send(async(op:any)=>{kinds.push(`${op.sessionId}:${op.kind}`); return null;});
  await box.flush('u');
  assert.deepEqual(kinds,['s:row','other:row'],'delete not sent after its bootstrap failed; other sessions continue');
  assert.equal(JSON.parse(f.raw()!).pending.length,3);
  f.send(async(op:any)=>{kinds.push(`${op.sessionId}:${op.kind}`); return {ok:true};});
  await box.flush('u');
  assert.deepEqual(kinds.slice(2),['s:row','s:delete','other:row']);
  assert.equal(JSON.parse(f.raw()!).pending.length,0);
});
test('QUALITY: an acknowledged session delete prunes that session from the seen ledger; the abandon fence stays',async()=>{
  const f=fixture(); const box=f.create();
  await box.rows('u','s','2026-10-08',[row,{...row,id:'r2'}]);
  await box.abandon('u','s','2026-10-08');
  await box.rows('u','keep','2026-10-08',[row]);
  f.send(async()=>({ok:true}));
  await box.flush('u');
  const state=JSON.parse(f.raw()!);
  assert.deepEqual(Object.keys(state.seen).filter(k=>JSON.parse(k)[1]==='s'),[]);
  assert.ok(Object.keys(state.seen).some(k=>JSON.parse(k)[1]==='keep'));
  assert.ok(state.abandoned.includes(JSON.stringify(['u','s',''])));
  await assert.rejects(box.rows('u','s','2026-10-08',[row]),/abandoned/);
});
