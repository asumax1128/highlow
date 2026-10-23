export const EQUAL_RATE = .15;
export const DURATION = 30000, FEEDBACK_MS = 300;
const gcd=(a,b)=>b?gcd(b,a%b):a;
export function rational(n,d=1){if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||!d)throw Error('Invalid rational');if(d<0){n=-n;d=-d}const g=gcd(Math.abs(n),d);return {n:n/g,d:d/g,rad:1}}
export function radical(n,rad,d=1){while(true){let found=false;for(let k=2;k*k<=rad;k++)if(rad%(k*k)===0){n*=k;rad/=k*k;found=true;break}if(!found)break}return {...rational(n,d),rad}}
// All generated values are nonnegative rational multiples of square roots.
// Squaring preserves their order; BigInt cross products avoid floating point errors.
export function compare(a,b){const x=BigInt(a.n)**2n*BigInt(a.rad)*BigInt(b.d)**2n,y=BigInt(b.n)**2n*BigInt(b.rad)*BigInt(a.d)**2n;return x===y?'EQUAL':x>y?'LEFT':'RIGHT'}
const expr=(text,value,category)=>({text,value,category});
export const HARD_POOL=[
expr('sin 30°',rational(1,2),'三角関数'),expr('1/2',rational(1,2),'分数'),expr('cos 60°',rational(1,2),'三角関数'),expr('0.6',rational(3,5),'小数'),
expr('√50',radical(1,50),'平方根'),expr('7',rational(7),'整数'),expr('2⁵',rational(32),'指数'),expr('5²',rational(25),'指数'),expr('log₂ 8',rational(3),'対数'),expr('√9',rational(3),'平方根'),
expr('2/3',rational(2,3),'分数'),expr('0.67',rational(67,100),'小数'),expr('tan 45°',rational(1),'三角関数'),expr('sin 90°',rational(1),'三角関数'),expr('sin 60°',radical(1,3,2),'三角関数'),expr('cos 30°',radical(1,3,2),'三角関数'),
expr('√2',radical(1,2),'平方根'),expr('1.4',rational(7,5),'小数'),expr('|−8|',rational(8),'絶対値'),expr('log₃ 81',rational(4),'対数'),expr('3⁴',rational(81),'指数'),expr('√81',rational(9),'平方根'),expr('1 + 2 + ⋯ + 10',rational(55),'数列'),expr('5 × 11',rational(55),'数列'),expr('3/4',rational(3,4),'分数'),expr('0.75',rational(3,4),'小数'),expr('√12',radical(1,12),'平方根'),expr('2√3',radical(2,3),'平方根'),expr('2⁻²',rational(1,4),'指数'),expr('0.25',rational(1,4),'小数')];
export function seeded(seed=1){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export class Generator{
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
export class Game{
 constructor(difficulty,{clock=()=>performance.now(),rng=Math.random}={}){this.clock=clock;this.generator=new Generator(difficulty,rng);this.difficulty=difficulty;this.state='READY';this.remaining=DURATION;this.score=0;this.combo=0;this.maxCombo=0;this.correct=0;this.wrong=0;this.responseTotal=0;this.interrupted=false;this.history=[]}
 start(){this.state='COUNTDOWN';this.until=this.clock()+3000}
 tick(){let now=this.clock();if(this.state==='COUNTDOWN'&&now>=this.until)this.open(now);else if(this.state==='FEEDBACK'&&now>=this.until)this.open(now);else if(this.state==='PLAYING'&&now-this.started>=this.remaining){this.remaining=0;this.state='FINISHED'}return this.state}
 open(now){this.question=this.generator.next();this.started=now;this.state='PLAYING'}
 timeLeft(){return Math.max(0,this.remaining-(this.state==='PLAYING'?this.clock()-this.started:0))}
 answer(choice){if(this.state!=='PLAYING')return false;this.tick();if(this.state!=='PLAYING'||!['LEFT','RIGHT','EQUAL'].includes(choice)||(this.difficulty==='EASY'&&choice==='EQUAL'))return false;const elapsed=this.clock()-this.started;if(elapsed>=this.remaining){this.remaining=0;this.state='FINISHED';return false}this.remaining-=elapsed;this.responseTotal+=elapsed;this.isCorrect=choice===this.question.answer;if(this.isCorrect){this.correct++;this.combo++;this.maxCombo=Math.max(this.combo,this.maxCombo);this.delta=this.combo>=20?200:this.combo>=10?150:this.combo>=5?120:100}else{this.wrong++;this.combo=0;this.delta=-100}this.score=Math.max(0,this.score+this.delta);this.history.push({question:this.question,choice,elapsed,score:this.score});this.state='FEEDBACK';this.until=this.clock()+FEEDBACK_MS;return true}
 interrupt(){if(['COUNTDOWN','PLAYING','FEEDBACK'].includes(this.state)){this.remaining=this.timeLeft();this.interrupted=true;this.state='FINISHED'}}
 stats(){let total=this.correct+this.wrong;return {score:this.score,correct:this.correct,wrong:this.wrong,accuracy:total?this.correct/total*100:0,maxCombo:this.maxCombo,average:total?this.responseTotal/total:0}}
}
