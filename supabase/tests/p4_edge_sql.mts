// Actual API -> actual Edge -> disposable SQL only, no provider/network.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import vm from 'node:vm';
import * as validation from '../../lib/workoutValidation.ts';
import { isPerformedRow } from '../../lib/performedSets.ts';
import * as nextSetDecision from '../../lib/nextSetDecision.ts';
const base = process.env.P4_FIXTURE!;
assert.ok(process.env.P4_SCRATCH && base.startsWith(`${process.env.P4_SCRATCH}/p4-pg-`), 'only the disposable cluster created by p4_session_sql.py');
assert.equal(realpathSync(base),base);
assert.equal(readFileSync(`${base}/data/PG_VERSION`,'utf8').trim(),'15');
const sql = (text: string) => execFileSync('/opt/homebrew/opt/postgresql@15/bin/psql', ['-h',`${base}/socket`,'-p','55484','-d','postgres','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'], {input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
assert.equal(sql('SHOW listen_addresses;'),'');
function module(path: string, dependencies: any) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},Response,Request,URL,console,Deno:{env:{get:()=> 'offline'}},setTimeout,clearTimeout});
  return exports;
}
const lift = module('supabase/functions/_shared/liftMatching.ts',{'./workoutValidation.ts':validation});
const rpcCalls: any[]=[];
let corruptProjection:((payload:any)=>void)|undefined;
const client = {
  auth:{getUser:async()=>({data:{user:{id:'00000000-0000-0000-0000-000000000001'}},error:null})},
  rpc:async(name:string,args:any)=>{
    assert.equal(name,'apply_workout_operation'); rpcCalls.push(args);
    // Explicit adversarial transport injection after actual Edge projection:
    // SQL must reject fabricated logRows, not merely trust the Edge filter.
    if(args.p_kind==='finalize' && corruptProjection) corruptProjection(args.p_payload);
    const q=(v:any)=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`;
    try {
      const result=sql(`SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'; SELECT public.apply_workout_operation(${q(args.p_session_id)},${q(args.p_operation_key)},${args.p_revision},${q(args.p_kind)},${q(args.p_row_id)},${q(JSON.stringify(args.p_payload))}::jsonb);`);
      return {data:JSON.parse(result.split('\n').at(-1)!),error:null};
    } catch (error:any) {
      // Pass the real SQLSTATE through, as PostgREST does (psql VERBOSITY verbose: "ERROR:  P0001: msg").
      const match=/ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/.exec(String(error?.stderr ?? ''));
      return {data:null,error:match?{code:match[1],message:match[2]}:{message:'real SQL rejection'}};
    }
  },
  from:(table:string)=>{
    assert.equal(table,'pr_tracked_lifts');
    const chain:any={select:()=>chain,eq:()=>chain,then:(resolve:any,reject:any)=>Promise.resolve({data:[],error:null}).then(resolve,reject)};
    return chain;
  },
};
const handlers:any={};
for(const name of ['log-set','history']) module(`supabase/functions/${name}/index.ts`,{
  'https://deno.land/std@0.168.0/http/server.ts':{serve:(fn:any)=>handlers[name]=fn},
  'https://esm.sh/@supabase/supabase-js@2.50.1':{createClient:()=>client},
  '../_shared/liftMatching.ts':lift,'../_shared/workoutValidation.ts':validation,
  '../_shared/operationErrors.ts':module('supabase/functions/_shared/operationErrors.ts',{}),
});
let loseDeleteAck=false;
let committedDeleteReceipt:any;
const deleteBodies:any[]=[];
const apiDependencies={
  './performedSets':{isPerformedRow},'./nextSetDecision':nextSetDecision,'./supabase':{supabaseUrl:'https://offline.invalid'},
  './auth':{fetchWithAuth:async(url:string,options:any)=>{
    const path=new URL(url).pathname;
    const name=path.includes('/history')?'history':path.split('/').at(-1)!;
    if(options.method==='DELETE') deleteBodies.push(JSON.parse(options.body));
    const response=await handlers[name](new Request(url,{...options,headers:{Authorization:'Bearer offline'}}));
    if(options.method==='DELETE' && response.ok && loseDeleteAck) {
      committedDeleteReceipt=JSON.parse(sql("SELECT receipt FROM workout_operation_receipts WHERE session_id='edge-session' AND request->>'kind'='delete';"));
      loseDeleteAck=false;
      throw new Error('ack lost after real SQL commit');
    }
    return response;
  }},'./profile':{fetchProfile:async()=>null},'./entitlements':{parseFeatureGateError:()=>null},
  './nutrition':{},'./coaching':{},'./programming':{},'./bodyMetrics':{},'./exerciseLibrary':{},
};
const api=module('lib/api.ts',apiDependencies).api;
const strength={id:'edge-row',exercise:'Bench',set:1,weightLbs:'0',reps:'0',notes:'raw bodyweight zero',performance:'performed'};
const cardio={id:'edge-cardio',exercise:'Run',set:2,weightLbs:'',reps:'',notes:'raw cardio',performance:'performed',isCardio:true,durationMins:0,heartRate:120.5,calories:0,level:1.5};
const live={...cardio,sessionId:'edge-session',rowId:cardio.id,revision:1,operationKey:'put:edge-cardio:1',dateISO:'2026-10-08'};
assert.equal((await api.logSet(live))?.ok,true);
assert.equal((await api.logSet(live))?.ok,true);
const session={id:'edge-session',revision:2,operationKey:'final:edge:2',dateISO:'2026-10-08',part:'Mixed',createdAt:1,rows:[strength,cardio]};
await api.saveWorkout(session); await api.saveWorkout(session);
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='edge-session';"),'2');
const snapshot=JSON.parse(sql("SELECT rows_json FROM workouts WHERE id='edge-session';"));
assert.deepEqual(snapshot,session.rows);
const result=JSON.parse(sql("SELECT json_agg(json_build_object('id',p4_row_id,'load',weight_lbs,'reps',reps,'hr',heart_rate,'calories',calories,'level',level) ORDER BY p4_row_id) FROM workout_log WHERE p4_session_id='edge-session';"));
assert.equal(result[0].hr,120.5); assert.equal(result[0].calories,0); assert.equal(result[0].level,1.5);
assert.equal(result[1].load,'0'); assert.equal(result[1].reps,'0');
assert.equal(await api.logSet({...live,rowId:'late',id:'late',operationKey:'late:1'}),null);
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='edge-session';"),'2');
assert.equal(rpcCalls.every(c=>!('p_user_id' in c)),true);
const positive={...strength,id:'pr-row',sessionId:'pr-session',rowId:'pr-row',revision:1,operationKey:'put:pr-row:1',dateISO:'2026-10-08',weightLbs:'100',reps:'8'};
const prReceipt=await api.logSet(positive);
assert.equal(prReceipt?.pr?.newE1rm,126.7,'PR ack must come from the committed SQL operation');
assert.deepEqual((await api.logSet(positive))?.pr,prReceipt.pr);
let capacityReadbacks=0;
for (const [index,value] of [120.5,0,2147483648,Number.MAX_SAFE_INTEGER,1e100,Number.MAX_VALUE,Number.MIN_VALUE,undefined].entries()) {
  const row={id:`capacity-row-${index}`,exercise:'Run',set:1,weightLbs:'',reps:'',notes:'raw metric evidence',isCardio:true,...(value===undefined?{}:{heartRate:value,calories:value,level:value})};
  const sid=`capacity-session-${index}`;
  assert.equal((await api.logSet({...row,sessionId:sid,rowId:row.id,revision:1,operationKey:`put:${index}`,dateISO:'2026-10-08'}))?.ok,true);
  const read=()=>JSON.parse(sql(`SELECT json_build_object('hr',heart_rate,'calories',calories,'level',level) FROM workout_log WHERE p4_session_id='${sid}';`));
  for(const metric of ['hr','calories','level']) assert.equal(read()[metric],value??null);
  capacityReadbacks++;
  await api.saveWorkout({id:sid,revision:2,operationKey:`final:${index}`,dateISO:'2026-10-08',part:'Cardio',createdAt:1,rows:[row]});
  for(const metric of ['hr','calories','level']) assert.equal(read()[metric],value??null);
  capacityReadbacks++;
}
assert.equal(capacityReadbacks,16);
assert.equal(rpcCalls.length,23,'retained baseline RPC calls');
// Compare direct authenticated SQL against the actual shared row contract, not
// a second hand-authored expected-validity implementation. Unknown legacy fields
// stay compatible; explicit null is distinct from omission on known metadata.
const parityRows:any[]=[
  strength,cardio,{...strength,performance:undefined,set:undefined,notes:undefined},
  {...strength,weightLbs:null,reps:''},{...strength,weightLbs:Number.MAX_VALUE,reps:Number.MAX_SAFE_INTEGER},
  {...strength,weightLbs:Number.MIN_VALUE,set:Number.MAX_SAFE_INTEGER},
  {...cardio,isRest:false,weightLbs:null,reps:null,level:Number.MAX_VALUE},
  {...strength,plannedTarget:{reps:'',weightLbs:''},future:{unknown:['raw']}},
  null,[],{...strength,performance:'unknown-enum'},{...strength,weightLbs:'NaN'},
  {...strength,setKind:null},{...strength,status:null},{...strength,distanceUnit:null},
  {...strength,plannedTarget:{reps:null}},{...strength,plannedTarget:{reps:'1',weightLbs:0}},
  {...strength,isCardio:0},{...strength,isRest:'false'},{...strength,set:'1.0'},
  {...strength,heartRate:'0'},{...strength,timestamp:null},{...strength,reps:Number.MAX_SAFE_INTEGER+1},
  {...cardio,weightLbs:[]},{...strength,performance:'planned',weightLbs:'NaN'},
];
let parityChecks=0;
for(const [index,input] of parityRows.entries()) for(const kind of ['put','finalize']) {
  const row=input && !Array.isArray(input)?{...input,id:`parity-row-${index}`}:input;
  const sid=`parity-${kind}-${index}`;
  const invalid=Boolean(validation.validateWorkoutRow(row,kind==='put'));
  const eligible=!validation.validateWorkoutRow(row,true) && !row?.isRest && row?.status!=='syncing' && row?.performance!=='planned';
  const payload=kind==='put'?{dateISO:'2026-10-08',row}:{dateISO:'2026-10-08',part:'Parity',createdAt:1,rows:[row],logRows:eligible?[row]:[]};
  const result=await client.rpc('apply_workout_operation',{p_session_id:sid,p_operation_key:'parity:1',p_revision:1,p_kind:kind,p_row_id:kind==='put'?row?.id??'invalid':null,p_payload:payload});
  assert.equal(Boolean(result.error),invalid,`${kind} shared-contract parity ${index}`);
  assert.equal(sql(`SELECT count(*) FROM workout_operation_sessions WHERE session_id='${sid}';`),invalid?'0':'1');
  assert.equal(sql(`SELECT count(*) FROM workout_log WHERE p4_session_id='${sid}';`),invalid||!eligible?'0':'1');
  if(!invalid && eligible && row.set!==undefined) {
    assert.equal(Number(sql(`SELECT set_number FROM workout_log WHERE p4_session_id='${sid}';`)),Number(row.set));
  }
  parityChecks++;
}
loseDeleteAck=true;
await assert.rejects(api.deleteWorkout('edge-session'),/ack lost/);
assert.equal(sql("SELECT state FROM workout_operation_sessions WHERE session_id='edge-session';"),'deleted');
const deleteRetryReceipt=await api.deleteWorkout('edge-session');
assert.deepEqual(deleteBodies[1],deleteBodies[0],'lost acknowledgement must reuse the exact delete request');
assert.deepEqual(JSON.parse(JSON.stringify(deleteRetryReceipt)),committedDeleteReceipt);
// A fresh API module has no process-local cache. Permanent session deletion is
// still the same operation after restart, and after a successful acknowledgement.
const restartedApi=module('lib/api.ts',apiDependencies).api;
assert.deepEqual(JSON.parse(JSON.stringify(await restartedApi.deleteWorkout('edge-session'))),committedDeleteReceipt);
assert.deepEqual(deleteBodies[2],deleteBodies[0]);
assert.equal(sql("SELECT count(*) FROM workout_operation_receipts WHERE session_id='edge-session' AND request->>'kind'='delete';"),'1');
assert.equal(sql("SELECT count(*) FROM workouts WHERE id='edge-session';"),'0');
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='edge-session';"),'0');
await assert.rejects(api.saveWorkout(session));
assert.equal(await api.logSet(live),null);
assert.equal(sql("SELECT state FROM workout_operation_sessions WHERE session_id='edge-session';"),'deleted');
assert.equal(rpcCalls.length,78,'retain all prior RPC coverage');
// All four failures share one cause: history rewrites only load/reps while SQL
// correctly demands exact raw metadata (apart from canonical exercise name).
const projectionCases:any[]=[
  ['numeric-strength',{...strength,weightLbs:100,reps:8},'100','8'],
  ['null-cardio',{...cardio,weightLbs:null,reps:null},null,null],
  ['omitted-cardio',Object.fromEntries(Object.entries(cardio).filter(([key])=>!['weightLbs','reps'].includes(key))),null,null],
  ['padded-strength',{...strength,weightLbs:' 100 ',reps:' 8 '},'100','8'],
];
const projectionFailures:string[]=[];
let projectionReadbacks=0;
for(const [name,input,load,reps] of projectionCases) {
  const row={...input,id:`projection-${name}`};
  const sid=`projection-${name}`;
  assert.equal(validation.validateWorkoutRow(row,true),null);
  try {
    await api.saveWorkout({id:sid,revision:1,operationKey:'final:1',dateISO:'2026-10-08',part:'Projection',createdAt:1,rows:[row]});
    assert.deepEqual(JSON.parse(sql(`SELECT rows_json FROM workouts WHERE id='${sid}';`)),[row]);
    const log=JSON.parse(sql(`SELECT json_build_object('load',weight_lbs,'reps',reps,'cardio',is_cardio,'hr',heart_rate) FROM workout_log WHERE p4_session_id='${sid}';`));
    assert.deepEqual(log,{load,reps,cardio:Boolean(row.isCardio),hr:row.heartRate??null});
    assert.equal(sql(`SELECT state FROM workout_operation_sessions WHERE session_id='${sid}';`),'finalized');
    assert.equal(sql(`SELECT count(*) FROM workout_operation_receipts WHERE session_id='${sid}';`),'1');
    projectionReadbacks++;
  } catch(error) { projectionFailures.push(`${name}: ${String(error)}`); }
}
console.log(JSON.stringify({projectionReadbacks,projectionFailures}));
assert.deepEqual(projectionFailures,[],'actual validator-valid API→Edge→SQL projection cases');
const effects=(sid:string)=>sql(`SELECT jsonb_build_object(
  'session',(SELECT jsonb_agg(to_jsonb(s)) FROM workout_operation_sessions s WHERE session_id='${sid}'),
  'rows',(SELECT jsonb_agg(to_jsonb(r) ORDER BY row_id) FROM workout_operation_rows r WHERE session_id='${sid}'),
  'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY operation_key) FROM workout_operation_receipts r WHERE session_id='${sid}'),
  'snapshot',(SELECT jsonb_agg(to_jsonb(w)) FROM workouts w WHERE id='${sid}'),
  'logs',(SELECT jsonb_agg(to_jsonb(l) ORDER BY p4_row_id) FROM workout_log l WHERE p4_session_id='${sid}'),
  'prs',(SELECT jsonb_agg(to_jsonb(p) ORDER BY lift_name) FROM pr_lifts p));`);
