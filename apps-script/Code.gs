// Source: dist/engine.js
const EQUAL_RATE = .15;
const DURATION = 30000, FEEDBACK_MS = 300;
const gcd=(a,b)=>b?gcd(b,a%b):a;
function rational(n,d=1){if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||!d)throw Error('Invalid rational');if(d<0){n=-n;d=-d}const g=gcd(Math.abs(n),d);return {n:n/g,d:d/g,rad:1}}
function radical(n,rad,d=1){while(true){let found=false;for(let k=2;k*k<=rad;k++)if(rad%(k*k)===0){n*=k;rad/=k*k;found=true;break}if(!found)break}return {...rational(n,d),rad}}
// All generated values are nonnegative rational multiples of square roots.
// Squaring preserves their order; BigInt cross products avoid floating point errors.
function compare(a,b){const x=BigInt(a.n)**2n*BigInt(a.rad)*BigInt(b.d)**2n,y=BigInt(b.n)**2n*BigInt(b.rad)*BigInt(a.d)**2n;return x===y?'EQUAL':x>y?'LEFT':'RIGHT'}
const expr=(text,value,category)=>({text,value,category});
const HARD_POOL=[
expr('sin 30°',rational(1,2),'三角関数'),expr('1/2',rational(1,2),'分数'),expr('cos 60°',rational(1,2),'三角関数'),expr('0.6',rational(3,5),'小数'),
expr('√50',radical(1,50),'平方根'),expr('7',rational(7),'整数'),expr('2⁵',rational(32),'指数'),expr('5²',rational(25),'指数'),expr('log₂ 8',rational(3),'対数'),expr('√9',rational(3),'平方根'),
expr('2/3',rational(2,3),'分数'),expr('0.67',rational(67,100),'小数'),expr('tan 45°',rational(1),'三角関数'),expr('sin 90°',rational(1),'三角関数'),expr('sin 60°',radical(1,3,2),'三角関数'),expr('cos 30°',radical(1,3,2),'三角関数'),
expr('√2',radical(1,2),'平方根'),expr('1.4',rational(7,5),'小数'),expr('|−8|',rational(8),'絶対値'),expr('log₃ 81',rational(4),'対数'),expr('3⁴',rational(81),'指数'),expr('√81',rational(9),'平方根'),expr('1 + 2 + ⋯ + 10',rational(55),'数列'),expr('5 × 11',rational(55),'数列'),expr('3/4',rational(3,4),'分数'),expr('0.75',rational(3,4),'小数'),expr('√12',radical(1,12),'平方根'),expr('2√3',radical(2,3),'平方根'),expr('2⁻²',rational(1,4),'指数'),expr('0.25',rational(1,4),'小数')];
function seeded(seed=1){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
class Generator{
 constructor(difficulty,rng=Math.random){this.difficulty=difficulty;this.rng=rng;this.recent=[];this.serial=0;this.side=0;this.bag=[]}
 int(n){return Math.floor(this.rng()*n)}
 elementary(v,op){if(op===0){let a=this.int(v+1);return expr(`${a} + ${v-a}`,rational(v),'足し算')}if(op===1){let a=v+this.int(101-v);return expr(`${a} − ${a-v}`,rational(v),'引き算')}if(op===2){let ds=[];for(let d=1;d<=100;d++)if((v===0||v%d===0)&&v/d<=100)ds.push(d);let d=ds[this.int(ds.length)];return expr(`${d} × ${v/d}`,rational(v),'掛け算')}let m=1+this.int(v===0?100:Math.floor(100/v));return expr(`${v*m} ÷ ${m}`,rational(v),'割り算')}
 next(){let left,right,key,answer;
 const equal=this.difficulty!=='EASY'&&this.rng()<EQUAL_RATE;
 if(!this.bag.length)this.bag=this.rng()<.5?['LEFT','RIGHT']:['RIGHT','LEFT'];
 const target=equal?'EQUAL':this.bag[this.bag.length-1];
 for(let attempts=0;attempts<1000;attempts++){
 if(this.difficulty==='HARD'){left=HARD_POOL[this.int(HARD_POOL.length)];const options=HARD_POOL.filter(e=>e.text!==left.text&&compare(left.value,e.value)===target);if(!options.length)continue;right=options[this.int(options.length)]}
 else{let a=this.int(101),b=equal?a:this.int(101);if(!equal&&a===b)continue;if((target==='LEFT'&&a<b)||(target==='RIGHT'&&a>b))[a,b]=[b,a];left=this.elementary(a,this.serial%4);right=this.elementary(b,(this.serial+1+this.int(3))%4)}
 answer=compare(left.value,right.value);key=left.text+'|'+right.text;if(this.recent.includes(key))continue;if(!equal)this.bag.pop();break;
 }
 if(!left||this.recent.includes(key))throw Error('Question pool exhausted');this.recent.push(key);if(this.recent.length>30)this.recent.shift();
 return {id:`${this.difficulty}-${++this.serial}`,difficulty:this.difficulty,leftExpression:left.text,rightExpression:right.text,leftValue:left.value,rightValue:right.value,answer,category:`${left.category} / ${right.category}`}
 }
}
class Game{
 constructor(difficulty,{clock=()=>performance.now(),rng=Math.random}={}){this.clock=clock;this.generator=new Generator(difficulty,rng);this.difficulty=difficulty;this.state='READY';this.remaining=DURATION;this.score=0;this.combo=0;this.maxCombo=0;this.correct=0;this.wrong=0;this.responseTotal=0;this.interrupted=false;this.history=[]}
 start(){this.state='COUNTDOWN';this.until=this.clock()+3000}
 tick(){let now=this.clock();if(this.state==='COUNTDOWN'&&now>=this.until)this.open(now);else if(this.state==='FEEDBACK'&&now>=this.until)this.open(now);else if(this.state==='PLAYING'&&now-this.started>=this.remaining){this.remaining=0;this.state='FINISHED'}return this.state}
 open(now){this.question=this.generator.next();this.started=now;this.state='PLAYING'}
 timeLeft(){return Math.max(0,this.remaining-(this.state==='PLAYING'?this.clock()-this.started:0))}
 answer(choice){if(this.state!=='PLAYING')return false;this.tick();if(this.state!=='PLAYING'||!['LEFT','RIGHT','EQUAL'].includes(choice)||(this.difficulty==='EASY'&&choice==='EQUAL'))return false;const elapsed=this.clock()-this.started;if(elapsed>=this.remaining){this.remaining=0;this.state='FINISHED';return false}this.remaining-=elapsed;this.responseTotal+=elapsed;this.isCorrect=choice===this.question.answer;if(this.isCorrect){this.correct++;this.combo++;this.maxCombo=Math.max(this.combo,this.maxCombo);this.delta=this.combo>=20?200:this.combo>=10?150:this.combo>=5?120:100}else{this.wrong++;this.combo=0;this.delta=-100}this.score=Math.max(0,this.score+this.delta);this.history.push({question:this.question,choice,elapsed,score:this.score});this.state='FEEDBACK';this.until=this.clock()+FEEDBACK_MS;return true}
 interrupt(){if(['COUNTDOWN','PLAYING','FEEDBACK'].includes(this.state)){this.remaining=this.timeLeft();this.interrupted=true;this.state='FINISHED'}}
 stats(){let total=this.correct+this.wrong;return {score:this.score,correct:this.correct,wrong:this.wrong,accuracy:total?this.correct/total*100:0,maxCombo:this.maxCombo,average:total?this.responseTotal/total:0}}
}

// Source: server/ranking-core.js
const ENGINE_VERSION='high-low-0.1';
const DIFFICULTIES=['EASY','NORMAL','HARD'];
const PERIODS=['daily','weekly','all'];
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message)};
function periodKeys(now){const shifted=new Date(now+9*3600000);const day=shifted.toISOString().slice(0,10);const monday=new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()));monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);return {daily:day,weekly:monday.toISOString().slice(0,10),all:'all'}}
function compareRecords(a,b){if(a.score!==b.score)return a.score>b.score?-1:1;const aa=BigInt(a.answers||1),ba=BigInt(b.answers||1);const accuracy=BigInt(a.correct)*ba-BigInt(b.correct)*aa;if(accuracy)return accuracy>0n?-1:1;if(!a.answers||!b.answers){if(a.answers!==b.answers)return a.answers?-1:1;return 0}const time=BigInt(a.responseUs)*ba-BigInt(b.responseUs)*aa;return time<0n?-1:time>0n?1:0}
function leaderboard(records,playerId,players){const sorted=records.filter(r=>players.get(r.playerId)?.nickname).sort((a,b)=>compareRecords(a,b)||a.achievedAt-b.achievedAt||a.playerId.localeCompare(b.playerId));let rank=0;const rows=sorted.map((r,i)=>{if(i===0||compareRecords(r,sorted[i-1])!==0)rank=i+1;return {rank,nickname:players.get(r.playerId).nickname,score:r.score,accuracy:r.answers?r.correct/r.answers*100:0,averageMs:r.answers?r.responseUs/r.answers/1000:null,isMe:r.playerId===playerId}});return {rows:rows.slice(0,100),me:rows.find(r=>r.isMe)||null,totalPlayers:rows.length}}
const keysOnly=(data,keys)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))fail('INVALID_REQUEST','リクエスト形式が正しくありません。')};
function validateNickname(input){if(typeof input!=='string')fail('INVALID_NAME','ニックネームを入力してください。');const s=input.normalize('NFKC').trim();if([...s].length<1||[...s].length>16||/[\p{C}<>]/u.test(s))fail('INVALID_NAME','ニックネームは1〜16文字で入力してください。');return s}
function replayRun(run,payload,now){keysOnly(payload,['runId','answers','completed']);if(payload.runId!==run.id||payload.completed!==true||!Array.isArray(payload.answers)||payload.answers.length>500)fail('INVALID_HISTORY','回答履歴が正しくありません。');if(run.engineVersion!==ENGINE_VERSION)fail('ENGINE_VERSION','ゲームのバージョンが変わりました。再試行してください。',409);if(now>run.expiresAt)fail('EXPIRED','試合の受付期限が切れています。',410);
 let clock=0,total=0;const game=new Game(run.difficulty,{clock:()=>clock,rng:seeded(run.seed)});game.start();clock=3000;game.tick();
 for(const a of payload.answers){keysOnly(a,['questionId','choice','elapsed']);if(!Number.isFinite(a.elapsed)||a.elapsed<0||a.elapsed>=DURATION||!['LEFT','RIGHT','EQUAL'].includes(a.choice)||a.questionId!==game.question.id)fail('INVALID_HISTORY','回答順序・問題ID・時間が正しくありません。');total+=a.elapsed;if(total>=DURATION)fail('TIME_LIMIT','制限時間後の回答は登録できません。');clock+=a.elapsed;if(!game.answer(a.choice))fail('INVALID_ANSWER','無効な回答です。');clock+=FEEDBACK_MS;game.tick()}
 const minimumWall=3000+DURATION+payload.answers.length*FEEDBACK_MS;
 if(now-run.startedAt<minimumWall-50)fail('TOO_EARLY','試合の終了時刻を確認できません。',409);
 if(now-run.startedAt>minimumWall+60000)fail('TIMING_MISMATCH','試合時間と通信時間の差が大きいため登録できません。',422);
 return {score:game.score,correct:game.correct,wrong:game.wrong,answers:payload.answers.length,responseUs:Math.round(game.responseTotal*1000),maxCombo:game.maxCombo};
}
// Storage and cryptography are injected: identical validation works with SQLite or Apps Script.
class RankingService{
 constructor(repo,{now=()=>Date.now(),id,hash,seed}){this.repo=repo;this.now=now;this.id=id;this.hash=hash;this.seed=seed}
 limit(key,limit,ms){const now=this.now(),bucket=Math.floor(now/ms),id=key+':'+bucket;const current=this.repo.get('limits',id)||{id,count:0,expiresAt:(bucket+1)*ms};if(current.count>=limit)fail('RATE_LIMIT','連続した操作が多すぎます。少し待って再試行してください。',429);current.count++;this.repo.put('limits',id,current)}
 identity(token,clientKey){if(token){if(typeof token!=='string'||token.length>200)fail('UNAUTHORIZED','プレイヤー情報を確認できません。',401);const found=this.repo.get('players',this.hash(token));if(found)return {player:found,token};fail('UNAUTHORIZED','プレイヤー情報が無効です。登録し直してください。',401)}this.limit('identity:'+clientKey,120,60000);const newToken=this.id()+this.id(),player={id:this.id(),nickname:null,createdAt:this.now()};this.repo.put('players',this.hash(newToken),player);return {player,token:newToken}}
 dispatch(action,data,token,clientKey='unknown'){
  const now=this.now();if(action==='profile'){keysOnly(data,['nickname']);const auth=this.identity(token,clientKey);if('nickname'in data){this.limit('nickname:'+auth.player.id,5,60000);auth.player.nickname=validateNickname(data.nickname);this.repo.put('players',this.hash(auth.token),auth.player)}return {token:auth.token,player:{nickname:auth.player.nickname},registered:!!auth.player.nickname}}
  if(!token)fail('UNAUTHORIZED','プレイヤー登録が必要です。',401);const {player}=this.identity(token,clientKey);
  if(action==='start'){keysOnly(data,['difficulty']);if(!DIFFICULTIES.includes(data.difficulty))fail('INVALID_DIFFICULTY','難易度を選択してください。');this.limit('start:'+player.id,6,60000);const run={id:this.id(),playerId:player.id,difficulty:data.difficulty,seed:this.seed(),engineVersion:ENGINE_VERSION,startedAt:now,expiresAt:now+600000,result:null};this.repo.put('runs',run.id,run);return {runId:run.id,seed:run.seed,engineVersion:run.engineVersion}}
  if(action==='submit'){keysOnly(data,['runId','answers','completed']);if(typeof data.runId!=='string')fail('INVALID_HISTORY','試合IDが必要です。');const run=this.repo.get('runs',data.runId);if(!run||run.playerId!==player.id)fail('RUN_NOT_FOUND','試合を確認できません。',404);const digest=this.hash(JSON.stringify(data));
   if(run.result){if(run.digest!==digest)fail('DUPLICATE','この試合は登録済みです。',409)}else{this.limit('submit:'+player.id,12,60000);const stats=replayRun(run,data,now);run.digest=digest;run.result={...stats,playerId:player.id,difficulty:run.difficulty,runId:run.id,achievedAt:now,periodKeys:periodKeys(now)};this.repo.put('runs',run.id,run)}
   // Re-apply all three idempotent best writes on retry, including after a sheet write failure.
   const updated={};for(const period of PERIODS){const result={...run.result,period,periodKey:run.result.periodKeys[period]},key=[player.id,run.difficulty,period,result.periodKey].join(':');const old=this.repo.get('bests',key);updated[period]=!old||compareRecords(result,old)<0;if(updated[period])this.repo.put('bests',key,result)}return {accepted:true,stats:{score:run.result.score,correct:run.result.correct,wrong:run.result.wrong},updated,registered:!!player.nickname,periodKeys:run.result.periodKeys}}
  if(action==='ranking'){keysOnly(data,['difficulty','period']);if(!DIFFICULTIES.includes(data.difficulty)||!PERIODS.includes(data.period))fail('INVALID_FILTER','難易度と集計期間を選択してください。');const periods=periodKeys(now),players=new Map(this.repo.list('players').map(p=>[p.id,p]));const records=this.repo.list('bests').filter(r=>r.difficulty===data.difficulty&&r.period===data.period&&r.periodKey===periods[data.period]);return {...leaderboard(records,player.id,players),difficulty:data.difficulty,period:data.period,periodKey:periods[data.period],timezone:'Asia/Tokyo',weekStartsOn:'Monday',serverTime:now}}
  fail('NOT_FOUND','APIが見つかりません。',404)
 }
}

