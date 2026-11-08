import {Game, seeded, DURATION, ENGINE_VERSION, MIN_ANSWER_MS, TOTAL_TOLERANCE_MS, countdownKind, countdownMs, minimumWallMs} from '../dist/engine.js';
// ENGINE_VERSION lives in dist/engine.js (single source of truth); re-exported here for existing callers.
export {ENGINE_VERSION};
export const COUNTDOWN_KINDS=['first','retry'];
const RELOAD_MESSAGE='ゲームが更新されました。ページを再読み込みしてください。';
const LATE_MESSAGE='時間が経ったため登録できません（試合の終了から送信までに時間がかかりすぎました）。';
export const DIFFICULTIES=['EASY','NORMAL','HARD'];
export const PERIODS=['daily','weekly','all'];
export class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message)};
export function periodKeys(now){const shifted=new Date(now+9*3600000);const day=shifted.toISOString().slice(0,10);const monday=new Date(Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate()));monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);return {daily:day,weekly:monday.toISOString().slice(0,10),all:'all'}}
export function compareRecords(a,b){if(a.score!==b.score)return a.score>b.score?-1:1;const aa=BigInt(a.answers||1),ba=BigInt(b.answers||1);const accuracy=BigInt(a.correct)*ba-BigInt(b.correct)*aa;if(accuracy)return accuracy>0n?-1:1;if(!a.answers||!b.answers){if(a.answers!==b.answers)return a.answers?-1:1;return 0}const time=BigInt(a.responseUs)*ba-BigInt(b.responseUs)*aa;return time<0n?-1:time>0n?1:0}
// Players can hide their name on the public board; rank and score stay visible.
export const HIDDEN_NAME='非公開プレイヤー';
// Every stored row must have this shape; anything else (unparsable JSON, missing fields) is skipped instead of breaking the API.
const isInt=v=>Number.isSafeInteger(v)&&v>=0,isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),isStr=v=>typeof v==='string'&&v.length>0;
export function isValidRecord(kind,v){if(!isObj(v))return false;
 if(kind==='players')return isStr(v.id)&&(v.nickname===null||v.nickname===undefined||typeof v.nickname==='string');
 if(kind==='runs')return isStr(v.id)&&isStr(v.playerId)&&DIFFICULTIES.includes(v.difficulty)&&Number.isFinite(v.seed)&&Number.isFinite(v.startedAt)&&Number.isFinite(v.expiresAt);
 if(kind==='bests')return isStr(v.playerId)&&DIFFICULTIES.includes(v.difficulty)&&PERIODS.includes(v.period)&&isStr(v.periodKey)&&isInt(v.score)&&isInt(v.correct)&&isInt(v.answers)&&isInt(v.responseUs)&&Number.isFinite(v.achievedAt);
 if(kind==='limits')return isStr(v.id)&&Number.isFinite(v.count)&&Number.isFinite(v.expiresAt);
 return true}
// Full ranking (all registered players) with internal player ids; this is what the 15 s board cache stores.
export function rankedRows(records,players){const sorted=records.filter(r=>isObj(r)&&isStr(r.playerId)&&isInt(r.score)&&isInt(r.correct)&&isInt(r.answers)&&isInt(r.responseUs)&&players.get(r.playerId)?.nickname).sort((a,b)=>compareRecords(a,b)||a.achievedAt-b.achievedAt||a.playerId.localeCompare(b.playerId));let rank=0;return sorted.map((r,i)=>{if(i===0||compareRecords(r,sorted[i-1])!==0)rank=i+1;const p=players.get(r.playerId);return {rank,playerId:r.playerId,nickname:p.hidden?HIDDEN_NAME:p.nickname,hidden:!!p.hidden,score:r.score,accuracy:r.answers?r.correct/r.answers*100:0,averageMs:r.answers?r.responseUs/r.answers/1000:null}})}
export function boardFor(rows,playerId){const out=rows.map(({playerId:id,...row})=>({...row,isMe:id===playerId}));return {rows:out.slice(0,100),me:out.find(r=>r.isMe)||null,totalPlayers:out.length}}
export function leaderboard(records,playerId,players){return boardFor(rankedRows(records,players),playerId)}
const keysOnly=(data,keys)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!keys.includes(k)))fail('INVALID_REQUEST','リクエスト形式が正しくありません。')};
// Minimal server-side list (extend as needed). Names are compared after NFKC, lower-casing, katakana→hiragana and removing spaces/symbols.
// BANNED_WORDS match anywhere in the name; BANNED_EXACT are short words that only match the whole name (to avoid blocking e.g. 「やくそく」).
export const BANNED_WORDS=['しね','死ね','ころす','殺す','うんこ','うんち','ちんこ','ちんちん','まんこ','おっぱい','せっくす','れいぷ','ばーか','きもい','きしょい','うざい','fuck','shit','bitch','pussy','porn','nigger'];
export const BANNED_EXACT=['ばか','あほ','ぶす','くず','かす','くそ','でぶ','はげ','ごみ','えっち','kill','die','sex','dick','baka','aho','busu','kuso','shine','kasu'];
export function normalizeForFilter(s){return s.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s\p{P}\p{S}ー]/gu,'')}
export function validateNickname(input){if(typeof input!=='string')fail('INVALID_NAME','ニックネームを入力してください。');const s=input.normalize('NFKC').trim();if([...s].length<1||[...s].length>16||/[\p{C}<>]/u.test(s))fail('INVALID_NAME','ニックネームは1〜16文字で入力してください。');const plain=normalizeForFilter(s);if(BANNED_WORDS.some(w=>plain.includes(w))||BANNED_EXACT.includes(plain))fail('BANNED_NAME','使用できない言葉が含まれているため、このニックネームは登録できません。別の名前にしてください。');return s}
export function replayRun(run,payload,now){keysOnly(payload,['runId','answers','completed','finalElapsed']);if(payload.runId!==run.id||payload.completed!==true||!Array.isArray(payload.answers)||payload.answers.length>500)fail('INVALID_HISTORY','回答履歴が正しくありません。');if(run.engineVersion!==ENGINE_VERSION)fail('ENGINE_VERSION',RELOAD_MESSAGE,409);if(now>run.expiresAt)fail('EXPIRED',LATE_MESSAGE,410);
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
export function memoryCache(){const store=new Map();return {get(key,now){const e=store.get(key);if(!e||e.expiresAt<=now){store.delete(key);return null}return e.value},put(key,value,ms,now){store.set(key,{value,expiresAt:now+ms});if(store.size>1000)for(const [k,e] of store)if(e.expiresAt<=now)store.delete(k)},remove(keys){for(const k of keys)store.delete(k)}}}
// Read path: ranking boards are cached for 15 s per difficulty × period (× period key); boards larger than this are not cached.
export const BOARD_TTL_MS=15000,AUTH_TTL_MS=60000,BOARD_CACHE_MAX_CHARS=90000;
// Storage and cryptography are injected: identical validation works with SQLite or Apps Script.
export class RankingService{
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