const tamperCases:any[]=[
  ['weight',strength,{weightLbs:'101'}],['reps',strength,{reps:'9'}],
  ['cardio-metric',cardio,{heartRate:121}],['cardio-display',cardio,{weightLbs:'0'}],
  ['cardio-classification',strength,{isCardio:true}],['strength-classification',strength,{setKind:'warmup'}],
  ['target',strength,{plannedTarget:{weightLbs:'200',reps:'9'}}],
  ['evidence',strength,{notes:'fabricated'}],['unknown-metadata',strength,{future:{raw:false}}],
  ['cardio-null-to-zero',{...cardio,weightLbs:null,reps:null},{weightLbs:'0',reps:'0'}],
];
let projectionNoEffects=0;
for(const [index,[name,input,patch]] of tamperCases.entries()) {
  const row={...input,id:`tamper-${index}`,plannedTarget:{weightLbs:'100',reps:'8'},future:{raw:true}};
  assert.equal(validation.validateWorkoutRow({...row,...patch},true),null,`tampered ${name} still structurally valid`);
  for(const existing of [false,true]) {
    const sid=`tamper-${index}-${existing}`;
    const snapshot={id:sid,revision:1,operationKey:'final:1',dateISO:'2026-10-08',part:'Projection',createdAt:1,rows:[row]};
    if(existing) await api.saveWorkout(snapshot);
    const before=effects(sid);
    corruptProjection=payload=>Object.assign(payload.logRows[0],patch);
    try { await assert.rejects(api.saveWorkout({...snapshot,revision:2,operationKey:'bad:2'}),/409/); }
    finally { corruptProjection=undefined; }
    assert.equal(effects(sid),before,`${name}: all persistence surfaces unchanged (${existing})`);
    projectionNoEffects++;
  }
}
assert.equal(projectionNoEffects,20);
let numericMeaningReadbacks=0;
for(const [index,value] of [0,Number.MIN_VALUE,1e100,Number.MAX_VALUE].entries()) {
  const row={...strength,id:`meaning-${index}`,exercise:'Untracked strength',weightLbs:value,reps:8};
  const sid=`meaning-${index}`;
  await api.saveWorkout({id:sid,revision:1,operationKey:'final:1',dateISO:'2026-10-08',part:'Meaning',createdAt:1,rows:[row]});
  assert.deepEqual(JSON.parse(sql(`SELECT rows_json FROM workouts WHERE id='${sid}';`)),[row]);
  assert.equal(Number(sql(`SELECT public.i3_load(weight_lbs) FROM workout_log WHERE p4_session_id='${sid}';`)),value);
  assert.equal(sql(`SELECT reps FROM workout_log WHERE p4_session_id='${sid}';`),'8');
  numericMeaningReadbacks++;
}
// QUALITY tracer bullets: actual shared JS accepts both raw strings. Exercise
// direct authenticated RPC and API→Edge→SQL, retaining raw bytes at both seams.
const rawStrengthCases:any[]=[
  ['nbsp', '\u00a0100\u00a0'],
  ['rounded-max', '17976931348623158'+'0'.repeat(292)],
];
const rawFailures:string[]=[];
let rawStrengthReadbacks=0;
for(const [name,value] of rawStrengthCases) {
  const row={...strength,id:`raw-${name}`,exercise:'Untracked strength',weightLbs:value,reps:'8'};
  assert.equal(validation.validateWorkoutRow(row,true),null);
  for(const path of ['direct','api']) {
    const sid=`raw-${name}-${path}`;
    try {
      if(path==='direct') {
        const result=await client.rpc('apply_workout_operation',{p_session_id:sid,p_operation_key:'put:1',p_revision:1,p_kind:'put',p_row_id:row.id,p_payload:{dateISO:'2026-10-08',row}});
        assert.equal(result.error,null,`${name}: direct authenticated SQL`);
        assert.deepEqual(JSON.parse(sql(`SELECT request->'payload'->'row' FROM workout_operation_receipts WHERE session_id='${sid}';`)),row);
      } else {
        await api.saveWorkout({id:sid,revision:1,operationKey:'final:1',dateISO:'2026-10-08',part:'Raw strength',createdAt:1,rows:[row]});
        assert.deepEqual(JSON.parse(sql(`SELECT rows_json FROM workouts WHERE id='${sid}';`)),[row]);
      }
      assert.equal(sql(`SELECT weight_lbs FROM workout_log WHERE p4_session_id='${sid}';`),validation.numericText(value));
      assert.equal(Number(sql(`SELECT weight_lbs FROM workout_log WHERE p4_session_id='${sid}';`)),Number(value));
      rawStrengthReadbacks++;
    } catch(error) { rawFailures.push(`${name}/${path}: ${String(error)}`); }
  }
}
console.log(JSON.stringify({rawStrengthReadbacks,rawFailures}));
assert.deepEqual(rawFailures,[],'actual JS trim/finite raw strength parity');
// Cross-boundary matrix is generated from ECMAScript's complete trim set,
// adjacent non-trim controls, and exact BigInt IEEE overflow/underflow neighbors.
const trimPoints=[0x09,0x0a,0x0b,0x0c,0x0d,0x20,0xa0,0x1680,
  ...Array.from({length:11},(_,i)=>0x2000+i),0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff];
