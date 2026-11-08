import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game,seeded,countdownMs,ENGINE_VERSION} from '../dist/engine.js';
import {RankingService,HIDDEN_NAME,validateNickname,isValidRecord,BOARD_TTL_MS} from '../server/ranking-core.js';
import {SQLiteRepository} from '../server/sqlite-repository.js';
import {handleApi} from '../server/api.js';
import {RankingClient} from '../dist/ranking-client.js';

const hash=s=>createHash('sha256').update(s).digest('hex');
const START=(difficulty,countdown='first')=>({difficulty,engineVersion:ENGINE_VERSION,countdown});
function play(run,difficulty,n=3){let now=0;const g=new Game(difficulty,{clock:()=>now,rng:seeded(run.seed)});g.start(run.countdown);now=countdownMs(run.countdown);g.tick();for(let i=0;i<n;i++){now+=700;g.answer(g.question.answer);now=g.until;g.tick()}now+=g.timeLeft();g.tick();return {wall:now,data:{runId:run.runId,completed:true,answers:g.history.map(a=>({questionId:a.question.id,choice:a.choice,elapsed:a.elapsed})),finalElapsed:g.finalElapsed}}}

// Apps Script stand-in with instrumentation: sheet reads, writes, locks and a TTL-aware CacheService.
function gas(){const sheets=new Map(),stats={reads:{},writes:0,deletes:0,locks:0,opens:0};let now=Date.parse('2026-11-09T03:00:00Z');class FakeDate extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const makeSheet=name=>{const cells=[];return {name,cells,getDataRange:()=>{stats.reads[name]=(stats.reads[name]||0)+1;return {getValues:()=>cells.length?structuredClone(cells):[['']]}},getLastRow:()=>cells.length,setFrozenRows:()=>{},getRange:(r,c,h,w)=>({getValues:()=>cells.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w)),setValues:values=>{stats.writes++;values.forEach((row,i)=>{cells[r-1+i]??=[];row.forEach((v,j)=>cells[r-1+i][c-1+j]=v)})}}),deleteRow:r=>{stats.deletes++;cells.splice(r-1,1)},deleteRows:(r,n)=>{stats.deletes++;cells.splice(r-1,n)}}};
 const cache=new Map(),properties=new Map([['HIGHLOW_SPREADSHEET_ID','sheet'],['ALLOW_HIGHLOW_SETUP','yes']]);
 const context=vm.createContext({Date:FakeDate,console:{log(){},warn(){},error(){}},Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,s)=>[...createHash('sha256').update(s).digest()],newBlob:s=>({getBytes:()=>Buffer.from(s)})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k)})},LockService:{getScriptLock:()=>({tryLock:()=>{stats.locks++;return true},waitLock:()=>{stats.locks++},releaseLock:()=>{}})},
  CacheService:{getScriptCache:()=>({get:k=>{const e=cache.get(k);return e&&e.until>now?e.value:null},put:(k,v,ttl)=>cache.set(k,{value:v,until:now+ttl*1000}),removeAll:keys=>keys.forEach(k=>cache.delete(k))})},
  SpreadsheetApp:{openById:()=>{stats.opens++;return {getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const s=makeSheet(n);sheets.set(n,s);return s}}}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>({text})})}});
 vm.runInContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);context.setupHighLow();
 const post=(action,data={},token=null)=>JSON.parse(context.doPost({postData:{contents:JSON.stringify({action,data,token})}}).text);
 const sheet=kind=>sheets.get('HIGHLOW_v1_'+kind);
 return {context,post,sheets,sheet,stats,cache,get now(){return now},set now(v){now=v},reset(){stats.reads={};stats.writes=0;stats.deletes=0;stats.locks=0;stats.opens=0}}}
function addRow(g,kind,key,raw){g.sheet(kind).cells.push([key,raw])}
// A Node fetcher that talks to the Apps Script stand-in (so RankingClient can be tested end to end in GAS mode).
const viaGas=g=>async(url,options)=>{const body=JSON.parse(options.body);return new Response(JSON.stringify(JSON.parse(g.context.doPost({postData:{contents:JSON.stringify(body)}}).text)))};
const memoryStore=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};

