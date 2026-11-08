// Apps Script's parser does not accept BigInt numeric literals.
// These games use bounded integers. Every multiplication is checked BEFORE use;
// unsupported future templates fail closed rather than silently rounding.
function hlExactProduct(values){let result=1;for(const value of values){if(!Number.isSafeInteger(value)||value<0)throw Error('Unsafe exact integer');if(value!==0&&result>Math.floor(Number.MAX_SAFE_INTEGER/value))throw Error('Exact integer product exceeds supported range');result*=value;if(!Number.isSafeInteger(result))throw Error('Unsafe exact integer product')}return result}
function hlCompareValues(a,b){const x=hlExactProduct([a.n,a.n,a.rad,b.d,b.d]),y=hlExactProduct([b.n,b.n,b.rad,a.d,a.d]);return x===y?'EQUAL':x>y?'LEFT':'RIGHT'}
function hlCompareRecords(a,b){if(a.score!==b.score)return a.score>b.score?-1:1;const aa=a.answers||1,ba=b.answers||1,x=hlExactProduct([a.correct,ba]),y=hlExactProduct([b.correct,aa]);if(x!==y)return x>y?-1:1;if(!a.answers||!b.answers){if(a.answers!==b.answers)return a.answers?-1:1;return 0}const left=hlExactProduct([a.responseUs,ba]),right=hlExactProduct([b.responseUs,aa]);return left<right?-1:left>right?1:0}

