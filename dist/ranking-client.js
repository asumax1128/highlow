export const NETWORK_ERROR='通信できませんでした。';
const TIMEOUT_ERROR='通信がタイムアウトしました。再試行してください。';
const apiError=(message,code)=>Object.assign(Error(message),{code});
export class RankingClient{
 constructor({endpoint='/api/ranking',gas=false,fetcher=globalThis.fetch?.bind(globalThis),storage,timeout=gas?15000:5000,startTimeout=5000}={}){this.endpoint=endpoint;this.gas=gas;this.fetcher=fetcher;this.storage=storage;this.timeout=timeout;this.startTimeout=startTimeout;this.profile=null;this.token=null;try{this.storage??=globalThis.localStorage;if(gas)this.token=this.storage.getItem('high-low:ranking-token:v1')}catch{}}
 get available(){return !!this.fetcher&&/^https?:$/.test(globalThis.location?.protocol||'http:')}
 async call(action,data={},{timeout=this.timeout}={}){if(!this.available)throw apiError('オンラインランキングはWeb配信版で利用できます。','OFFLINE');const controller=new AbortController();let timer;try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(apiError(TIMEOUT_ERROR,'TIMEOUT'))},timeout)});const operation=(async()=>{let response;try{response=await this.fetcher(this.endpoint,{method:'POST',credentials:this.gas?'omit':'same-origin',headers:{'content-type':this.gas?'text/plain;charset=utf-8':'application/json'},body:JSON.stringify({action,data,...(this.gas?{token:this.token}: {})}),signal:controller.signal})}catch(e){if(e?.name==='AbortError')throw apiError(TIMEOUT_ERROR,'TIMEOUT');throw apiError(NETWORK_ERROR,'NETWORK')}let value;try{value=await response.json()}catch{throw apiError('ランキングAPIの応答を確認できません。','BAD_RESPONSE')}if(!response.ok||value.error){if(value.error?.code==='UNAUTHORIZED'){this.profile=null;this.token=null;try{this.storage?.removeItem('high-low:ranking-token:v1')}catch{}}throw apiError(value.error?.message||'ランキングの通信に失敗しました。',value.error?.code||'HTTP_'+response.status);}if(value.token){this.token=value.token;try{this.storage.setItem('high-low:ranking-token:v1',value.token)}catch{throw apiError('プレイヤー識別情報を保存できません。ブラウザの保存設定をご確認ください。','STORAGE')}}return value})();return await Promise.race([operation,deadline])}catch(e){if(e?.name==='AbortError')throw apiError(TIMEOUT_ERROR,'TIMEOUT');throw e}finally{clearTimeout(timer)}}
 async identity(){if(this.profile)return this.profile;if(!this.identityRequest)this.identityRequest=this.call('profile').then(p=>this.profile=p).finally(()=>{this.identityRequest=null});return this.identityRequest}
 async nickname(name){this.profile=await this.call('profile',{nickname:name});return this.profile}
 // The whole start (including a still-pending identity) is bounded by startTimeout.
 async start(difficulty){let timer;try{return await Promise.race([(async()=>{await this.identity();return this.call('start',{difficulty},{timeout:this.startTimeout})})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(apiError(TIMEOUT_ERROR,'TIMEOUT')),this.startTimeout)})])}finally{clearTimeout(timer)}}
 async ranking(difficulty,period){await this.identity();return this.call('ranking',{difficulty,period})}
 submit(runId,game){return this.submitAnswers(runId,game.history.map(a=>({questionId:a.question.id,choice:a.choice,elapsed:a.elapsed})))}
 submitAnswers(runId,answers){return this.call('submit',{runId,completed:true,answers})}
}
// Server answers that will never succeed on retry (the run is gone, expired, timed out or already different).
const FINAL_CODES=new Set(['TIMING_MISMATCH','EXPIRED','RUN_NOT_FOUND','DUPLICATE','INVALID_HISTORY','INVALID_ANSWER','TIME_LIMIT','TOO_EARLY','ENGINE_VERSION','INVALID_REQUEST','OFFLINE']);
// Submissions live here, independent of whichever screen is shown, so a failed run can be resent from any screen.
// status: sending | failed (retryable) | rejected (server refused; can only be dismissed) | done
export class SubmissionQueue{
 constructor(client){this.client=client;this.entries=[];this.listeners=new Set()}
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 notify(entry){for(const fn of this.listeners){try{fn(entry)}catch{}}}
 get(runId){return this.entries.find(e=>e.runId===runId)||null}
 pending(){return this.entries.filter(e=>e.status==='failed'||e.status==='rejected'||e.status==='sending')}
 add({runId,difficulty,score,answers}){let entry=this.get(runId);if(!entry){entry={runId,difficulty,score,answers,status:'failed',message:'',response:null,attempts:0};this.entries.push(entry)}return this.send(entry)}
 async send(entry){if(entry.status==='sending')return entry.promise;if(entry.status==='done')return entry;entry.status='sending';entry.message='';entry.attempts++;this.notify(entry);
  entry.promise=(async()=>{try{entry.response=await this.client.submitAnswers(entry.runId,entry.answers);entry.status='done';this.entries=this.entries.filter(e=>e!==entry)}catch(e){entry.status=FINAL_CODES.has(e?.code)?'rejected':'failed';entry.message=e?.message||NETWORK_ERROR}this.notify(entry);return entry})();return entry.promise}
 retry(runId){const entry=this.get(runId);return entry?this.send(entry):Promise.resolve(null)}
 async retryAll(){for(const entry of [...this.entries])if(entry.status==='failed')await this.send(entry)}
 dismiss(runId){this.entries=this.entries.filter(e=>e.runId!==runId);this.notify(null)}
}
