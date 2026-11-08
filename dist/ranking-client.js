import {ENGINE_VERSION} from './engine.js?v=0.2.2';
export const NETWORK_ERROR='通信できませんでした。';
export const LATE_ERROR='時間が経ったため登録できません（試合の終了から送信までに時間がかかりすぎました）。';
export const RELOAD_ERROR='ゲームが更新されました。ページを再読み込みしてください。';
const TIMEOUT_ERROR='通信がタイムアウトしました。再試行してください。';
const apiError=(message,code)=>Object.assign(Error(message),{code});
export class RankingClient{
 constructor({endpoint='/api/ranking',gas=false,fetcher=globalThis.fetch?.bind(globalThis),storage,timeout=gas?15000:5000,startTimeout=5000}={}){this.endpoint=endpoint;this.gas=gas;this.fetcher=fetcher;this.storage=storage;this.timeout=timeout;this.startTimeout=startTimeout;this.profile=null;this.token=null;try{this.storage??=globalThis.localStorage;if(gas)this.token=this.storage.getItem('high-low:ranking-token:v1')}catch{}}
 get available(){return !!this.fetcher&&/^https?:$/.test(globalThis.location?.protocol||'http:')}
 // token: send this token instead of the stored one (used to verify a transfer code). An UNAUTHORIZED answer then leaves the stored identity untouched.
 async call(action,data={},{timeout=this.timeout,token}={}){const override=token!==undefined;if(!this.available)throw apiError('オンラインランキングはWeb配信版で利用できます。','OFFLINE');const controller=new AbortController();let timer;try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(apiError(TIMEOUT_ERROR,'TIMEOUT'))},timeout)});const operation=(async()=>{let response;try{response=await this.fetcher(this.endpoint,{method:'POST',credentials:this.gas?'omit':'same-origin',headers:{'content-type':this.gas?'text/plain;charset=utf-8':'application/json'},body:JSON.stringify({action,data,...(this.gas?{token:override?token:this.token}: {})}),signal:controller.signal})}catch(e){if(e?.name==='AbortError')throw apiError(TIMEOUT_ERROR,'TIMEOUT');throw apiError(NETWORK_ERROR,'NETWORK')}let value;try{value=await response.json()}catch{throw apiError('ランキングAPIの応答を確認できません。','BAD_RESPONSE')}if(!response.ok||value.error){if(value.error?.code==='UNAUTHORIZED'&&!override){this.profile=null;this.token=null;try{this.storage?.removeItem('high-low:ranking-token:v1')}catch{}}throw apiError(value.error?.message||'ランキングの通信に失敗しました。',value.error?.code||'HTTP_'+response.status);}if(value.token){this.token=value.token;try{this.storage.setItem('high-low:ranking-token:v1',value.token)}catch{throw apiError('プレイヤー識別情報を保存できません。ブラウザの保存設定をご確認ください。','STORAGE')}}return value})();return await Promise.race([operation,deadline])}catch(e){if(e?.name==='AbortError')throw apiError(TIMEOUT_ERROR,'TIMEOUT');throw e}finally{clearTimeout(timer)}}
 async identity(){if(this.profile)return this.profile;if(!this.identityRequest)this.identityRequest=this.call('profile').then(p=>this.profile=p).finally(()=>{this.identityRequest=null});return this.identityRequest}
 async nickname(name){this.profile=await this.call('profile',{nickname:name});return this.profile}
 // Hide the name on public boards (rank and score stay visible).
 async setHidden(hidden){await this.identity();this.profile=await this.call('profile',{hidden:!!hidden});return this.profile}
 // Transfer code = the player token (Apps Script mode only; the Node version keeps it in an HttpOnly cookie).
 get transferSupported(){return this.gas}
 transferCode(){return this.gas?this.token:null}
 static normalizeCode(code){return String(code??'').replace(/\s+/g,'').trim()}
 // The server verifies the code; only a verified code replaces the identity stored in this browser.
 async restore(code){if(!this.gas)throw apiError('この環境では引き継ぎコードを利用できません。','UNSUPPORTED');const value=RankingClient.normalizeCode(code);if(!value||value.length>200)throw apiError('引き継ぎコードを入力してください。','INVALID_CODE');let profile;try{profile=await this.call('profile',{},{token:value})}catch(e){if(e?.code==='UNAUTHORIZED')throw apiError('引き継ぎコードが正しくありません。もう一度確認してください。','INVALID_CODE');throw e}if(profile.token!==value)throw apiError('引き継ぎコードを確認できませんでした。','INVALID_CODE');this.profile=profile;return profile}
 // The whole start (including a still-pending identity) is bounded by startTimeout.
 // Sends this page's engine version and countdown kind; the server refuses a mismatched version (code ENGINE_VERSION).
 async start(difficulty,countdown='first'){let timer;try{return await Promise.race([(async()=>{await this.identity();return this.call('start',{difficulty,engineVersion:ENGINE_VERSION,countdown},{timeout:this.startTimeout})})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(apiError(TIMEOUT_ERROR,'TIMEOUT')),this.startTimeout)})])}finally{clearTimeout(timer)}}
 async ranking(difficulty,period){await this.identity();return this.call('ranking',{difficulty,period})}
 submit(runId,game){return this.submitAnswers(runId,game.history.map(a=>({questionId:a.question.id,choice:a.choice,elapsed:a.elapsed})),game.finalElapsed)}
 // finalElapsed: time the last (unanswered) question was on screen when time ran out.
 submitAnswers(runId,answers,finalElapsed){return this.call('submit',{runId,completed:true,answers,...(Number.isFinite(finalElapsed)?{finalElapsed}:{})})}
}
// Server answers that will never succeed on retry (the run is gone, expired, timed out or already different).
const FINAL_CODES=new Set(['TIMING_MISMATCH','EXPIRED','RUN_NOT_FOUND','DUPLICATE','INVALID_HISTORY','INVALID_ANSWER','TIME_LIMIT','TOO_EARLY','ENGINE_VERSION','INVALID_REQUEST','OFFLINE','TOO_FAST','INCOMPLETE_HISTORY']);
// The run's acceptance window has passed: explain it plainly instead of the raw server message.
const LATE_CODES=new Set(['EXPIRED','TIMING_MISMATCH']);
// Submissions live here, independent of whichever screen is shown, so a failed run can be resent from any screen.
// status: sending | retrying (automatic resend scheduled) | failed (retryable by hand) | rejected (server refused; can only be dismissed) | done
// delays: automatic resends after a retryable failure, e.g. [1000,3000,3000] = up to 3 resends 1 s / 3 s apart. Default: none.
export class SubmissionQueue{
 constructor(client,{delays=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.client=client;this.delays=delays;this.wait=wait;this.entries=[];this.listeners=new Set()}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 notify(entry){for(const fn of this.listeners){try{fn(entry)}catch{}}}
 get(runId){return this.entries.find(e=>e.runId===runId)||null}
 pending(){return this.entries.filter(e=>e.status!=='done')}
 add({runId,difficulty,score,answers,finalElapsed}){let entry=this.get(runId);if(!entry){entry={runId,difficulty,score,answers,finalElapsed,status:'failed',message:'',response:null,attempts:0};this.entries.push(entry)}return this.send(entry)}
 async send(entry){if(entry.status==='sending'||entry.status==='retrying')return entry.promise;if(entry.status==='done')return entry;
  entry.promise=(async()=>{for(let attempt=0;;attempt++){entry.status='sending';entry.message='';entry.attempts++;this.notify(entry);
   try{entry.response=await this.client.submitAnswers(entry.runId,entry.answers,entry.finalElapsed);entry.status='done';this.entries=this.entries.filter(e=>e!==entry);this.notify(entry);return entry}
   catch(e){const code=e?.code;
    if(LATE_CODES.has(code)){entry.status='rejected';entry.message=LATE_ERROR}
    else if(FINAL_CODES.has(code)){entry.status='rejected';entry.message=code==='ENGINE_VERSION'?RELOAD_ERROR:e?.message||NETWORK_ERROR}
    else if(attempt<this.delays.length&&this.entries.includes(entry)){const delay=this.delays[attempt];entry.status='retrying';entry.message=`${e?.message||NETWORK_ERROR} ${delay/1000}秒後に自動で再送します（${attempt+1}/${this.delays.length}）`;this.notify(entry);await this.wait(delay);if(!this.entries.includes(entry))return entry;continue}
    else{entry.status='failed';entry.message=e?.message||NETWORK_ERROR}
    this.notify(entry);return entry}}})();
  return entry.promise}
 retry(runId){const entry=this.get(runId);return entry?this.send(entry):Promise.resolve(null)}
 async retryAll(){for(const entry of [...this.entries])if(entry.status==='failed')await this.send(entry)}
 dismiss(runId){this.entries=this.entries.filter(e=>e.runId!==runId);this.notify(null)}
}