test('one broken row in each table does not stop ranking or submission (Apps Script)',()=>{
 const g=gas();const alice=g.post('profile',{nickname:'Alice'});
 for(const kind of ['players','runs','bests','limits']){addRow(g,kind,'broken-json-'+kind,'{not json');addRow(g,kind,'broken-shape-'+kind,JSON.stringify({hello:'world'}))}
 addRow(g,'bests','bad-score',JSON.stringify({playerId:'x',difficulty:'NORMAL',period:'all',periodKey:'all',score:'999999',correct:1,answers:1,responseUs:1,achievedAt:1}));
 const board=g.post('ranking',{difficulty:'NORMAL',period:'all'},alice.token);assert(!board.error,JSON.stringify(board));assert.equal(board.totalPlayers,0);
 const run=g.post('start',START('NORMAL'),alice.token);assert(!run.error,JSON.stringify(run));
 const {wall,data}=play(run,'NORMAL');g.now+=wall+200;const result=g.post('submit',data,alice.token);assert(result.accepted,JSON.stringify(result));
 g.now+=BOARD_TTL_MS+1;const after=g.post('ranking',{difficulty:'NORMAL',period:'all'},alice.token);assert.equal(after.me.score,300);assert.equal(after.rows.length,1);
 // Broken rows are copied once to the quarantine sheet (write path) and left in place.
 const q=g.sheets.get('HIGHLOW_v1_quarantine');assert(q,'quarantine sheet created');const recorded=q.cells.slice(1);
 assert.deepEqual(new Set(recorded.map(r=>r[1])),new Set(['players','runs','limits','bests']));assert(recorded.some(r=>r[4]==='unparsable JSON'&&r[5]==='{not json'));
 const count=recorded.length;g.post('start',START('EASY'),alice.token);assert.equal(q.cells.length-1,count,'the same broken rows are not recorded again within 6 h');
 assert.equal(g.sheet('players').cells.filter(r=>r[1]==='{not json').length,1,'original rows are untouched');
});

test('broken SQLite rows are skipped too (Node)',()=>{
 const repo=new SQLiteRepository(':memory:');try{let time=Date.parse('2026-11-09T03:00:00Z');const service=new RankingService(repo,{now:()=>time,id:randomUUID,hash,seed:()=>7});const a=service.dispatch('profile',{nickname:'Node'},null,'t');
  for(const kind of ['players','runs','bests','limits'])repo.db.prepare('INSERT INTO hl_entries(kind,id,value) VALUES (?,?,?)').run(kind,'bad-'+kind,'{oops');
  assert.equal(service.handle('ranking',{difficulty:'EASY',period:'all'},a.token).totalPlayers,0);
  const run=service.handle('start',START('EASY'),a.token);const {wall,data}=play(run,'EASY',2);time+=wall+100;assert(service.handle('submit',data,a.token).accepted);
  repo.prune(time+10*86400000)}finally{repo.close()}
});

test('ranking reads take no lock and, while cached (15 s), read no sheet at all',()=>{
 const g=gas();const p=g.post('profile',{nickname:'Reader'});g.post('ranking',{difficulty:'EASY',period:'daily'},p.token);
 g.reset();const first=g.post('ranking',{difficulty:'HARD',period:'weekly'},p.token);assert(!first.error);
 assert.equal(g.stats.locks,0,'no lock for reads');assert.equal(g.stats.writes,0,'no sheet writes for reads');assert(g.stats.reads.HIGHLOW_v1_bests>=1,'first read builds the board');
 g.reset();g.now+=BOARD_TTL_MS-1000;const second=g.post('ranking',{difficulty:'HARD',period:'weekly'},p.token);assert.deepEqual(second.rows,first.rows);
 assert.deepEqual(g.stats.reads,{},'cached: no sheet is read');assert.equal(g.stats.opens,0,'cached: the spreadsheet is not even opened');assert.equal(g.stats.locks,0);
 g.reset();g.now+=2000;g.post('ranking',{difficulty:'HARD',period:'weekly'},p.token);assert(g.stats.reads.HIGHLOW_v1_bests>=1,'after 15 s the board is rebuilt');
 g.reset();g.post('start',START('EASY'),p.token);assert.equal(g.stats.locks,1,'writes still take the lock');
});