const boundaryRows:any[]=[];
for(const point of trimPoints) {
  const ch=String.fromCodePoint(point);
  boundaryRows.push({weightLbs:ch+'100'+ch,reps:ch+'8'+ch},
    {weightLbs:'10'+ch+'0'}, {weightLbs:ch,reps:'8'},
    {plannedTarget:{weightLbs:ch+'100'+ch,reps:ch+'8'+ch}},
    {set:ch+'1'+ch}, {reps:ch});
}
for(const point of [0x08,0x0e,0x1c,0x85,0x180e,0x200b,0x2060,0xffef]) {
  const ch=String.fromCodePoint(point);
  boundaryRows.push({weightLbs:ch+'100'+ch},{reps:ch+'8'+ch});
}
const ieeeMax=(1n<<1024n)-(1n<<971n);
const overflowTie=(1n<<1024n)-(1n<<970n);
for(const value of [ieeeMax-(1n<<971n),ieeeMax-1n,ieeeMax,ieeeMax+1n,
  overflowTie-1n,overflowTie,overflowTie+1n,1n<<1024n]) boundaryRows.push({weightLbs:String(value)});
for(const value of ['0','000100','.5','0.'+'0'.repeat(323)+'5',
  '0.'+'0'.repeat(323)+'2','0.'+'0'.repeat(323)+'3','0.'+'0'.repeat(400)+'1',
  '1e100','Infinity','NaN','-1','+1','100lbs','1,000','0x10','1.','1\n2','١٠٠','１００']) boundaryRows.push({weightLbs:value});
