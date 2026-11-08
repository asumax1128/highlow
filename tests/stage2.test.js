import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Generator,Game,seeded,compare,pairKey,HARD_POOL,HARD_NEAR_PAIRS,ENGINE_VERSION,DURATION,MIN_ANSWER_MS,FEEDBACK_CORRECT_MS,FEEDBACK_WRONG_MS,feedbackMs,countdownMs,countdownLabel,minimumWallMs} from '../dist/engine.js';
import {RankingService,ENGINE_VERSION as SERVER_ENGINE_VERSION} from '../server/ranking-core.js';
import {SQLiteRepository} from '../server/sqlite-repository.js';
import {RankingClient,SubmissionQueue,LATE_ERROR} from '../dist/ranking-client.js';

const hash=s=>createHash('sha256').update(s).digest('hex');
const START=(difficulty,countdown='first')=>({difficulty,engineVersion:ENGINE_VERSION,countdown});
function setup(){const repo=new SQLiteRepository(':memory:');let time=Date.parse('2026-11-09T03:00:00Z'),seed=101;const service=new RankingService(repo,{now:()=>time,id:randomUUID,hash,seed:()=>seed++});const auth=service.dispatch('profile',{nickname:'Tester'},null,'test');const call=(a,d,t=auth.token)=>service.handle(a,d,t,'test');return {repo,service,auth,call,get now(){return time},set now(v){time=v},advance(n){time+=n}}}
// Plays a run exactly like the client (virtual clock), returning the submission and the real time the client needed.
function play(run,difficulty,plan){let now=0;const g=new Game(difficulty,{clock:()=>now,rng:seeded(run.seed)});g.start(run.countdown);now=countdownMs(run.countdown);g.tick();for(const step of plan){now+=step.elapsed;assert(g.answer(step.correct?g.question.answer:(g.question.answer==='LEFT'?'RIGHT':'LEFT')));now=g.until;g.tick()}now+=g.timeLeft();g.tick();assert.equal(g.state,'FINISHED');return {wall:now,game:g,data:{runId:run.runId,completed:true,answers:g.history.map(a=>({questionId:a.question.id,choice:a.choice,elapsed:a.elapsed})),finalElapsed:g.finalElapsed}}}
const nonEqualAnswers=(d,seed,n)=>{const g=new Generator(d,seeded(seed)),out=[];while(out.length<n){const q=g.next();if(q.answer!=='EQUAL')out.push(q.answer)}return out};

test('side bag holds 8 cards (LEFT×4 + RIGHT×4): previous answers no longer determine the next one',()=>{
 for(const d of ['EASY','NORMAL','HARD']){let opposite=0,pairs=0,bag2Hits=0,bag2Total=0,longRuns=0;
  for(let seed=1;seed<=400;seed++){const answers=nonEqualAnswers(d,seed,48);
   if(d==='EASY')for(let i=0;i<answers.length;i+=8){const block=answers.slice(i,i+8);assert.equal(block.filter(a=>a==='LEFT').length,4,'every full bag is balanced 4/4')}
   for(let i=1;i<answers.length;i++){pairs++;if(answers[i]!==answers[i-1])opposite++;if(i>=2&&answers[i]===answers[i-1]&&answers[i]===answers[i-2])longRuns++}
   // The old 2-card bag made every 2nd answer the opposite of the one before (100% hit rate).
   for(let i=1;i<answers.length;i+=2){bag2Total++;if(answers[i]!==answers[i-1])bag2Hits++}}
  const p=opposite/pairs,old=bag2Hits/bag2Total;
  assert(p>0.45&&p<0.7,`${d}: P(next≠prev)=${p}`);assert(old<0.7,`${d}: old bag-of-2 predictor still hits ${old}`);assert(longRuns>0,`${d}: three equal answers in a row now occur`)}
});

test('recent-30 duplicate key ignores left/right order (A｜B then B｜A is excluded)',()=>{
 assert.equal(pairKey('√50','7'),pairKey('7','√50'));
 for(const d of ['EASY','NORMAL','HARD']){const g=new Generator(d,seeded(77)),recent=[];for(let i=0;i<6000;i++){const q=g.next(),key=pairKey(q.leftExpression,q.rightExpression);assert(!recent.includes(key),`${d} repeated ${key}`);recent.push(key);if(recent.length>30)recent.shift()}}
});

