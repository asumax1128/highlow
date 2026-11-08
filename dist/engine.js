export const EQUAL_RATE = .15;
export const DURATION = 30000;
// Single source of truth for the game/ranking protocol. Bump on any change that alters replay, timing or question order.
// The same value is used for cache-busting (?v=) in index.html and the module imports.
export const ENGINE_VERSION = 'high-low-0.2';
// Input lock after an answer (excluded from the 30 s): short after a correct answer, longer to read the correct relation after a miss.
export const FEEDBACK_CORRECT_MS = 180, FEEDBACK_WRONG_MS = 500;
export const feedbackMs = correct => correct ? FEEDBACK_CORRECT_MS : FEEDBACK_WRONG_MS;
// Countdown: first play 3×600 ms + GO 200 ms = 2.0 s; RETRY 3×300 ms + GO 200 ms = 1.1 s.
export const COUNTDOWNS = {first:{step:600,go:200}, retry:{step:300,go:200}};
export const countdownKind = kind => kind === 'retry' ? 'retry' : 'first';
export const countdownMs = kind => {const c = COUNTDOWNS[countdownKind(kind)]; return c.step*3 + c.go};
export function countdownLabel(kind, msLeft){const c = COUNTDOWNS[countdownKind(kind)], elapsed = c.step*3 + c.go - msLeft; return elapsed >= c.step*3 ? 'GO!' : String(3 - Math.floor(Math.max(0, elapsed)/c.step))}
// Answers faster than this are not humanly possible after reading a question; the client ignores them and the server rejects them.
export const MIN_ANSWER_MS = 150;
// Σ(answer elapsed) + (elapsed on the last question when time ran out) must equal 30 000 ms within this tolerance.
export const TOTAL_TOLERANCE_MS = 5;
// The shortest real time a completed run can take; client and server use this same function.
export function minimumWallMs(kind, history){return countdownMs(kind) + DURATION + history.reduce((sum, h) => sum + feedbackMs(h.correct), 0)}
const gcd=(a,b)=>b?gcd(b,a%b):a;
export function rational(n,d=1){if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||!d)throw Error('Invalid rational');if(d<0){n=-n;d=-d}const g=gcd(Math.abs(n),d);return {n:n/g,d:d/g,rad:1}}
export function radical(n,rad,d=1){while(true){let found=false;for(let k=2;k*k<=rad;k++)if(rad%(k*k)===0){n*=k;rad/=k*k;found=true;break}if(!found)break}return {...rational(n,d),rad}}
// All generated values are nonnegative rational multiples of square roots.
// Squaring preserves their order; BigInt cross products avoid floating point errors.
export function compare(a,b){const x=BigInt(a.n)**2n*BigInt(a.rad)*BigInt(b.d)**2n,y=BigInt(b.n)**2n*BigInt(b.rad)*BigInt(a.d)**2n;return x===y?'EQUAL':x>y?'LEFT':'RIGHT'}
const expr=(text,value,category)=>({text,value,category});
// Duplicate key for the recent-30 window: the same two expressions in either order count as one pair.
export const pairKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
export const HARD_POOL=[
expr('sin 30°',rational(1,2),'三角関数'),expr('1/2',rational(1,2),'分数'),expr('cos 60°',rational(1,2),'三角関数'),expr('0.6',rational(3,5),'小数'),
expr('√50',radical(1,50),'平方根'),expr('7',rational(7),'整数'),expr('2⁵',rational(32),'指数'),expr('5²',rational(25),'指数'),expr('log₂ 8',rational(3),'対数'),expr('√9',rational(3),'平方根'),
expr('2/3',rational(2,3),'分数'),expr('0.67',rational(67,100),'小数'),expr('tan 45°',rational(1),'三角関数'),expr('sin 90°',rational(1),'三角関数'),expr('sin 60°',radical(1,3,2),'三角関数'),expr('cos 30°',radical(1,3,2),'三角関数'),
expr('√2',radical(1,2),'平方根'),expr('1.4',rational(7,5),'小数'),expr('|−8|',rational(8),'絶対値'),expr('log₃ 81',rational(4),'対数'),expr('3⁴',rational(81),'指数'),expr('√81',rational(9),'平方根'),expr('1 + 2 + ⋯ + 10',rational(55),'数列'),expr('5 × 11',rational(55),'数列'),expr('3/4',rational(3,4),'分数'),expr('0.75',rational(3,4),'小数'),expr('√12',radical(1,12),'平方根'),expr('2√3',radical(2,3),'平方根'),expr('2⁻²',rational(1,4),'指数'),expr('0.25',rational(1,4),'小数'),
// Added for close comparisons (|a−b|/max ≤ 10%). None of these equals another pool value.
expr('0.87',rational(87,100),'小数'),expr('0.85',rational(17,20),'小数'),expr('√3',radical(1,3),'平方根'),expr('1.7',rational(17,10),'小数'),expr('√10',radical(1,10),'平方根'),expr('3.5',rational(7,2),'小数'),expr('3.4',rational(17,5),'小数'),expr('√1000',radical(1,1000),'平方根'),expr('√15',radical(1,15),'平方根'),expr('3³',rational(27),'指数'),expr('5/8',rational(5,8),'分数'),expr('0.48',rational(12,25),'小数'),expr('0.7',rational(7,10),'小数'),expr('√60',radical(1,60),'平方根'),expr('√80',radical(1,80),'平方根'),expr('√48',radical(1,48),'平方根'),expr('7 × 8',rational(56),'掛け算'),expr('8 × 10',rational(80),'掛け算'),expr('5 × 6',rational(30),'掛け算'),expr('0.95',rational(19,20),'小数')];
const near=(a,b)=>[HARD_POOL.find(e=>e.text===a),HARD_POOL.find(e=>e.text===b)];
// Curated pairs whose values differ by at most 10% (and are never equal). Orientation is chosen per question.
export const HARD_NEAR_PAIRS=[near('√50','7'),near('2/3','0.67'),near('√2','1.4'),near('sin 60°','0.87'),near('cos 30°','0.85'),near('√3','1.7'),near('log₂ 8','√10'),near('√10','3.4'),near('2√3','3.5'),near('√12','3.4'),near('2⁵','√1000'),near('log₃ 81','√15'),near('5²','3³'),near('0.6','5/8'),near('sin 30°','0.48'),near('2/3','0.7'),near('0.75','0.7'),near('|−8|','√60'),near('√81','√80'),near('7','√48'),near('1 + 2 + ⋯ + 10','7 × 8'),near('3⁴','8 × 10'),near('2⁵','5 × 6'),near('tan 45°','0.95'),near('cos 60°','0.48'),near('5 × 11','7 × 8')];
// Share of non-EQUAL HARD questions drawn from HARD_NEAR_PAIRS (tuned so that close comparisons are ~15–20% overall).
export const HARD_NEAR_RATE=.12;
export function seeded(seed=1){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export class Generator{
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
export class Game{
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
