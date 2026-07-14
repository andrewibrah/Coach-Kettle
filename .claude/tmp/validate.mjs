import fs from 'node:fs';
const lines = fs.readFileSync('supabase/migrations/20260708000100_exercise_dataset_seed.sql','utf8').split('\n');
const vi = lines.indexOf('VALUES');
const rows = lines.slice(vi+1).filter(l => l.startsWith('  ('));
let errs = 0; const hist = {};
for (let idx=0; idx<rows.length; idx++) {
  let s = rows[idx].trim();
  if (s.endsWith(',')) s = s.slice(0,-1);
  if (!s.startsWith('(') || !s.endsWith(')')) { errs++; continue; }
  s = s.slice(1,-1);
  let fields=0, inStr=false;
  for (let i=0;i<s.length;i++){
    const c=s[i];
    if(inStr){ if(c==="'"){ if(s[i+1]==="'") i++; else inStr=false; } }
    else { if(c==="'") inStr=true; else if(c===',') fields++; }
  }
  if(inStr){ errs++; continue; }
  const n=fields+1; hist[n]=(hist[n]||0)+1;
}
console.log('rows parsed:', rows.length);
console.log('field-count histogram (want all =15):', JSON.stringify(hist));
console.log('errors:', errs);