// Source: dist/engine.js
const EQUAL_RATE = .15;
const DURATION = 30000;
// Single source of truth for the game/ranking protocol. Bump on any change that alters replay, timing or question order.
// The same value is used for cache-busting (?v=) in index.html and the module imports.
const ENGINE_VERSION = 'high-low-0.2';
// Input lock after an answer (excluded from the 30 s): short after a correct answer, longer to read the correct relation after a miss.
const FEEDBACK_CORRECT_MS = 180, FEEDBACK_WRONG_MS = 500;
const feedbackMs = correct => correct ? FEEDBACK_CORRECT_MS : FEEDBACK_WRONG_MS;
// Countdown: first play 3×600 ms + GO 200 ms = 2.0 s; RETRY 3×300 ms + GO 200 ms = 1.1 s.
const COUNTDOWNS = {first:{step:600,go:200}, retry:{step:300,go:200}};
const countdownKind = kind => kind === 'retry' ? 'retry' : 'first';
const countdownMs = kind => {const c = COUNTDOWNS[countdownKind(kind)]; return c.step*3 + c.go};
function countdownLabel(kind, msLeft){const c = COUNTDOWNS[countdownKind(kind)], elapsed = c.step*3 + c.go - msLeft; return elapsed >= c.step*3 ? 'GO!' : String(3 - Math.floor(Math.max(0, elapsed)/c.step))}
// Answers faster than this are not humanly possible after reading a question; the client ignores them and the server rejects them.
const MIN_ANSWER_MS = 150;
// Σ(answer elapsed) + (elapsed on the last question when time ran out) must equal 30 000 ms within this tolerance.
const TOTAL_TOLERANCE_MS = 5;
// The shortest real time a completed run can take; client and server use this same function.
function minimumWallMs(kind, history){return countdownMs(kind) + DURATION + history.reduce((sum, h) => sum + feedbackMs(h.correct), 0)}
const gcd=(a,b)=>b?gcd(b,a%b):a;
function rational(n,d=1){if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||!d)throw Error('Invalid rational');if(d<0){n=-n;d=-d}const g=gcd(Math.abs(n),d);return {n:n/g,d:d/g,rad:1}}
function radical(n,rad,d=1){while(true){let found=false;for(let k=2;k*k<=rad;k++)if(rad%(k*k)===0){n*=k;rad/=k*k;found=true;break}if(!found)break}return {...rational(n,d),rad}}
// All generated values are nonnegative rational multiples of square roots.
// Squaring preserves their order; BigInt cross products avoid floating point errors.
function compare(a,b){return hlCompareValues(a,b)}
const expr=(text,value,category)=>({text,value,category});
// Duplicate key for the recent-30 window: the same two expressions in either order count as one pair.
const pairKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
const HARD_POOL=[
expr('sin 30°',rational(1,2),'三角関数'),expr('1/2',rational(1,2),'分数'),expr('cos 60°',rational(1,2),'三角関数'),expr('0.6',rational(3,5),'小数'),
expr('√50',radical(1,50),'平方根'),expr('7',rational(7),'整数'),expr('2⁵',rational(32),'指数'),expr('5²',rational(25),'指数'),expr('log₂ 8',rational(3),'対数'),expr('√9',rational(3),'平方根'),
expr('2/3',rational(2,3),'分数'),expr('0.67',rational(67,100),'小数'),expr('tan 45°',rational(1),'三角関数'),expr('sin 90°',rational(1),'三角関数'),expr('sin 60°',radical(1,3,2),'三角関数'),expr('cos 30°',radical(1,3,2),'三角関数'),
expr('√2',radical(1,2),'平方根'),expr('1.4',rational(7,5),'小数'),expr('|−8|',rational(8),'絶対値'),expr('log₃ 81',rational(4),'対数'),expr('3⁴',rational(81),'指数'),expr('√81',rational(9),'平方根'),expr('1 + 2 + ⋯ + 10',rational(55),'数列'),expr('5 × 11',rational(55),'数列'),expr('3/4',rational(3,4),'分数'),expr('0.75',rational(3,4),'小数'),expr('√12',radical(1,12),'平方根'),expr('2√3',radical(2,3),'平方根'),expr('2⁻²',rational(1,4),'指数'),expr('0.25',rational(1,4),'小数'),
// Added for close comparisons (|a−b|/max ≤ 10%). None of these equals another pool value.
expr('0.87',rational(87,100),'小数'),expr('0.85',rational(17,20),'小数'),expr('√3',radical(1,3),'平方根'),expr('1.7',rational(17,10),'小数'),expr('√10',radical(1,10),'平方根'),expr('3.5',rational(7,2),'小数'),expr('3.4',rational(17,5),'小数'),expr('√1000',radical(1,1000),'平方根'),expr('√15',radical(1,15),'平方根'),expr('3³',rational(27),'指数'),expr('5/8',rational(5,8),'分数'),expr('0.48',rational(12,25),'小数'),expr('0.7',rational(7,10),'小数'),expr('√60',radical(1,60),'平方根'),expr('√80',radical(1,80),'平方根'),expr('√48',radical(1,48),'平方根'),expr('7 × 8',rational(56),'掛け算'),expr('8 × 10',rational(80),'掛け算'),expr('5 × 6',rational(30),'掛け算'),expr('0.95',rational(19,20),'小数')];
const near=(a,b)=>[HARD_POOL.find(e=>e.text===a),HARD_POOL.find(e=>e.text===b)];
// Curated pairs whose values differ by at most 10% (and are never equal). Orientation is chosen per question.
const HARD_NEAR_PAIRS=[near('√50','7'),near('2/3','0.67'),near('√2','1.4'),near('sin 60°','0.87'),near('cos 30°','0.85'),near('√3','1.7'),near('log₂ 8','√10'),near('√10','3.4'),near('2√3','3.5'),near('√12','3.4'),near('2⁵','√1000'),near('log₃ 81','√15'),near('5²','3³'),near('0.6','5/8'),near('sin 30°','0.48'),near('2/3','0.7'),near('0.75','0.7'),near('|−8|','√60'),near('√81','√80'),near('7','√48'),near('1 + 2 + ⋯ + 10','7 × 8'),near('3⁴','8 × 10'),near('2⁵','5 × 6'),near('tan 45°','0.95'),near('cos 60°','0.48'),near('5 × 11','7 × 8')];
// Share of non-EQUAL HARD questions drawn from HARD_NEAR_PAIRS (tuned so that close comparisons are ~15–20% overall).
const HARD_NEAR_RATE=.12;
function seeded(seed=1){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
class Generator{
 constructor(difficulty,rng=Math.random){this.difficulty=difficulty;this.rng=rng;this.recent=[];this.serial=0;this.side=0;this.bag=[]}
 int(n){return Math.floor(this.rng()*n)}
 shuffle(items){for(let i=items.length-1;i>0;i--){const j=this.int(i+1);[items[i],items[j]]=[items[j],items[i]]}return items}
 elementary(v,op){if(op===0){let a=this.int(v+1);return expr(`${a} + ${v-a}`,rational(v),'足し算')}if(op===1){let a=v+this.int(101-v);return expr(`${a} − ${a-v}`,rational(v),'引き算')}if(op===2){let ds=[];for(let d=1;d<=100;d++)if((v===0||v%d===0)&&v/d<=100)ds.push(d);let d=ds[this.int(ds.length)];return expr(`${d} × ${v/d}`,rational(v),'掛け算')}let m=1+this.int(v===0?100:Math.floor(100/v));return expr(`${v*m} ÷ ${m}`,rational(v),'割り算')}
 next(){let left,right,key,answer;
 let equal=this.difficulty!=='EASY'&&this.rng()<EQUAL_RATE;
 if(!this.bag.length)this.bag=this.shuffle(['LEFT','LEFT','LEFT','LEFT','RIGHT','RIGHT','RIGHT','RIGHT']);
 let target=equal?'EQUAL':this.bag[this.bag.length-1];
 for(let attempts=0;attempts<1000;attempts++){
 // HARD has only 10 distinct EQUAL pairs; after an unusual EQUAL streak they can all be inside the recent window. Fall back to a side question.
 if(equal&&attempts===200){equal=false;target=this.bag[this.bag.length-1]}
 if(this.difficulty==='HARD'&&!equal&&this.rng()<HARD_NEAR_RATE){let [a,b]=HARD_NEAR_PAIRS[this.int(HARD_NEAR_PAIRS.length)];if(compare(a.value,b.value)!==target)[a,b]=[b,a];left=a;right=b}
 else if(this.difficulty==='HARD'){left=HARD_POOL[this.int(HARD_POOL.length)];const options=HARD_POOL.filter(e=>e.text!==left.text&&compare(left.value,e.value)===target);if(!options.length)continue;right=options[this.int(options.length)]}
 else{let a=this.int(101),b=equal?a:this.int(101);if(!equal&&a===b)continue;if((target==='LEFT'&&a<b)||(target==='RIGHT'&&a>b))[a,b]=[b,a];left=this.elementary(a,this.serial%4);right=this.elementary(b,(this.serial+1+this.int(3))%4)}
 answer=compare(left.value,right.value);key=pairKey(left.text,right.text);if(this.recent.includes(key))continue;if(!equal)this.bag.pop();break;
 }
 if(!left||this.recent.includes(key))throw Error('Question pool exhausted');this.recent.push(key);if(this.recent.length>30)this.recent.shift();
 return {id:`${this.difficulty}-${++this.serial}`,difficulty:this.difficulty,leftExpression:left.text,rightExpression:right.text,leftValue:left.value,rightValue:right.value,answer,category:`${left.category} / ${right.category}`}
 }
}
class Game{
 constructor(difficulty,{clock=()=>performance.now(),rng=Math.random}={}){this.clock=clock;this.generator=new Generator(difficulty,rng);this.difficulty=difficulty;this.state='READY';this.remaining=DURATION;this.score=0;this.combo=0;this.maxCombo=0;this.correct=0;this.wrong=0;this.responseTotal=0;this.interrupted=false;this.history=[];this.finalElapsed=null;this.countdown='first'}
 start(kind='first'){this.countdown=countdownKind(kind);this.state='COUNTDOWN';this.until=this.clock()+countdownMs(this.countdown)}
 tick(){let now=this.clock();if(this.state==='COUNTDOWN'&&now>=this.until)this.open(now);else if(this.state==='FEEDBACK'&&now>=this.until)this.open(now);else if(this.state==='PLAYING'&&now-this.started>=this.remaining){this.finalElapsed=this.remaining;this.remaining=0;this.state='FINISHED'}return this.state}
 open(now){this.question=this.generator.next();this.started=now;this.state='PLAYING'}
 questionElapsed(){return this.state==='PLAYING'?this.clock()-this.started:0}
 timeLeft(){return Math.max(0,this.remaining-(this.state==='PLAYING'?this.clock()-this.started:0))}
 answer(choice){if(this.state!=='PLAYING')return false;this.tick();if(this.state!=='PLAYING'||!['LEFT','RIGHT','EQUAL'].includes(choice)||(this.difficulty==='EASY'&&choice==='EQUAL'))return false;const elapsed=this.clock()-this.started;if(elapsed>=this.remaining){this.finalElapsed=this.remaining;this.remaining=0;this.state='FINISHED';return false}if(elapsed<MIN_ANSWER_MS)return false;this.remaining-=elapsed;this.responseTotal+=elapsed;this.isCorrect=choice===this.question.answer;if(this.isCorrect){this.correct++;this.combo++;this.maxCombo=Math.max(this.combo,this.maxCombo);this.delta=this.combo>=20?200:this.combo>=10?150:this.combo>=5?120:100}else{this.wrong++;this.combo=0;this.delta=-100}this.score=Math.max(0,this.score+this.delta);this.history.push({question:this.question,choice,elapsed,score:this.score,correct:this.isCorrect});this.state='FEEDBACK';this.until=this.clock()+feedbackMs(this.isCorrect);return true}
 interrupt(){if(['COUNTDOWN','PLAYING','FEEDBACK'].includes(this.state)){this.remaining=this.timeLeft();this.interrupted=true;this.state='FINISHED'}}
 stats(){let total=this.correct+this.wrong;return {score:this.score,correct:this.correct,wrong:this.wrong,accuracy:total?this.correct/total*100:0,maxCombo:this.maxCombo,average:total?this.responseTotal/total:0}}
}

// Source: server/ranking-core.js
// ENGINE_VERSION lives in dist/engine.js (single source of truth); re-exported here for existing callers.
{ENGINE_VERSION};
const COUNTDOWN_KINDS=['first','retry'];
const RELOAD_MESSAGE='ゲームが更新されました。ページを再読み込みしてください。';
const LATE_MESSAGE='時間が経ったため登録できません（試合の終了から送信までに時間がかかりすぎました）。';
const DIFFICULTIES=['EASY','NORMAL','HARD'];
const PERIODS=['daily','weekly','all'];
class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message)};
function periodKeys(now){const shifted=new Date(now+9*3600000);const day=shifted.toISOString().slice(0,10);const monday=new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()));monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);return {daily:day,weekly:monday.toISOString().slice(0,10),all:'all'}}
function compareRecords(a,b){return hlCompareRecords(a,b)}
// Players can hide their name on the public board; rank and score stay visible.
const HIDDEN_NAME='非公開プレイヤー';
// Every stored row must have this shape; anything else (unparsable JSON, missing fields) is skipped instead of breaking the API.
const isInt=v=>Number.isSafeInteger(v)&&v>=0,isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),isStr=v=>typeof v==='string'&&v.length>0;
function isValidRecord(kind,v){if(!isObj(v))return false;
 if(kind==='players')return isStr(v.id)&&(v.nickname===null||v.nickname===undefined||typeof v.nickname==='string');
 if(kind==='runs')return isStr(v.id)&&isStr(v.playerId)&&DIFFICULTIES.includes(v.difficulty)&&Number.isFinite(v.seed)&&Number.isFinite(v.startedAt)&&Number.isFinite(v.expiresAt);
 if(kind==='bests')return isStr(v.playerId)&&DIFFICULTIES.includes(v.difficulty)&&PERIODS.includes(v.period)&&isStr(v.periodKey)&&isInt(v.score)&&isInt(v.correct)&&isInt(v.answers)&&isInt(v.responseUs)&&Number.isFinite(v.achievedAt);
 if(kind==='limits')return isStr(v.id)&&Number.isFinite(v.count)&&Number.isFinite(v.expiresAt);
 return true}
