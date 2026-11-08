const KEY='high-low:v1';
const BACKUP_KEY='high-low:v1:corrupt-backup';
const nonnegative=v=>Number.isFinite(v)&&v>=0?v:0;
function normalize(d){const records={};for(const key of ['EASY','NORMAL','HARD']){const r=d.records[key];if(r&&typeof r==='object')records[key]={best:nonnegative(r.best),plays:Math.floor(nonnegative(r.plays)),maxCombo:Math.floor(nonnegative(r.maxCombo)),lastPlayed:typeof r.lastPlayed==='string'?r.lastPlayed:null}}return {version:1,records}}
// Distinguishes "no data yet" from "could not read" so that a failed read never overwrites saved records.
// status: ok | empty | error (storage threw) | corrupt (unparseable or wrong shape) | future (newer, unknown version)
export function read(storage){let raw;try{storage??=globalThis.localStorage;raw=storage.getItem(KEY)}catch{return {status:'error',data:{version:1,records:{}}}}
 if(raw===null||raw===undefined)return {status:'empty',data:{version:1,records:{}}};
 let d;try{d=JSON.parse(raw)}catch{return {status:'corrupt',raw,data:{version:1,records:{}}}}
 if(d&&typeof d==='object'&&typeof d.version==='number'&&d.version>1)return {status:'future',data:{version:1,records:{}}};
 if(d?.version===1&&d.records&&typeof d.records==='object'&&!Array.isArray(d.records))return {status:'ok',data:normalize(d)};
 return {status:'corrupt',raw,data:{version:1,records:{}}}}
export function load(storage){return read(storage).data}
export function record(difficulty,game,storage){const state=read(storage);
 // Never write over data we could not read, or over data written by a newer version of the game.
 if(state.status==='error')return {isBest:false,saved:false,reason:'read-error'};
 if(state.status==='future')return {isBest:false,saved:false,reason:'future-version'};
 const data=state.data,old=data.records[difficulty]||{};const best=old.best||0;const isBest=game.score>best;data.records[difficulty]={best:Math.max(best,game.score),plays:(old.plays||0)+1,maxCombo:Math.max(old.maxCombo||0,game.maxCombo),lastPlayed:new Date().toISOString()};
 try{storage??=globalThis.localStorage;if(state.status==='corrupt'&&typeof state.raw==='string'){try{storage.setItem(BACKUP_KEY,state.raw)}catch{}}storage.setItem(KEY,JSON.stringify(data));return {isBest,saved:true}}catch{return {isBest,saved:false,reason:'write-error'}}}
// Per-viewer sound preference. Failures fall back to sound on and are never fatal.
const SOUND_KEY='high-low:sound:v1';
export function loadSound(storage){try{storage??=globalThis.localStorage;return storage.getItem(SOUND_KEY)!=='off'}catch{return true}}
export function saveSound(on,storage){try{storage??=globalThis.localStorage;storage.setItem(SOUND_KEY,on?'on':'off');return true}catch{return false}}