test('answer lock is 180 ms after a correct answer and 500 ms after a miss (client engine)',()=>{
 assert.equal(FEEDBACK_CORRECT_MS,180);assert.equal(FEEDBACK_WRONG_MS,500);
 let now=0;const g=new Game('NORMAL',{clock:()=>now,rng:seeded(5)});g.start();now=2000;g.tick();
 now+=400;g.answer(g.question.answer);now+=179;g.tick();assert.equal(g.state,'FEEDBACK');now+=1;g.tick();assert.equal(g.state,'PLAYING');
 now+=400;g.answer(g.question.answer==='LEFT'?'RIGHT':'LEFT');now+=499;g.tick();assert.equal(g.state,'FEEDBACK');now+=1;g.tick();assert.equal(g.state,'PLAYING');
 assert.equal(g.timeLeft(),DURATION-800,'locks are excluded from the 30 s');
});

test('client and server use the same lock/countdown arithmetic: minimum time equals the client run exactly',()=>{
 for(const countdown of ['first','retry']){const f=setup();try{
  const run=f.call('start',START('NORMAL',countdown));assert.equal(run.countdown,countdown);
  const plan=[{elapsed:900,correct:true},{elapsed:700,correct:false},{elapsed:1200,correct:true},{elapsed:150,correct:false},{elapsed:600,correct:true}];
  const {wall,game,data}=play(run,'NORMAL',plan);
  const expected=countdownMs(countdown)+DURATION+plan.reduce((s,p)=>s+feedbackMs(p.correct),0);
  assert.equal(wall,expected,'the virtual client spends exactly the server minimum');assert.equal(minimumWallMs(countdown,game.history),expected);
  f.advance(wall-51);assert.throws(()=>f.call('submit',data),{code:'TOO_EARLY'});
  f.advance(1);const result=f.call('submit',data);assert(result.accepted);assert.equal(result.stats.correct,3);assert.equal(result.stats.wrong,2)}finally{f.repo.close()}}
 assert.equal(countdownMs('first'),2000);assert.equal(countdownMs('retry'),1100);
 assert.deepEqual([2000,1401,1400,801,800,201,200,1].map(ms=>countdownLabel('first',ms)),['3','3','2','2','1','1','GO!','GO!']);
 assert.deepEqual([1100,801,800,501,500,201,200].map(ms=>countdownLabel('retry',ms)),['3','3','2','2','1','1','GO!']);
});

test('start is refused when the client engine version differs or is missing',async()=>{
 assert.equal(SERVER_ENGINE_VERSION,ENGINE_VERSION,'server imports the version from dist/engine.js');assert.notEqual(ENGINE_VERSION,'high-low-0.1');
 const f=setup();try{
  for(const data of [{difficulty:'EASY',countdown:'first'},{difficulty:'EASY',countdown:'first',engineVersion:'high-low-0.1'}])assert.throws(()=>f.call('start',data),e=>e.code==='ENGINE_VERSION'&&/再読み込み/.test(e.message));
  assert.throws(()=>f.call('start',{difficulty:'EASY',engineVersion:ENGINE_VERSION,countdown:'slow'}),{code:'INVALID_REQUEST'});
  assert.equal(f.repo.list('runs').length,0,'no run is created on a refused start')}finally{f.repo.close()}
 const bodies=[];const client=new RankingClient({fetcher:async(url,options)=>{const body=JSON.parse(options.body);bodies.push(body);if(body.action==='profile')return new Response('{"player":{"nickname":null}}');return new Response(JSON.stringify({error:{code:'ENGINE_VERSION',message:'ゲームが更新されました。ページを再読み込みしてください。'}}),{status:409})}});
 await assert.rejects(client.start('HARD','retry'),e=>e.code==='ENGINE_VERSION');
 assert.deepEqual(bodies[1].data,{difficulty:'HARD',engineVersion:ENGINE_VERSION,countdown:'retry'});
});

test('answers faster than 150 ms are ignored by the client and rejected by the server',()=>{
 assert.equal(MIN_ANSWER_MS,150);
 let now=0;const g=new Game('EASY',{clock:()=>now,rng:seeded(9)});g.start();now=2000;g.tick();now+=149;assert.equal(g.answer(g.question.answer),false);assert.equal(g.state,'PLAYING');now+=1;assert.equal(g.answer(g.question.answer),true);
 const f=setup();try{const run=f.call('start',START('EASY'));const {wall,data}=play(run,'EASY',[{elapsed:400,correct:true},{elapsed:300,correct:true}]);data.answers[1].elapsed=149;data.finalElapsed+=151;f.advance(wall+1000);assert.throws(()=>f.call('submit',data),{code:'TOO_FAST'})}finally{f.repo.close()}
});

