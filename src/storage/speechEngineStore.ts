import {db} from './database';
export interface SpeechEnginePreference {stt:'whisper'|'android';tts:'kokoro'|'android';voiceName:string|null;version?:2;providerPackage?:string|null;rate?:number;pitch?:number;}
export interface ResolvedSpeechEnginePreference extends SpeechEnginePreference {version:2;providerPackage:string|null;rate:number;pitch:number;}
const defaults:ResolvedSpeechEnginePreference={version:2,stt:'whisper',tts:'kokoro',voiceName:null,providerPackage:null,rate:1,pitch:1};
const resolve=(input:unknown):ResolvedSpeechEnginePreference=>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid speech settings.');
 const value=input as Record<string,unknown>;
 const rate=value.rate===undefined?1:value.rate,pitch=value.pitch===undefined?1:value.pitch,provider=value.providerPackage??null;
 if((value.version!==undefined&&value.version!==2)||!['whisper','android'].includes(String(value.stt))||!['kokoro','android'].includes(String(value.tts))||(value.voiceName!==null&&(typeof value.voiceName!=='string'||!value.voiceName||value.voiceName.length>512))||(value.tts==='android'&&!value.voiceName)||(provider!==null&&(typeof provider!=='string'||provider.length>200||!/^([a-zA-Z0-9_]+\.)+[a-zA-Z0-9_]+$/.test(provider)))||typeof rate!=='number'||!Number.isFinite(rate)||rate<0.5||rate>2||typeof pitch!=='number'||!Number.isFinite(pitch)||pitch<0.5||pitch>2)throw new Error('Select a valid provider, installed English voice and rate/pitch from 0.5 to 2.0.');
 return {version:2,stt:value.stt as SpeechEnginePreference['stt'],tts:value.tts as SpeechEnginePreference['tts'],voiceName:value.voiceName as string|null,providerPackage:provider as string|null,rate,pitch};
};
export const speechEngineStore={
 /** Reads versioned account-local choices; old saved choices gain neutral customization in memory. */
 read:(userId?:string):ResolvedSpeechEnginePreference=>{
  if(!userId)return {...defaults};
  const raw=db.executeSync('SELECT value FROM local_settings WHERE user_id=? AND key=?',[userId,'speech_engines_v1']).rows[0]?.value;
  return raw==null?{...defaults}:resolve(JSON.parse(String(raw)) as unknown);
 },
 /** Saves one explicit validated choice transactionally for the active local account. */
 save:(userId:string,input:SpeechEnginePreference):void=>{
  const value=resolve(input);
  db.transactionSync(tx=>{if(tx.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('Speech settings account changed.');tx.executeSync('INSERT OR REPLACE INTO local_settings(user_id,key,value,updated_at) VALUES(?,?,?,?)',[userId,'speech_engines_v1',JSON.stringify(value),new Date().toISOString()]);});
 },
};
