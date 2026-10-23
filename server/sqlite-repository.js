import {DatabaseSync} from 'node:sqlite';
const TABLES=['players','runs','bests','limits'];
export class SQLiteRepository{
 constructor(path){this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS hl_meta(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO hl_meta VALUES (1); CREATE TABLE IF NOT EXISTS hl_entries (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));');this.read=this.db.prepare('SELECT value FROM hl_entries WHERE kind=? AND id=?');this.write=this.db.prepare('INSERT INTO hl_entries(kind,id,value) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value');this.scan=this.db.prepare('SELECT value FROM hl_entries WHERE kind=?')}
 table(t){if(!TABLES.includes(t))throw Error('Invalid table')}
 get(t,id){this.table(t);const r=this.read.get(t,id);return r?JSON.parse(r.value):null}
 put(t,id,v){this.table(t);this.write.run(t,id,JSON.stringify(v))}
 list(t){this.table(t);return this.scan.all(t).map(r=>JSON.parse(r.value))}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
 prune(now){this.db.prepare("DELETE FROM hl_entries WHERE kind IN ('runs','limits') AND json_extract(value,'$.expiresAt') < ?").run(now-86400000)}
 close(){this.db.close()}
}