// Source: apps-script/adapter.js
// Server-side only. Generated with the shared game engine and ranking validator.
const HL_TABLES={players:'HIGHLOW_v1_players',runs:'HIGHLOW_v1_runs',bests:'HIGHLOW_v1_bests',limits:'HIGHLOW_v1_limits'};
class SheetsRepository{
 constructor(book){this.book=book;this.cache={}}
 table(kind){if(!HL_TABLES[kind])throw Error('Unknown table');if(this.cache[kind])return this.cache[kind];const sheet=this.book.getSheetByName(HL_TABLES[kind]);if(!sheet)throw Error('Ranking storage has not been initialized');const values=sheet.getDataRange().getValues();if(values[0]?.[0]!=='key'||values[0]?.[1]!=='json')throw Error('Unexpected ranking schema');const entries=new Map();for(let i=1;i<values.length;i++)if(values[i][0])entries.set(String(values[i][0]),{row:i+1,value:JSON.parse(values[i][1])});return this.cache[kind]={sheet,entries}}
 get(kind,key){return this.table(kind).entries.get(key)?.value||null}
 put(kind,key,value){const {sheet,entries}=this.table(kind);const raw=JSON.stringify(value);if(raw.length>45000)throw Error('Sheet row limit exceeded');const row=entries.get(key)?.row||sheet.getLastRow()+1;sheet.getRange(row,1,1,2).setValues([[key,raw]]);entries.set(key,{row,value})}
 list(kind){return [...this.table(kind).entries.values()].map(x=>x.value)}
}
function highLowHash(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>((b+256)%256).toString(16).padStart(2,'0')).join('')}
function highLowJSON(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)}
function doPost(event){let lock;try{const raw=event?.postData?.contents||'';if(Utilities.newBlob(raw).getBytes().length>96000)throw new ApiError(413,'BODY_LIMIT','送信データが大きすぎます。');let body;try{body=JSON.parse(raw)}catch{throw new ApiError(400,'JSON','JSON形式が正しくありません。')}if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','data','token'].includes(k)))throw new ApiError(400,'REQUEST','リクエスト形式が正しくありません。');if(body.token!==null&&body.token!==undefined&&(typeof body.token!=='string'||body.token.length>200))throw new ApiError(401,'UNAUTHORIZED','識別情報が無効です。');const properties=PropertiesService.getScriptProperties();const sheetId=properties.getProperty('HIGHLOW_SPREADSHEET_ID');if(!sheetId)throw Error('HIGHLOW_SPREADSHEET_ID is not configured');if(typeof BigInt!=='function')throw Error('V8 BigInt support is required');lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new ApiError(429,'BUSY','混雑しています。少し待って再試行してください。');const repo=new SheetsRepository(SpreadsheetApp.openById(sheetId));const service=new RankingService(repo,{id:()=>Utilities.getUuid(),hash:highLowHash,seed:()=>parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,8),16)});service.limit('requests:'+(body.token?highLowHash(body.token):'anonymous'),120,60000);const result=service.dispatch(body.action,body.data||{},body.token||null,'apps-script-anonymous');return highLowJSON(result)}catch(e){return highLowJSON({error:{code:e.code||'SERVER_ERROR',message:e instanceof ApiError?e.message:'ランキングの接続または保存を確認できません。'}})}finally{if(lock)lock.releaseLock()}}
function doGet(){return highLowJSON({service:'HIGH×LOW ranking',version:'1.0-rc',method:'POST',verification:'server-replay-with-client-timing'})}
// Run manually only on a dedicated NEW sheet. No existing game schema is reused blindly.
function setupHighLow(){const p=PropertiesService.getScriptProperties();if(p.getProperty('ALLOW_HIGHLOW_SETUP')!=='yes')throw Error('Set ALLOW_HIGHLOW_SETUP=yes only after confirming a dedicated HIGH LOW sheet');const b=SpreadsheetApp.openById(p.getProperty('HIGHLOW_SPREADSHEET_ID'));for(const name of Object.values(HL_TABLES)){const existing=b.getSheetByName(name);if(existing){const h=existing.getRange(1,1,1,2).getValues()[0];if(h[0]!=='key'||h[1]!=='json')throw Error('Refusing to change an existing table');continue}const s=b.insertSheet(name);s.getRange(1,1,1,2).setValues([['key','json']]);s.setFrozenRows(1)}p.deleteProperty('ALLOW_HIGHLOW_SETUP')}
// Install a daily trigger after deployment. Only expired runs/limits are pruned.
function cleanupHighLow(){const p=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();lock.waitLock(10000);try{const b=SpreadsheetApp.openById(p.getProperty('HIGHLOW_SPREADSHEET_ID')),cutoff=Date.now()-86400000;for(const kind of ['runs','limits']){const sheet=b.getSheetByName(HL_TABLES[kind]);if(!sheet)continue;const rows=sheet.getDataRange().getValues();for(let i=rows.length-1;i>=1;i--){const value=JSON.parse(rows[i][1]);if(value.expiresAt<cutoff)sheet.deleteRow(i+1)}}}finally{lock.releaseLock()}}
// One-time manual installation: always create a NEW spreadsheet; never use active sheet.
function createHighLowStorage(){const properties=PropertiesService.getScriptProperties();if(properties.getProperty('HIGHLOW_SPREADSHEET_ID'))throw Error('Storage already configured. Refusing to create a duplicate.');const book=SpreadsheetApp.create('HIGH×LOW Ver.1.0 ランキング');properties.setProperty('HIGHLOW_SPREADSHEET_ID',book.getId());properties.setProperty('ALLOW_HIGHLOW_SETUP','yes');setupHighLow();console.log('HIGH×LOW専用シート: '+book.getUrl());return book.getUrl()}