test('Node read path: no transaction and no repository reads while the board is cached',async()=>{
 const repo=new SQLiteRepository(':memory:');try{let time=Date.parse('2026-11-09T03:00:00Z');const service=new RankingService(repo,{now:()=>time,id:randomUUID,hash,seed:()=>3});const origin='https://example.test';
  const request=(body,cookie)=>new Request(origin+'/api/ranking',{method:'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const out=await handleApi(request({action:'profile',data:{nickname:'Cookie'}}),service,repo,{origin});const cookie=out.headers.get('set-cookie').split(';')[0];
  let transactions=0,lists=0;const tx=repo.transaction.bind(repo),list=repo.list.bind(repo);repo.transaction=fn=>{transactions++;return tx(fn)};repo.list=t=>{lists++;return list(t)};
  for(let i=0;i<3;i++){const r=await handleApi(request({action:'ranking',data:{difficulty:'EASY',period:'all'}},cookie),service,repo,{origin});assert.equal(r.status,200)}
  assert.equal(transactions,0);assert.equal(lists,2,'players + bests read once, then served from the 15 s cache')}finally{repo.close()}
});

test('players can hide their name: listed without a name, with rank and score',()=>{
 const repo=new SQLiteRepository(':memory:');try{let time=Date.parse('2026-11-09T03:00:00Z'),seed=11;const service=new RankingService(repo,{now:()=>time,id:randomUUID,hash,seed:()=>seed++});
  const shy=service.dispatch('profile',{nickname:'Shy Student'},null,'t'),open=service.dispatch('profile',{nickname:'Open'},null,'t');
  for(const [p,n] of [[shy,3],[open,2]]){const run=service.handle('start',START('NORMAL'),p.token);const {wall,data}=play(run,'NORMAL',n);time+=wall+100;service.handle('submit',data,p.token)}
  assert.deepEqual(service.handle('profile',{hidden:true},shy.token).player,{nickname:'Shy Student',hidden:true});
  const board=service.handle('ranking',{difficulty:'NORMAL',period:'all'},open.token);
  assert.deepEqual(board.rows.map(r=>[r.rank,r.nickname,r.hidden,r.score]),[[1,HIDDEN_NAME,true,300],[2,'Open',false,200]]);
  assert(!JSON.stringify(board).includes('Shy Student'),'the hidden name is never sent');
  assert.equal(service.handle('ranking',{difficulty:'NORMAL',period:'all'},shy.token).me.rank,1);
  service.handle('profile',{hidden:false},shy.token);assert.equal(service.handle('ranking',{difficulty:'NORMAL',period:'all'},open.token).rows[0].nickname,'Shy Student','changing visibility refreshes the cached board');
  assert.throws(()=>service.handle('profile',{hidden:'yes'},shy.token),{code:'INVALID_REQUEST'})}finally{repo.close()}
});

test('banned words are refused with a Japanese reason; ordinary names still pass',()=>{
 for(const name of ['しね','シネ太郎','死ね','ころす','うんこマン','ばか','バカ','ア ホ','ＦＵＣＫ','f.u.c.k','baka','きもい！'])assert.throws(()=>validateNickname(name),e=>e.code==='BANNED_NAME'&&/使用できない言葉/.test(e.message),name);
 for(const name of ['やくそく','skill','えっちゃん','ちねん','ばかうけ好き','Alice','新しい名前','数学マスター'])assert.equal(validateNickname(name),name.normalize('NFKC').trim(),name);
 const g=gas();const p=g.post('profile',{});const r=g.post('profile',{nickname:'しね'},p.token);assert.equal(r.error.code,'BANNED_NAME');assert.match(r.error.message,/使用できない言葉/);
});

test('a transfer code restores the same player in another client (verified by the server)',async()=>{
 const g=gas();const endpoint='https://script.google.com/macros/s/x/exec';
 const first=new RankingClient({endpoint,gas:true,storage:memoryStore(),fetcher:viaGas(g)});await first.identity();await first.nickname('Traveller');
 const run=await first.start('EASY');const {wall,data}=play(run,'EASY',2);g.now+=wall+100;await first.submitAnswers(data.runId,data.answers,data.finalElapsed);
 const code=first.transferCode();assert(code&&code.length>30);
 const storage=memoryStore(),second=new RankingClient({endpoint,gas:true,storage,fetcher:viaGas(g)});await second.identity();const own=second.token;
 await assert.rejects(second.restore('not-a-real-code'),e=>e.code==='INVALID_CODE'&&/正しくありません/.test(e.message));
 assert.equal(second.token,own,'a wrong code keeps the current player');assert.equal(storage.getItem('high-low:ranking-token:v1'),own);
 const restored=await second.restore('  '+code.slice(0,20)+'\n'+code.slice(20)+' ');assert.equal(restored.player.nickname,'Traveller');
 assert.equal(second.token,code);assert.equal(storage.getItem('high-low:ranking-token:v1'),code,'the verified code replaces the stored identity');
 g.now+=BOARD_TTL_MS+1;const board=await second.ranking('EASY','all');assert.equal(board.me.nickname,'Traveller');assert.equal(board.me.score,200);
 const node=new RankingClient({fetcher:async()=>new Response('{}')});assert.equal(node.transferCode(),null);await assert.rejects(node.restore(code),{code:'UNSUPPORTED'});
});

test('cleanup rewrites each table in bulk (2 writes, not one per row), same targets as before',()=>{
 const g=gas();const old=g.now-3*86400000,fresh=g.now+600000;
 for(let i=0;i<40;i++)addRow(g,'limits','old-'+i,JSON.stringify({id:'old-'+i,count:1,expiresAt:old}));
 for(let i=0;i<5;i++)addRow(g,'limits','new-'+i,JSON.stringify({id:'new-'+i,count:1,expiresAt:fresh}));
 addRow(g,'limits','broken','{oops');
 for(let i=0;i<30;i++)addRow(g,'runs','run-'+i,JSON.stringify({id:'run-'+i,playerId:'p',difficulty:'EASY',seed:1,startedAt:old,expiresAt:i<20?old:fresh}));
 addRow(g,'bests','b',JSON.stringify({playerId:'p',difficulty:'EASY',period:'all',periodKey:'all',score:1,correct:1,answers:1,responseUs:1,achievedAt:old}));
 g.reset();g.context.cleanupHighLow();
 assert.deepEqual(g.sheet('limits').cells.slice(1).map(r=>r[0]),['new-0','new-1','new-2','new-3','new-4','broken']);
 assert.deepEqual(g.sheet('runs').cells.slice(1).map(r=>r[0]),Array.from({length:10},(_,i)=>'run-'+(20+i)));
 assert.equal(g.sheet('bests').cells.length,2,'bests are never pruned');
 assert(g.stats.writes<=2&&g.stats.deletes<=2,`writes ${g.stats.writes}, deletes ${g.stats.deletes}`);
});

test('stored record shapes are validated per table',()=>{
 assert(isValidRecord('players',{id:'a',nickname:null}));assert(!isValidRecord('players',{nickname:'x'}));assert(!isValidRecord('bests',{playerId:'a',difficulty:'EASY',period:'all',periodKey:'all',score:-1,correct:0,answers:0,responseUs:0,achievedAt:1}));
 assert(!isValidRecord('limits',null));assert(!isValidRecord('runs',[]));
});