test('the last question time is sent and the total must be ~30 000 ms (truncated histories are rejected)',()=>{
 const f=setup();try{
  const run=f.call('start',START('NORMAL'));const {wall,game,data}=play(run,'NORMAL',[{elapsed:800,correct:true},{elapsed:800,correct:true},{elapsed:800,correct:false},{elapsed:800,correct:false}]);
  assert(Math.abs(data.answers.reduce((s,a)=>s+a.elapsed,0)+game.finalElapsed-DURATION)<1e-6);
  f.advance(wall+500);
  const truncated=structuredClone(data);truncated.answers=truncated.answers.slice(0,2);
  assert.throws(()=>f.call('submit',truncated),{code:'INCOMPLETE_HISTORY'},'dropping the trailing misses is refused');
  const missing=structuredClone(data);delete missing.finalElapsed;assert.throws(()=>f.call('submit',missing),{code:'INCOMPLETE_HISTORY'});
  const result=f.call('submit',data);assert.equal(result.stats.wrong,2)}finally{f.repo.close()}
});

test('HARD close comparisons: every curated pair is within 10% and ~15–20% of non-EQUAL questions are close',()=>{
 const value=x=>x.n/x.d*Math.sqrt(x.rad),close=(a,b)=>Math.abs(value(a)-value(b))/Math.max(value(a),value(b))<=0.1;
 for(const [a,b] of HARD_NEAR_PAIRS){assert(a&&b);assert(close(a.value,b.value),`${a.text} vs ${b.text}`);assert.notEqual(compare(a.value,b.value),'EQUAL')}
 for(const [a,b] of [['√50','7'],['0.67','2/3']])assert(HARD_NEAR_PAIRS.some(p=>p.map(e=>e.text).sort().join()===[a,b].sort().join()));
 assert.deepEqual(HARD_POOL.slice(0,30).map(e=>e.text),['sin 30°','1/2','cos 60°','0.6','√50','7','2⁵','5²','log₂ 8','√9','2/3','0.67','tan 45°','sin 90°','sin 60°','cos 30°','√2','1.4','|−8|','log₃ 81','3⁴','√81','1 + 2 + ⋯ + 10','5 × 11','3/4','0.75','√12','2√3','2⁻²','0.25'],'the original 30 expressions are unchanged');
 let n=0,near=0,equal=0,total=0;for(let seed=1;seed<=2000;seed++){const g=new Generator('HARD',seeded(seed));for(let i=0;i<30;i++){const q=g.next();total++;if(q.answer==='EQUAL'){equal++;continue}n++;if(close(q.leftValue,q.rightValue))near++}}
 assert(near/n>=0.15&&near/n<=0.20,`close share ${near/n}`);assert(Math.abs(equal/total-0.15)<0.01,`EQUAL rate unchanged ${equal/total}`);
});

test('unverified tokens share one cached limit and create no limit rows; verified players get their own stored bucket',()=>{
 const f=setup();try{
  const before=f.repo.list('limits').length;
  // setup() already created one identity, which used 1 of the 120 shared slots.
  for(let i=0;i<119;i++)assert.throws(()=>f.service.handle('ranking',{difficulty:'EASY',period:'daily'},'forged-'+i,'x'),{code:'UNAUTHORIZED'});
  assert.equal(f.repo.list('limits').length,before,'no rows for unverified tokens');
  assert.throws(()=>f.service.handle('ranking',{difficulty:'EASY',period:'daily'},'forged-x','x'),{code:'RATE_LIMIT'},'the 121st unverified request in the minute hits the shared bucket');
  assert.throws(()=>f.service.handle('profile',{},null,'x'),{code:'RATE_LIMIT'},'new identities share the same bucket');
  f.call('ranking',{difficulty:'EASY',period:'daily'});
  const rows=f.repo.list('limits');assert(rows.some(r=>r.id.startsWith('requests:')),'verified request is limited per player');assert(rows.every(r=>!/forged|shared|identity/.test(r.id)))}finally{f.repo.close()}
});

