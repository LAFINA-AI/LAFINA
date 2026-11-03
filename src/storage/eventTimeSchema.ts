import type {DatabaseTransaction} from './database';
/** Adds nullable timezone metadata; legacy events keep their original wall-time meaning. */
export const initializeEventTimeSchema=(tx:DatabaseTransaction):void=>{
 const columns=new Set((tx.executeSync('PRAGMA table_info(events)').rows as Array<{name:string}>).map(row=>row.name));
 for(const name of ['end_date','time_zone','start_at','end_at','start_fold','end_fold'])if(!columns.has(name))tx.executeSync(`ALTER TABLE events ADD COLUMN ${name} TEXT`);
 tx.executeSync('CREATE INDEX IF NOT EXISTS idx_events_owner_span ON events(user_id,date,end_date)');
};