// Full ranking (all registered players) with internal player ids; this is what the 15 s board cache stores.
function rankedRows(records,players){const sorted=records.filter(r=>isObj(r)&&isStr(r.playerId)&&isInt(r.score)&&isInt(r.correct)&&isInt(r.answers)&&isInt(r.responseUs)&&players.get(r.playerId)?.nickname).sort((a,b)=>compareRecords(a,b)||a.achievedAt-b.achievedAt||a.playerId.localeCompare(b.playerId));let rank=0;return sorted.map((r,i)=>{if(i===0||compareRecords(r,sorted[i-1])!==0)rank=i+1;const p=players.get(r.playerId);return {rank,playerId:r.playerId,nickname:p.hidden?HIDDEN_NAME:p.nickname,hidden:!!p.hidden,score:r.score,accuracy:r.answers?r.correct/r.answers*100:0,averageMs:r.answers?r.responseUs/r.answers/1000:null}})}
function boardFor(rows,playerId){const out=rows.map(({playerId:id,...row})=>({...row,isMe:id===playerId}));return {rows:out.slice(0,100),me:out.find(r=>r.isMe)||null,totalPlayers:out.length}}
function leaderboard(records,playerId,players){return boardFor(rankedRows(records,players),playerId)}
const keysOnly=(data,keys)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))fail('INVALID_REQUEST','リクエスト形式が正しくありません。')};
// Minimal server-side list (extend as needed). Names are compared after NFKC, lower-casing, katakana→hiragana and removing spaces/symbols.
// BANNED_WORDS match anywhere in the name; BANNED_EXACT are short words that only match the whole name (to avoid blocking e.g. 「やくそく」).
const BANNED_WORDS=['しね','死ね','ころす','殺す','うんこ','うんち','ちんこ','ちんちん','まんこ','おっぱい','せっくす','れいぷ','ばーか','きもい','きしょい','うざい','fuck','shit','bitch','pussy','porn','nigger'];
const BANNED_EXACT=['ばか','あほ','ぶす','くず','かす','くそ','でぶ','はげ','ごみ','えっち','kill','die','sex','dick','baka','aho','busu','kuso','shine','kasu'];
function normalizeForFilter(s){return s.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s\p{P}\p{S}ー]/gu,'')}
function validateNickname(input){if(typeof input!=='string')fail('INVALID_NAME','ニックネームを入力してください。');const s=input.normalize('NFKC').trim();if([...s].length<1||[...s].length>16||/[\p{C}<>]/u.test(s))fail('INVALID_NAME','ニックネームは1〜16文字で入力してください。');const plain=normalizeForFilter(s);if(BANNED_WORDS.some(w=>plain.includes(w))||BANNED_EXACT.includes(plain))fail('BANNED_NAME','使用できない言葉が含まれているため、このニックネームは登録できません。別の名前にしてください。');return s}
function replayRun(run,payload,now){keysOnly(payload,['runId','answers','completed','finalElapsed']);if(payload.runId!==run.id||payload.completed!==true||!Array.isArray(payload.answers)||payload.answers.length>500)fail('INVALID_HISTORY','回答履歴が正しくありません。');if(run.engineVersion!==ENGINE_VERSION)fail('ENGINE_VERSION',RELOAD_MESSAGE,409);if(now>run.expiresAt)fail('EXPIRED',LATE_MESSAGE,410);
 const kind=countdownKind(run.countdown);let clock=0,total=0;const game=new Game(run.difficulty,{clock:()=>clock,rng:seeded(run.seed)});game.start(kind);clock=countdownMs(kind);game.tick();
 for(const a of payload.answers){keysOnly(a,['questionId','choice','elapsed']);if(!Number.isFinite(a.elapsed)||a.elapsed<0||a.elapsed>=DURATION||!['LEFT','RIGHT','EQUAL'].includes(a.choice)||a.questionId!==game.question.id)fail('INVALID_HISTORY','回答順序・問題ID・時間が正しくありません。');if(a.elapsed<MIN_ANSWER_MS)fail('TOO_FAST','回答時間が短すぎるため登録できません。');total+=a.elapsed;if(total>=DURATION)fail('TIME_LIMIT','制限時間後の回答は登録できません。');clock+=a.elapsed;if(!game.answer(a.choice))fail('INVALID_ANSWER','無効な回答です。');clock=game.until;game.tick()}
 // The last question shown when time ran out: answered time + its time must cover the whole 30 s (stops truncated histories).
 const last=payload.finalElapsed;if(!Number.isFinite(last)||last<0||Math.abs(total+last-DURATION)>TOTAL_TOLERANCE_MS)fail('INCOMPLETE_HISTORY','回答履歴が試合の最後までそろっていません。');
 // Same function and constants as the client: countdown + 30 s + per-answer lock (180 ms correct / 500 ms wrong).
 const minimumWall=minimumWallMs(kind,game.history);
 if(now-run.startedAt<minimumWall-50)fail('TOO_EARLY','試合の終了時刻を確認できません。',409);
 if(now-run.startedAt>minimumWall+60000)fail('TIMING_MISMATCH',LATE_MESSAGE,422);
 return {score:game.score,correct:game.correct,wrong:game.wrong,answers:payload.answers.length,responseUs:Math.round(game.responseTotal*1000),maxCombo:game.maxCombo};
}
// Pre-authentication limits live in a short-lived cache (Apps Script CacheService / process memory), never in the repository.
function memoryCache(){const store=new Map();return {get(key,now){const e=store.get(key);if(!e||e.expiresAt<=now){store.delete(key);return null}return e.value},put(key,value,ms,now){store.set(key,{value,expiresAt:now+ms});if(store.size>1000)for(const [k,e] of store)if(e.expiresAt<=now)store.delete(k)},remove(keys){for(const k of keys)store.delete(k)}}}
// Read path: ranking boards are cached for 15 s per difficulty × period (× period key); boards larger than this are not cached.
const BOARD_TTL_MS=15000,AUTH_TTL_MS=60000,BOARD_CACHE_MAX_CHARS=90000;
// Storage and cryptography are injected: identical validation works with SQLite or Apps Script.
class RankingService{
 constructor(repo,{now=()=>Date.now(),id,hash,seed,cache=memoryCache()}){this.repo=repo;this.now=now;this.id=id;this.hash=hash;this.seed=seed;this.cache=cache}
 sharedLimit(limit=120,ms=60000){const now=this.now(),key='shared:'+Math.floor(now/ms),count=(this.cache.get(key,now)||0)+1;if(count>limit)fail('RATE_LIMIT','連続した操作が多すぎます。少し待って再試行してください。',429);this.cache.put(key,count,ms-(now%ms)+1000,now)}
 limit(key,limit,ms){const now=this.now(),bucket=Math.floor(now/ms),id=key+':'+bucket;const current=this.repo.get('limits',id)||{id,count:0,expiresAt:(bucket+1)*ms};if(current.count>=limit)fail('RATE_LIMIT','連続した操作が多すぎます。少し待って再試行してください。',429);current.count++;this.repo.put('limits',id,current)}
 identity(token,clientKey){if(token){if(typeof token!=='string'||token.length>200)fail('UNAUTHORIZED','プレイヤー情報を確認できません。',401);const found=this.repo.get('players',this.hash(token));if(found)return {player:found,token};this.sharedLimit();fail('UNAUTHORIZED','プレイヤー情報が無効です。登録し直してください。',401)}this.sharedLimit();const newToken=this.id()+this.id(),player={id:this.id(),nickname:null,createdAt:this.now()};this.repo.put('players',this.hash(newToken),player);return {player,token:newToken}}
 // Per-request limit: verified tokens get a per-player bucket (stored); everything unverified shares one cached bucket (never stored).
 authorizeRequest(token,clientKey='unknown'){if(!token)return null;const {player}=this.identity(token,clientKey);this.limit('requests:'+player.id,120,60000);return player}
 handle(action,data,token,clientKey='unknown'){if(action==='ranking')return this.read(action,data,token,clientKey);this.authorizeRequest(token,clientKey);return this.dispatch(action,data,token,clientKey)}
 // Lock-free read path (no repository writes): token check via a short auth cache, per-player read limit in the cache, 15 s board cache.
 readerIdentity(token){if(!token||typeof token!=='string'||token.length>200){this.sharedLimit();fail('UNAUTHORIZED','プレイヤー登録が必要です。',401)}const now=this.now(),key='auth:'+this.hash(token);let player=this.cache.get(key,now);if(!player){player=this.repo.get('players',this.hash(token));if(!player||!isValidRecord('players',player)){this.sharedLimit();fail('UNAUTHORIZED','プレイヤー情報が無効です。登録し直してください。',401)}player={id:player.id,nickname:player.nickname??null,hidden:!!player.hidden};this.cache.put(key,player,AUTH_TTL_MS,now)}return player}
 readLimit(player,limit=120,ms=60000){const now=this.now(),key='reads:'+player.id+':'+Math.floor(now/ms),count=(this.cache.get(key,now)||0)+1;if(count>limit)fail('RATE_LIMIT','連続した操作が多すぎます。少し待って再試行してください。',429);this.cache.put(key,count,ms-(now%ms)+1000,now)}
 boardKey(difficulty,period,periodKey){return `board:${difficulty}:${period}:${periodKey}`}
 rankingRows(difficulty,period,periodKey){const now=this.now(),key=this.boardKey(difficulty,period,periodKey);const cached=this.cache.get(key,now);if(cached)return cached;const players=new Map(this.repo.list('players').filter(p=>isValidRecord('players',p)).map(p=>[p.id,p]));const records=this.repo.list('bests').filter(r=>isValidRecord('bests',r)&&r.difficulty===difficulty&&r.period===period&&r.periodKey===periodKey);const rows=rankedRows(records,players);if(JSON.stringify(rows).length<=BOARD_CACHE_MAX_CHARS)this.cache.put(key,rows,BOARD_TTL_MS,now);return rows}
 // Name/visibility changes are rare: drop the current boards so the change shows at once (submissions are not invalidated; ≤15 s stale is accepted).
 invalidateBoards(){const keys=periodKeys(this.now()),list=[];for(const d of DIFFICULTIES)for(const p of PERIODS)list.push(this.boardKey(d,p,keys[p]));this.cache.remove?.(list)}
 read(action,data,token,clientKey='unknown'){if(action!=='ranking')fail('NOT_FOUND','APIが見つかりません。',404);keysOnly(data,['difficulty','period']);const player=this.readerIdentity(token);this.readLimit(player);if(!DIFFICULTIES.includes(data.difficulty)||!PERIODS.includes(data.period))fail('INVALID_FILTER','難易度と集計期間を選択してください。');const now=this.now(),periods=periodKeys(now);return {...boardFor(this.rankingRows(data.difficulty,data.period,periods[data.period]),player.id),difficulty:data.difficulty,period:data.period,periodKey:periods[data.period],timezone:'Asia/Tokyo',weekStartsOn:'Monday',serverTime:now}}
 dispatch(action,data,token,clientKey='unknown'){
  const now=this.now();if(action==='profile'){keysOnly(data,['nickname','hidden']);if('hidden'in data&&typeof data.hidden!=='boolean')fail('INVALID_REQUEST','リクエスト形式が正しくありません。');const auth=this.identity(token,clientKey);if('nickname'in data||'hidden'in data){this.limit('nickname:'+auth.player.id,5,60000);if('nickname'in data)auth.player.nickname=validateNickname(data.nickname);if('hidden'in data)auth.player.hidden=data.hidden;this.repo.put('players',this.hash(auth.token),auth.player);this.cache.remove?.(['auth:'+this.hash(auth.token)]);this.invalidateBoards()}return {token:auth.token,player:{nickname:auth.player.nickname,hidden:!!auth.player.hidden},registered:!!auth.player.nickname}}
  if(!token)fail('UNAUTHORIZED','プレイヤー登録が必要です。',401);const {player}=this.identity(token,clientKey);
  if(action==='start'){keysOnly(data,['difficulty','engineVersion','countdown']);if(data.engineVersion!==ENGINE_VERSION)fail('ENGINE_VERSION',RELOAD_MESSAGE,409);if(!DIFFICULTIES.includes(data.difficulty))fail('INVALID_DIFFICULTY','難易度を選択してください。');if(!COUNTDOWN_KINDS.includes(data.countdown))fail('INVALID_REQUEST','リクエスト形式が正しくありません。');this.limit('start:'+player.id,6,60000);const run={id:this.id(),playerId:player.id,difficulty:data.difficulty,seed:this.seed(),engineVersion:ENGINE_VERSION,countdown:data.countdown,startedAt:now,expiresAt:now+600000,result:null};this.repo.put('runs',run.id,run);return {runId:run.id,seed:run.seed,engineVersion:run.engineVersion,countdown:run.countdown}}
  if(action==='submit'){keysOnly(data,['runId','answers','completed','finalElapsed']);if(typeof data.runId!=='string')fail('INVALID_HISTORY','試合IDが必要です。');const run=this.repo.get('runs',data.runId);if(!run||run.playerId!==player.id)fail('RUN_NOT_FOUND','試合を確認できません。',404);const digest=this.hash(JSON.stringify(data));
   if(run.result){if(run.digest!==digest)fail('DUPLICATE','この試合は登録済みです。',409)}else{this.limit('submit:'+player.id,12,60000);const stats=replayRun(run,data,now);run.digest=digest;run.result={...stats,playerId:player.id,difficulty:run.difficulty,runId:run.id,achievedAt:now,periodKeys:periodKeys(now)};this.repo.put('runs',run.id,run)}
   // Re-apply all three idempotent best writes on retry, including after a sheet write failure.
   const updated={};for(const period of PERIODS){const result={...run.result,period,periodKey:run.result.periodKeys[period]},key=[player.id,run.difficulty,period,result.periodKey].join(':');const old=this.repo.get('bests',key);updated[period]=!old||compareRecords(result,old)<0;if(updated[period])this.repo.put('bests',key,result)}return {accepted:true,stats:{score:run.result.score,correct:run.result.correct,wrong:run.result.wrong},updated,registered:!!player.nickname,periodKeys:run.result.periodKeys}}
  if(action==='ranking')return this.read(action,data,token,clientKey);
  fail('NOT_FOUND','APIが見つかりません。',404)
 }
}