const halfMin=5n**1075n;
for(const numerator of [halfMin-1n,halfMin,halfMin+1n]) boundaryRows.push({weightLbs:'0.'+String(numerator).padStart(1075,'0')});
boundaryRows.push({weightLbs:'\t\r\n\u00a0\ufeff100\u3000\n',reps:'\ufeff\u202f8\u2009\r\n'},
  {weightLbs:Number.MAX_VALUE,reps:Number.MAX_SAFE_INTEGER,set:Number.MAX_SAFE_INTEGER},
  {weightLbs:Number.MIN_VALUE}, {reps:Number.MAX_SAFE_INTEGER+1}, {set:Number.MAX_SAFE_INTEGER+1},
  {plannedTarget:{weightLbs:String(overflowTie),reps:'8'}});
for(const value of ['0','0008','9007199254740990','9007199254740991','9007199254740992','1.0','1e1','-0','8x']) {
  boundaryRows.push({reps:value},{set:value});
}
let boundaryChecks=0,boundaryNoEffects=0,boundaryReadbacks=0;
const boundaryFailures:string[]=[];
for(const [index,patch] of boundaryRows.entries()) for(const path of ['put','finalize','api']) {
  const row={...strength,...patch,id:`boundary-${index}`,exercise:'Untracked strength'};
  const sid=`boundary-${index}-${path}`;
  const invalid=Boolean(validation.validateWorkoutRow(row,path==='put'));
  const eligible=!validation.validateWorkoutRow(row,true);
  const before=effects(sid);
  try {
    let rejected=false;
    if(path==='api') {
      try { await api.saveWorkout({id:sid,revision:1,operationKey:'final:1',dateISO:'2026-10-08',part:'Boundary',createdAt:1,rows:[row]}); }
      catch { rejected=true; }
    } else {
      const payload=path==='put'?{dateISO:'2026-10-08',row}:{dateISO:'2026-10-08',part:'Boundary',createdAt:1,rows:[row],logRows:eligible?[row]:[]};
      const result=await client.rpc('apply_workout_operation',{p_session_id:sid,p_operation_key:'boundary:1',p_revision:1,p_kind:path,p_row_id:path==='put'?row.id:null,p_payload:payload});
      rejected=Boolean(result.error);
    }
    assert.equal(rejected,invalid,`${index}/${path}: actual shared validator parity`);
    if(invalid) { assert.equal(effects(sid),before); boundaryNoEffects++; }
    else {
      if(path!=='put') assert.deepEqual(JSON.parse(sql(`SELECT rows_json FROM workouts WHERE id='${sid}';`)),[row]);
      else assert.deepEqual(JSON.parse(sql(`SELECT request->'payload'->'row' FROM workout_operation_receipts WHERE session_id='${sid}';`)),row);
      assert.equal(sql(`SELECT count(*) FROM workout_log WHERE p4_session_id='${sid}';`),eligible?'1':'0');
      if(eligible) {
        const log=JSON.parse(sql(`SELECT json_build_object('load',weight_lbs,'reps',reps,'set',set_number) FROM workout_log WHERE p4_session_id='${sid}';`));
        assert.equal(log.load,validation.numericText(row.weightLbs));
        assert.equal(log.reps,validation.numericText(row.reps));
        assert.equal(Number(log.load),Number(row.weightLbs));
        assert.equal(log.set,Number(row.set));
      }
      boundaryReadbacks++;
    }
    boundaryChecks++;
  } catch(error) { boundaryFailures.push(`${index}/${path}: ${String(error)}`); }
}
console.log(JSON.stringify({trimCharacters:trimPoints.length,boundaryRows:boundaryRows.length,boundaryChecks,boundaryReadbacks,boundaryNoEffects,boundaryFailures}));
assert.deepEqual(boundaryFailures,[],'cross-boundary JS/SQL/API matrix');
assert.equal(boundaryChecks,boundaryRows.length*3,'every generated row exercised at all three boundaries');
assert.equal(boundaryReadbacks+boundaryNoEffects,boundaryChecks,'every acceptance/rejection verified');
// Equivalent numeric meaning is NOT permission to rewrite raw projection bytes.
let rawNormalizationNoEffects=0;
for(const [name,value,normalized] of [
  ['nbsp','\u00a0100\u00a0','100'],
  ['rounded-max','17976931348623158'+'0'.repeat(292),validation.numericText(Number.MAX_VALUE)],
]) for(const existing of [false,true]) {
  const sid=`raw-normalize-${name}-${existing}`;
  const row={...strength,id:sid,exercise:'Untracked strength',weightLbs:value,reps:'8'};
  const snapshot={id:sid,revision:1,operationKey:'final:1',dateISO:'2026-10-08',part:'Raw',createdAt:1,rows:[row]};
  if(existing) await api.saveWorkout(snapshot);
  const before=effects(sid);
  corruptProjection=payload=>payload.logRows[0].weightLbs=normalized;
  try { await assert.rejects(api.saveWorkout({...snapshot,revision:2,operationKey:'tamper:2'}),/409/); }
  finally { corruptProjection=undefined; }
  assert.equal(effects(sid),before);
  rawNormalizationNoEffects++;
}
// Resume interrupted P4: real durable delivery -> real Edge -> real SQL.
const persisted = { value: null as string | null };
let loseRowAck = true;
const outboxModule = module('lib/sessionOperationOutbox.ts', {});
const loadDelivery = () => module('lib/sessionOperationDelivery.ts', {
  '@react-native-async-storage/async-storage': { __esModule:true, default: {
    getItem:async (key:string) => { assert.equal(key,'workout_session_operations_v1'); return persisted.value; },
    setItem:async (key:string,value:string) => { assert.equal(key,'workout_session_operations_v1'); persisted.value=value; },
  } },
  './supabase':{supabaseUrl:'https://offline.invalid'},
  './sessionOperationOutbox':outboxModule,
  './auth':{fetchWithAuth:async(url:string,options:any,retries:number,owner:string)=>{
    assert.equal(owner,'owner'); assert.equal(retries,1);
    const response=await apiDependencies['./auth'].fetchWithAuth(url,options);
    if(response.ok && loseRowAck) { loseRowAck=false; throw new Error('row ack lost after SQL commit'); }
    return response;
  }},
}).sessionOperations;
let box = loadDelivery();
const edited = { ...strength, id: 'delivery-row', weightLbs: '100', reps: '8' };
await box.rows('owner','delivery-session','2026-10-08',[edited]);
await box.flush('owner');
const pendingIdentity = JSON.parse(persisted.value!).pending[0].payload.operationKey;
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='delivery-session';"),'1');
box = loadDelivery();
await box.flush('owner');
assert.equal(JSON.parse(persisted.value!).pending.length,0);
assert.equal(sql(`SELECT count(*) FROM workout_operation_receipts WHERE session_id='delivery-session' AND operation_key='${pendingIdentity}';`),'1');
await box.rows('owner','delivery-session','2026-10-08',[{...edited,reps:'',performance:'planned'}],'revise');
await box.flush('owner');
assert.equal(JSON.parse(persisted.value!).pending.length,0,'revise acknowledged by actual SQL');
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='delivery-session';"),'0');
assert.equal(sql("SELECT deleted FROM workout_operation_rows WHERE session_id='delivery-session' AND row_id='delivery-row';"),'f');
await box.rows('owner','delivery-session','2026-10-08',[{...edited,reps:'6'}]); await box.flush('owner');
assert.equal(sql("SELECT reps FROM workout_log WHERE p4_session_id='delivery-session';"),'6');
await box.rows('owner','delivery-session','2026-10-08',[edited],'drop'); await box.flush('owner');
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='delivery-session';"),'0');
await box.rows('owner','delivery-session','2026-10-08',[{...edited,id:'later-row'}]); await box.flush('owner');
assert.equal(sql("SELECT p4_row_id FROM workout_log WHERE p4_session_id='delivery-session';"),'later-row');
await box.abandon('owner','delivery-session','2026-10-08'); await box.flush('owner');
assert.equal(sql("SELECT state FROM workout_operation_sessions WHERE session_id='delivery-session';"),'deleted');
assert.equal(JSON.parse(persisted.value!).pending.length,0);
await box.abandon('owner','never-sent-session','2026-10-08'); await box.flush('owner');
assert.equal(sql("SELECT state FROM workout_operation_sessions WHERE session_id='never-sent-session';"),'deleted');
await box.rows('owner','replacement-session','2026-10-08',[edited]); await box.flush('owner');
assert.equal(sql("SELECT count(*) FROM workout_log WHERE p4_session_id='replacement-session';"),'1');
console.log(JSON.stringify({durableDeliverySql:true, lostPutAckRestart:true, reviseRecompletion:true, clearThenLaterRow:true, abandonKnownAndUnknown:true, replacementSessionIsolated:true}));
console.log(JSON.stringify({rawNormalizationNoEffects,boundaryChecks,boundaryReadbacks,boundaryNoEffects,rawStrengthReadbacks,actualApiEdgeSql:true,rpcCalls:rpcCalls.length,retainedRpcCalls:78,baselineRpcCalls:23,parityChecks,capacityReadbacks,projectionReadbacks,projectionNoEffects,numericMeaningReadbacks,lostDeleteAckRetry:true,restartedDeleteRetry:true,snapshotAndNumericReadback:true,lateWriteRejected:true,committedPrReceipt:true}));
