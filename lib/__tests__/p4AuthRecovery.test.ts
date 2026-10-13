import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule, sourceClosure } from './workoutIdentityHarness.ts';

const draft = { ownerId: 'owner-a', workoutId: 's-owner-a', dateISO: '2026-10-07', bodyParts: ['Push'], createdAt: 1, updatedAt: 2, rows: [{id:'r-owner-a', exercise:'Bench', set:1, weightLbs:'100', reps:'8', notes:'', timestamp:1, pendingInput:' exact input  '} ] };
function fixture() {
  const values = new Map<string,string>();
  const storage = {getItem:async(k:string)=>values.get(k)??null,setItem:async(k:string,v:string)=>{values.set(k,v);},removeItem:async(k:string)=>{values.delete(k);},getAllKeys:async()=>[...values.keys()],multiRemove:async(keys:string[])=>{keys.forEach(k=>values.delete(k));}};
  const helper=sourceModule('lib/workoutDraft.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage}});
  return {values,storage,helper};
}
test('actual AuthProvider signOut retains exact owned recovery and fences pre-signout autosave',async()=>{
  const f=fixture(); await f.helper.saveWorkoutDraft(draft); const before=[...f.values.values()][0]; const generation=f.helper.getWorkoutDraftGeneration();
  const events:string[]=[];let state=0;
  const provider=sourceModule('contexts/AuthProvider.tsx',{
    '@/lib/supabase':{supabase:{auth:{signOut:async()=>events.push('signOut')}}},
    '@/lib/iap':{logOutRevenueCat:async()=>events.push('revenueCat')},
    '@/lib/workoutDraft':f.helper,'@/lib/workoutStorage':{clearWorkouts:async()=>{}},'@/lib/onboardingDraft':{clearOnboardingDraft:async()=>{}},'@/lib/exerciseLibrary':{clearExerciseCache:async()=>{}},
    '@react-native-async-storage/async-storage':{__esModule:true,default:f.storage},
    react:{createContext:()=>({Provider:'provider'}),useContext:()=>{},useEffect:()=>{},useState:()=>[state++===0?{user:{id:'owner-a'}}:false,()=>{}]},
    'react/jsx-runtime':{jsx:(_t:any,p:any)=>p},
  });
  await provider.AuthProvider({children:null}).value.signOut();
  assert.equal([...f.values.values()][0],before);
  await f.helper.saveWorkoutDraft({...draft,rows:[]},generation);
  assert.equal([...f.values.values()][0],before);assert.deepEqual(events,['revenueCat','signOut']);
});
async function tick(){for(let i=0;i<25;i++)await Promise.resolve();}
function restoreEffect(context:any){
  const source=readFileSync(new URL('../../app/(tabs)/index.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('route.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback='';
  const start=source.indexOf('Draft persistence: restore on mount');
  const visit=(n:ts.Node)=>{if(!callback&&ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.getStart(ast)>start)callback=n.arguments[0].getText(ast);ts.forEachChild(n,visit);};visit(ast);
  const exports:any={};vm.runInNewContext(ts.transpileModule(`exports.run=${callback}`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,...context});return exports.run();
}
for(const ownerId of ['owner-a',undefined])test(`actual route refuses foreign/unknown recovery ${ownerId}`,async()=>{
  const f=fixture();const stored={...draft,ownerId};await f.helper.saveWorkoutDraft(stored);const before=[...f.values.values()][0];const rows:any[]=[];let checked=false;const notices:string[]=[];
  const context={...f.helper,recoveryOwnerRef:{current:null},session:{user:{id:'owner-b'}},sessionProvenanceRef:{current:null},setRows:(v:any)=>rows.push(...v),restoreWorkoutSession:()=>rows.push('RESTORED'),setDraftChecked:(v:boolean)=>checked=v,showToast:(v:string)=>notices.push(v),setDraftRestoredToast:()=>{},draftToastTimerRef:{current:null},setTimeout:()=>1,clearTimeout:()=>{},endWorkoutSession:()=>{},setMessageInput:()=>{},setEditingCell:()=>{},setEditValue:()=>{},setLoading:()=>{},setCoachAnswer:()=>{},setCoachOpen:()=>{},setReviewModalVisible:()=>{},setNameModalVisible:()=>{},setRoutineModalVisible:()=>{}};
  restoreEffect(context);await tick();assert.deepEqual(rows,[]);assert.equal(checked,false);assert.ok(notices.length);assert.equal([...f.values.values()][0],before);
});
test('actual route cannot label A session rows as B in actual durable outbox',async()=>{
  let raw:string|null=null;
  const outbox=sourceModule('lib/sessionOperationOutbox.ts').createSessionOperationOutbox({read:async()=>raw,write:async(v:string)=>raw=v,send:async()=>({ok:true})});
  const context:any={session:{user:{id:'owner-b'}},workoutId:draft.workoutId,workoutDateISO:draft.dateISO,sessionProvenanceRef:{current:{ownerId:'owner-a',generation:0}},sessionOperations:outbox,useCallback:(fn:any)=>fn,celebratePR:()=>{},canUseSession:()=>false};
  const run=sourceClosure('queueLiveRows',context);await assert.rejects(run(draft.rows));assert.equal(raw,null);
});
test('owned save cannot overwrite foreign or legacy unknown bytes',async()=>{
  for(const ownerId of ['owner-a',undefined]){
    const f=fixture();await f.helper.saveWorkoutDraft({...draft,ownerId});const before=[...f.values.values()][0];
    await assert.rejects(f.helper.saveWorkoutDraft({...draft,ownerId:'owner-b',rows:[]}));assert.equal([...f.values.values()][0],before);
  }
});
test('stale owner-specific clear cannot delete another owner recovery',async()=>{
  const f=fixture();await f.helper.saveWorkoutDraft(draft);const before=[...f.values.values()][0];
  await assert.rejects(f.helper.clearWorkoutDraft('owner-b',f.helper.getWorkoutDraftGeneration()));assert.equal([...f.values.values()][0],before);
});
for(const name of ['beginCellEdit','commitCellEdit','withPendingRows','handleReorderRow','handleOpenEditSet','onClearRows','onEndWorkout','handleEndWorkoutWithReview','sendMessage','submitCoachQuestion'])test(`actual ${name} is fenced after auth change before rerender`,async()=>{
  const f=fixture();let effects=0;const context:any={...f.helper,canUseSession:()=>false,useCallback:(fn:any)=>fn,workoutActive:true,rows:draft.rows,draftRowsRef:{current:draft.rows},editingCell:{rowId:'r-owner-a',field:'notes'},editValue:'new',messageInput:'Bench 100 8',loading:false,coachQuestion:'question',coachLoading:false,setRows:()=>effects++,setEditingCell:()=>effects++,setEditValue:()=>effects++,setTargetRowId:()=>effects++,setEditSetModalVisible:()=>effects++,invalidateResponses:()=>effects++,withPendingRows:()=>effects++,applyPendingEdit:()=>({nextRows:draft.rows,changed:false}),Alert:{alert:()=>effects++},setSavePhase:()=>effects++,scrollRef:{current:null},requestAnimationFrame:()=>effects++,showToast:()=>effects++,setReviewModalVisible:()=>effects++};
  if(name==='handleEndWorkoutWithReview') await sourceClosure(name,context)(draft.rows); else await sourceClosure(name,context)('r-owner-a','notes','new');assert.equal(effects,0);
});
test('actual AuthProvider fences auth events before render and ignores stale initial session',async()=>{
  const f=fixture();await f.helper.saveWorkoutDraft(draft);const raw=[...f.values.values()][0];
  let effect:any, listener:any, resolveInitial:any;const states:any[]=[];let index=0;
  const provider=sourceModule('contexts/AuthProvider.tsx',{
    '@/lib/supabase':{supabase:{auth:{getSession:()=>new Promise(r=>resolveInitial=r),onAuthStateChange:(fn:any)=>{listener=fn;return {data:{subscription:{unsubscribe:()=>{}}}}}}}},
    '@/lib/iap':{},'@/lib/workoutDraft':f.helper,'@/lib/workoutStorage':{},'@/lib/onboardingDraft':{},'@/lib/exerciseLibrary':{},'@react-native-async-storage/async-storage':{__esModule:true,default:f.storage},
    react:{createContext:()=>({Provider:'provider'}),useContext:()=>{},useEffect:(fn:any)=>effect=fn,useState:()=>[index++===0?null:true,(value:any)=>states.push(value)]},'react/jsx-runtime':{jsx:(_t:any,p:any)=>p},
  });
  provider.AuthProvider({children:null});const dispose=effect();const generation=f.helper.getWorkoutDraftGeneration();
  listener('SIGNED_IN',{user:{id:'owner-b'}});
  assert.ok(f.helper.getWorkoutDraftGeneration()>generation);
  resolveInitial({data:{session:{user:{id:'owner-a'}}}});await tick();
  assert.equal(states.filter(x=>x?.user).at(-1).user.id,'owner-b');assert.equal([...f.values.values()][0],raw);dispose();
});

// Real route guards, not the harness's permissive default: the rightful owner
// must keep access after its own End/cleanup advances the draft generation.
function ownedEndContext(f:ReturnType<typeof fixture>,rows:any[]){
  const generation=f.helper.getWorkoutDraftGeneration();const ownership=sourceModule('lib/sessionOwnership.ts').createSessionOwnership('user:owner-a');
  const effects:string[]=[];const started:any[]=[];
  const context:any={...f.helper,session:{user:{id:'owner-a'}},sessionProvenanceRef:{current:{ownerId:'owner-a',generation}},recoveryOwnerRef:{current:{ownerId:'owner-a',generation}},useCallback:(fn:any)=>fn,
    ownership,renderOwner:ownership.capture(),draftGeneration:generation,draftGenerationRef:{current:{workoutId:draft.workoutId,generation}},workoutId:draft.workoutId,workoutDateISO:draft.dateISO,workoutCreatedAt:1,bodyParts:['Push'],workoutActive:true,draftChecked:true,
    rows,draftRowsRef:{current:rows},commitPendingAndGet:()=>rows,Alert:{alert:(_t:any,_m:any,buttons:any[])=>buttons[1].onPress()},queueAbandon:async()=>{},
    api:{generateSessionReview:async()=>null},buildWorkoutToSave:(r:any[])=>({id:draft.workoutId,rows:r}),saveWorkoutLocalFirst:async()=>({synced:true}),selectedPart:'Push',savedWorkoutIdRef:{current:null},
    invalidateResponses:()=>ownership.invalidateRequests(),setSavePhase:(v:string)=>effects.push(`phase:${v}`),showToast:(v:string)=>effects.push(`toast:${v}`),endWorkoutSession:()=>effects.push('end'),
    setRows:()=>{},setMessageInput:()=>{},setEditingCell:()=>{},setEditValue:()=>{},setReviewModalVisible:()=>{},setReviewLoading:()=>{},setSessionReview:()=>{},
    draftSaveTimerRef:{current:null},clearTimeout:()=>{},beginWorkoutSession:(parts:any)=>started.push(parts),Platform:{OS:'web'},console:{error:()=>{}}};
  context.canUseSession=sourceClosure('canUseSession',context);context.canStartSession=sourceClosure('canStartSession',context);context.restampOwner=sourceClosure('restampOwner',context);
  return {context,effects,started};
}
for(const performed of [false,true])test(`actual ${performed?'performed':'empty'} End success leaves the same owner able to Start`,async()=>{
  const f=fixture();await f.helper.saveWorkoutDraft(draft);const {context,effects,started}=ownedEndContext(f,performed?draft.rows:[]);
  if(performed)await sourceClosure('handleEndWorkoutWithReview',context)(draft.rows);else await sourceClosure('onEndWorkout',context)();
  assert.ok(effects.includes('end'));assert.equal(f.values.size,0);
  Object.assign(context,{workoutActive:false});sourceClosure('startWorkoutSession',context)(['Pull']);
  assert.deepEqual(JSON.parse(JSON.stringify(started)),[['Pull']]);assert.equal(context.canUseSession(),true);
});
for(const performed of [false,true])test(`actual ${performed?'performed':'empty'} End cleanup failure keeps the same owner able to edit and retry`,async()=>{
  const f=fixture();await f.helper.saveWorkoutDraft(draft);const before=[...f.values.values()][0];f.storage.removeItem=async()=>{throw new Error('clear failed');};
  const {context,effects}=ownedEndContext(f,performed?draft.rows:[]);
  if(performed)await sourceClosure('handleEndWorkoutWithReview',context)(draft.rows);else await sourceClosure('onEndWorkout',context)();
  assert.ok(effects.includes('phase:failed'));assert.equal([...f.values.values()][0],before);assert.equal(context.canUseSession(),true);
  Object.assign(context,{draftGeneration:context.draftGenerationRef.current.generation});
  sourceClosure('persistDraftRows',context)([{...draft.rows[0],notes:'retry edit'}]);await tick();
  assert.equal(JSON.parse([...f.values.values()][0]).rows[0].notes,'retry edit');
});

function authProvider(f:ReturnType<typeof fixture>){
  let state=0;
  return sourceModule('contexts/AuthProvider.tsx',{
    '@/lib/supabase':{supabase:{auth:{signOut:async()=>{}}}},'@/lib/iap':{logOutRevenueCat:async()=>{}},
    '@/lib/workoutDraft':f.helper,'@/lib/workoutStorage':{clearWorkouts:async()=>{}},'@/lib/onboardingDraft':{clearOnboardingDraft:async()=>{}},'@/lib/exerciseLibrary':{clearExerciseCache:async()=>{}},
    '@react-native-async-storage/async-storage':{__esModule:true,default:f.storage},
    react:{createContext:()=>({Provider:'provider'}),useContext:()=>{},useEffect:()=>{},useState:()=>[state++===0?{user:{id:'owner-a'}}:false,()=>{}]},
    'react/jsx-runtime':{jsx:(_t:any,p:any)=>p},
  }).AuthProvider({children:null}).value;
}
test('Settings Clear Cache without sign-out keeps the signed-in owner session usable',async()=>{
  const f=fixture();await f.helper.saveWorkoutDraft(draft);const before=[...f.values.values()][0];const generation=f.helper.getWorkoutDraftGeneration();
  await authProvider(f).clearAllCaches();
  assert.equal(f.helper.getWorkoutDraftGeneration(),generation);assert.equal([...f.values.values()][0],before);
});
function reviewModalProps(context:any){
  const source=readFileSync(new URL('../../app/(tabs)/index.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('route.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let element='';
  const visit=(n:ts.Node)=>{if(!element&&ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='SessionReviewModal')element=n.getText(ast);ts.forEachChild(n,visit);};visit(ast);
  const exports:any={};vm.runInNewContext(ts.transpileModule(`exports.node=${element};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:()=>({jsx:(_t:any,p:any)=>p}),SessionReviewModal:'SessionReviewModal',...context});
  return exports.node;
}
test('actual review modal closes and saves reflection after a successful End, but not after auth fence',async()=>{
  const f=fixture();await f.helper.saveWorkoutDraft(draft);const {context}=ownedEndContext(f,draft.rows);
  await sourceClosure('handleEndWorkoutWithReview',context)(draft.rows);
  const closes:any[]=[];const metas:any[]=[];
  Object.assign(context,{reviewModalVisible:true,savePhase:'saved',reviewLoading:false,sessionReview:null,title:'Push',onEndWorkout:()=>{},workoutActive:false,setReviewModalVisible:(v:any)=>closes.push(v),savedWorkoutIdRef:{current:draft.workoutId},api:{updateWorkoutMeta:async(...a:any[])=>{metas.push(a);}}});
  context.ownsPresentation=sourceClosure('ownsPresentation',context);
  let props=reviewModalProps(context);props.onSaveReflection('felt strong');props.onClose();
  assert.deepEqual(closes,[false]);assert.equal(metas.length,1);
  f.helper.fenceWorkoutDraft();context.savedWorkoutIdRef.current=draft.workoutId;props=reviewModalProps(context);props.onSaveReflection('late');
  assert.equal(metas.length,1);
});
test('actual rest entry sink refuses append after auth fence before rerender',()=>{
  const f=fixture();const {context}=ownedEndContext(f,draft.rows);let sink:any;let appended=0;
  Object.assign(context,{registerRestEntrySink:(fn:any)=>{sink=fn;return ()=>{};},setRows:()=>appended++,scrollToBottom:()=>{},makeRestRow:()=>({}),sessionOwnerKey:'k'});
  const source=readFileSync(new URL('../../app/(tabs)/index.tsx',import.meta.url),'utf8');const start=source.indexOf('When a rest timer is started');
  const ast=ts.createSourceFile('route.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback='';
  const visit=(n:ts.Node)=>{if(!callback&&ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.getStart(ast)>start)callback=n.arguments[0].getText(ast);ts.forEachChild(n,visit);};visit(ast);
  const exports:any={};vm.runInNewContext(ts.transpileModule(`exports.run=${callback}`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,...context});exports.run();
  sink({durationSec:60});assert.equal(appended,1);
  f.helper.fenceWorkoutDraft();sink({durationSec:60});assert.equal(appended,1);
});
export {fixture,draft};