test('Apps Script: forged tokens add no limit rows to the sheet',()=>{
 const sheets=new Map();const makeSheet=()=>{const cells=[];return {cells,getDataRange:()=>({getValues:()=>cells.length?structuredClone(cells):[['']]}),getLastRow:()=>cells.length,setFrozenRows:()=>{},getRange:(r,c,h,w)=>({getValues:()=>cells.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),setValues:values=>{values.forEach((row,i)=>{cells[r-1+i]??=[];row.forEach((v,j)=>cells[r-1+i][c-1+j]=v)})}}),deleteRow:r=>cells.splice(r-1,1)}};
 const properties=new Map([['HIGHLOW_SPREADSHEET_ID','s'],['ALLOW_HIGHLOW_SETUP','yes']]);const cache=new Map();
 const context=vm.createContext({console,Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,s)=>[...createHash('sha256').update(s).digest()],newBlob:s=>({getBytes:()=>Buffer.from(s)})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k)})},LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock:()=>{},releaseLock:()=>{}})},CacheService:{getScriptCache:()=>({get:k=>cache.has(k)?cache.get(k):null,put:(k,v)=>cache.set(k,v)})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const s=makeSheet();sheets.set(n,s);return s}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>({text})})}});
 vm.runInContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);context.setupHighLow();
 const post=(action,data={},token=null)=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({action,data,token})}}).text);
 const limits=sheets.get('HIGHLOW_v1_limits');const rows=()=>limits.cells.length;const before=rows();
 for(let i=0;i<30;i++)assert.equal(post('ranking',{difficulty:'EASY',period:'daily'},'forged-'+i).error.code,'UNAUTHORIZED');
 assert.equal(rows(),before,'forged tokens never write limit rows');assert([...cache.keys()].some(k=>k.startsWith('HIGHLOW:shared:')),'they are counted in CacheService');
 const player=post('profile',{});assert.equal(rows(),before,'creating an identity writes no limit row');
 const run=post('start',{difficulty:'HARD',engineVersion:ENGINE_VERSION,countdown:'retry'},player.token);assert.equal(run.countdown,'retry');assert(rows()>before,'verified requests are limited per player in the sheet');
 assert.equal(post('start',{difficulty:'HARD'},player.token).error.code,'ENGINE_VERSION');
});

test('submission queue resends automatically (1 s, 3 s, 3 s) and explains expired runs',async()=>{
 const waits=[];let calls=0;const client=new RankingClient({fetcher:async()=>{calls++;if(calls<3)throw new TypeError('Load failed');return new Response('{"accepted":true,"registered":false}')}});
 const queue=new SubmissionQueue(client,{delays:[1000,3000,3000],wait:async ms=>{waits.push(ms)}});const seen=[];queue.subscribe(e=>seen.push(e?.status));
 const entry=await queue.add({runId:'r1',difficulty:'EASY',score:100,answers:[],finalElapsed:30000});
 assert.equal(entry.status,'done');assert.equal(calls,3);assert.deepEqual(waits,[1000,3000]);assert(seen.includes('retrying'));
 let attempts=0;const down=new RankingClient({fetcher:async()=>{attempts++;throw new TypeError('Failed to fetch')}});const q2=new SubmissionQueue(down,{delays:[1000,3000,3000],wait:async()=>{}});
 const failed=await q2.add({runId:'r2',difficulty:'EASY',score:0,answers:[]});assert.equal(failed.status,'failed');assert.equal(attempts,4,'first send + 3 automatic resends');
 for(const code of ['EXPIRED','TIMING_MISMATCH']){const late=new SubmissionQueue(new RankingClient({fetcher:async()=>new Response(JSON.stringify({error:{code,message:'x'}}))}),{delays:[1000],wait:async()=>{}});const e=await late.add({runId:code,difficulty:'EASY',score:0,answers:[]});assert.equal(e.status,'rejected');assert.equal(e.message,LATE_ERROR);assert.match(e.message,/時間が経ったため登録できません/)}
 const sent=[];const c=new RankingClient({fetcher:async(url,o)=>{sent.push(JSON.parse(o.body));return new Response('{"accepted":true}')}});await c.submit('r3',{history:[],finalElapsed:30000});assert.equal(sent[0].data.finalElapsed,30000);
});

test('asset URLs and module imports carry the engine version (?v=)',()=>{
 const v=ENGINE_VERSION.replace(/^high-low-/,'');const read=p=>readFileSync(new URL('../dist/'+p,import.meta.url),'utf8');
 const html=read('index.html');for(const asset of ['style.css','config.js','app.js'])assert(html.includes(`${asset}?v=${v}"`),asset);
 for(const file of ['app.js','ranking-client.js']){const imports=[...read(file).matchAll(/from '\.\/([\w-]+\.js)(\?v=[^']*)?'/g)];assert(imports.length);for(const m of imports)assert.equal(m[2],`?v=${v}`,`${file} → ${m[1]}`)}
});