// Source: apps-script/adapter.js
// Server-side only. Generated with the shared game engine and ranking validator.
const HL_TABLES={players:'HIGHLOW_v1_players',runs:'HIGHLOW_v1_runs',bests:'HIGHLOW_v1_bests',limits:'HIGHLOW_v1_limits'};
// Rows that cannot be read (unparsable JSON / wrong shape) are skipped and reported through onBroken; they never stop the API.
const HL_QUARANTINE='HIGHLOW_v1_quarantine';
class SheetsRepository{
 constructor(book,{onBroken=null}={}){this.source=book;this.cache={};this.onBroken=onBroken}
 get book(){if(typeof this.source==='function')this.source=this.source();return this.source}
 table(kind){if(!HL_TABLES[kind])throw Error('Unknown table');if(this.cache[kind])return this.cache[kind];const sheet=this.book.getSheetByName(HL_TABLES[kind]);if(!sheet)throw Error('Ranking storage has not been initialized');const values=sheet.getDataRange().getValues();if(values[0]?.[0]!=='key'||values[0]?.[1]!=='json')throw Error('Unexpected ranking schema');const entries=new Map(),broken=[];
  for(let i=1;i<values.length;i++){if(!values[i][0])continue;const raw=values[i][1];let value=null,reason='invalid shape';try{value=JSON.parse(raw);if(!isValidRecord(kind,value))value=null}catch{reason='unparsable JSON'}if(value===null){broken.push({kind,row:i+1,key:String(values[i][0]),raw:String(raw??''),reason});continue}entries.set(String(values[i][0]),{row:i+1,value})}
  if(broken.length&&this.onBroken){try{this.onBroken(broken)}catch(e){console.warn('HIGH×LOW: could not record broken rows',e)}}
  return this.cache[kind]={sheet,entries}}
 get(kind,key){return this.table(kind).entries.get(key)?.value||null}
 put(kind,key,value){const {sheet,entries}=this.table(kind);const raw=JSON.stringify(value);if(raw.length>45000)throw Error('Sheet row limit exceeded');const row=entries.get(key)?.row||sheet.getLastRow()+1;sheet.getRange(row,1,1,2).setValues([[key,raw]]);entries.set(key,{row,value})}
 list(kind){return [...this.table(kind).entries.values()].map(x=>x.value)}
}
// Read path (no lock): broken rows only go to the execution log.
function highLowLogBroken(broken){for(const b of broken)console.warn('HIGH×LOW: skipped broken row',b.kind,'row',b.row,b.reason)}
// Write path (under the script lock): also copy each broken row once (per 6 h) to the quarantine sheet for manual repair. The original row is left untouched.
function highLowQuarantine(getBook,cache){return broken=>{highLowLogBroken(broken);const fresh=broken.filter(b=>{const key='quarantined:'+b.kind+':'+b.row+':'+b.key;if(cache.get(key))return false;cache.put(key,1,21600000);return true});if(!fresh.length)return;const book=getBook();let sheet=book.getSheetByName(HL_QUARANTINE);if(!sheet){sheet=book.insertSheet(HL_QUARANTINE);sheet.getRange(1,1,1,6).setValues([['recordedAt','table','row','key','reason','raw']])}sheet.getRange(sheet.getLastRow()+1,1,fresh.length,6).setValues(fresh.map(b=>[new Date().toISOString(),b.kind,b.row,b.key,b.reason,b.raw.slice(0,45000)]))}}
function highLowHash(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>((b+256)%256).toString(16).padStart(2,'0')).join('')}
// CacheService holds unauthenticated/read limits, the token→player read cache and 15 s ranking boards (JSON values; no sheet rows).
// Falls back to memory where CacheService is unavailable (tests). Cache failures are never fatal.
function highLowCache(){if(typeof CacheService==='undefined')return memoryCache();const cache=CacheService.getScriptCache(),P='HIGHLOW:';return {get(key){try{const v=cache.get(P+key);return v===null||v===undefined?null:JSON.parse(v)}catch{return null}},put(key,value,ms){try{const text=JSON.stringify(value);if(text.length>95000)return;cache.put(P+key,text,Math.min(21600,Math.max(1,Math.ceil(ms/1000))))}catch{}},remove(keys){try{cache.removeAll(keys.map(k=>P+k))}catch{}}}}
function highLowJSON(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON)}
function doPost(event){let lock;try{const raw=event?.postData?.contents||'';if(Utilities.newBlob(raw).getBytes().length>96000)throw new ApiError(413,'BODY_LIMIT','送信データが大きすぎます。');let body;try{body=JSON.parse(raw)}catch{throw new ApiError(400,'JSON','JSON形式が正しくありません。')}if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','data','token'].includes(k)))throw new ApiError(400,'REQUEST','リクエスト形式が正しくありません。');if(body.token!==null&&body.token!==undefined&&(typeof body.token!=='string'||body.token.length>200))throw new ApiError(401,'UNAUTHORIZED','識別情報が無効です。');const properties=PropertiesService.getScriptProperties();const sheetId=properties.getProperty('HIGHLOW_SPREADSHEET_ID');if(!sheetId)throw Error('HIGHLOW_SPREADSHEET_ID is not configured');// Ranking reads take no lock and write nothing to the sheet; every other action is serialized by the script lock.
const reading=body.action==='ranking',cache=highLowCache();if(!reading){lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new ApiError(429,'BUSY','混雑しています。少し待って再試行してください。')}let book=null;const getBook=()=>{if(book===null)book=SpreadsheetApp.openById(sheetId);return book};const repo=new SheetsRepository(getBook,{onBroken:reading?highLowLogBroken:highLowQuarantine(getBook,cache)});const service=new RankingService(repo,{id:()=>Utilities.getUuid(),hash:highLowHash,seed:()=>parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,8),16),cache});const result=service.handle(body.action,body.data||{},body.token||null,'apps-script-anonymous');return highLowJSON(result)}catch(e){return highLowJSON({error:{code:e.code||'SERVER_ERROR',message:e instanceof ApiError?e.message:'ランキングの接続または保存を確認できません。'}})}finally{if(lock)lock.releaseLock()}}
function doGet(){return highLowJSON({service:'HIGH×LOW ranking',version:'1.0-rc',method:'POST',verification:'server-replay-with-client-timing'})}
// Run manually only on a dedicated NEW sheet. No existing game schema is reused blindly.
function setupHighLow(){const p=PropertiesService.getScriptProperties();if(p.getProperty('ALLOW_HIGHLOW_SETUP')!=='yes')throw Error('Set ALLOW_HIGHLOW_SETUP=yes only after confirming a dedicated HIGH LOW sheet');const b=SpreadsheetApp.openById(p.getProperty('HIGHLOW_SPREADSHEET_ID'));for(const name of Object.values(HL_TABLES)){const existing=b.getSheetByName(name);if(existing){const h=existing.getRange(1,1,1,2).getValues()[0];if(h[0]!=='key'||h[1]!=='json')throw Error('Refusing to change an existing table');continue}const s=b.insertSheet(name);s.getRange(1,1,1,2).setValues([['key','json']]);s.setFrozenRows(1)}p.deleteProperty('ALLOW_HIGHLOW_SETUP')}
// Install a daily trigger after deployment. Only expired runs/limits are pruned (expiresAt older than 24 h; unchanged).
// Bulk rewrite: kept rows are written back in one setValues and the freed tail removed with one deleteRows (2 writes per table instead of one per row).
// Rows that cannot be parsed are kept as they are.
function cleanupHighLow(){const p=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();lock.waitLock(10000);try{const b=SpreadsheetApp.openById(p.getProperty('HIGHLOW_SPREADSHEET_ID')),cutoff=Date.now()-86400000;for(const kind of ['runs','limits']){const sheet=b.getSheetByName(HL_TABLES[kind]);if(!sheet)continue;const rows=sheet.getDataRange().getValues();const keep=[];let removed=0;for(let i=1;i<rows.length;i++){let expired=false;try{const value=JSON.parse(rows[i][1]);expired=Number.isFinite(value?.expiresAt)&&value.expiresAt<cutoff}catch{}if(expired)removed++;else keep.push([rows[i][0],rows[i][1]])}if(!removed)continue;if(keep.length)sheet.getRange(2,1,keep.length,2).setValues(keep);sheet.deleteRows(2+keep.length,removed)}}finally{lock.releaseLock()}}
// One-time manual installation: always create a NEW spreadsheet; never use active sheet.
function createHighLowStorage(){const properties=PropertiesService.getScriptProperties();if(properties.getProperty('HIGHLOW_SPREADSHEET_ID'))throw Error('Storage already configured. Refusing to create a duplicate.');const book=SpreadsheetApp.create('HIGH×LOW Ver.1.0 ランキング');properties.setProperty('HIGHLOW_SPREADSHEET_ID',book.getId());properties.setProperty('ALLOW_HIGHLOW_SETUP','yes');setupHighLow();console.log('HIGH×LOW専用シート: '+book.getUrl());return book.getUrl()}
