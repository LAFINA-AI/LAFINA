import {db} from './database';
export interface SpeechEnginePreference {stt:'whisper'|'android';tts:'kokoro'|'android';voiceName:string|null;}
const defaults:SpeechEnginePreference={stt:'whisper',tts:'kokoro',voiceName:null};
const valid=(value:SpeechEnginePreference):boolean=>!!value&&['whisper','android'].includes(value.stt)&&['kokoro','android'].includes(value.tts)&&(value.voiceName===null||typeof value.voiceName==='string'&&value.voiceName.length>0&&value.voiceName.length<=512)&&(value.tts!=='android'||!!value.voiceName);
export const speechEngineStore={
  /** Reads account-local explicit choices, retaining Whisper/Kokoro defaults. */
  read:(userId?:string):SpeechEnginePreference=>{
    if(!userId)return {...defaults};
    const raw=db.executeSync('SELECT value FROM local_settings WHERE user_id=? AND key=?',[userId,'speech_engines_v1']).rows[0]?.value;
    if(raw==null)return {...defaults};const value=JSON.parse(String(raw)) as SpeechEnginePreference;
    if(!valid(value))throw new Error('Speech settings unavailable. Choose engines again.');return value;
  },
  /** Saves only an explicit valid choice for the active local account. */
  save:(userId:string,value:SpeechEnginePreference):void=>{
    if(!valid(value))throw new Error('Select a valid speech engine and installed voice.');
    db.transactionSync(tx=>{if(tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('Speech settings account changed.');tx.executeSync('INSERT OR REPLACE INTO local_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)',[userId,'speech_engines_v1',JSON.stringify(value),new Date().toISOString()]);});
  },
};
