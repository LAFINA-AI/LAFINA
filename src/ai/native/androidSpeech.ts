import {NativeModules} from 'react-native';
export interface AndroidOfflineVoice {name:string;locale:string;networkRequired:false;installed:true;}
export interface AndroidSpeechProvider {packageName:string;label:string;}
export type AndroidRecognitionState='installed'|'missing'|'unknown'|'unavailable'|'busy'|'permission_required';
export interface AndroidSpeechCapabilities {recognitionState:AndroidRecognitionState;busy:boolean;onDeviceRecognition:boolean;voices:AndroidOfflineVoice[];providerPackage:string|null;providers:AndroidSpeechProvider[];}
export interface AndroidSpeechPlaybackOptions {providerPackage?:string|null;rate?:number;pitch?:number;}
interface SpeechModule {getCapabilities:(providerPackage:string|null)=>Promise<unknown>;speak:(request:{requestId:string;text:string;voiceName:string;providerPackage:string|null;rate:number;pitch:number})=>Promise<boolean>;stopSpeaking:(requestId:string)=>Promise<boolean>;}
const native=():SpeechModule|null=>NativeModules.LafinaAndroidSpeech??null;
const bounded=<T>(work:Promise<T>,ms:number,onTimeout:()=>void=()=>{}):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{onTimeout();reject(new Error('Android speech timed out.'));},ms);work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
const pendingCapabilities=new Map<string,Promise<AndroidSpeechCapabilities>>();
let sequence=0,active:{requestId:string;cancel:()=>void}|null=null;
/** Reads installed English offline voice metadata; unavailable native support remains explicit. */
const queryAndroidSpeechCapabilities=async(providerPackage:string|null=null):Promise<AndroidSpeechCapabilities>=>{
  try{const module=native();if(!module?.getCapabilities)return {onDeviceRecognition:false,voices:[],providerPackage:null,providers:[],recognitionState:'unavailable',busy:false};const raw=await bounded(module.getCapabilities(providerPackage),12000) as {onDeviceRecognition?:unknown;voices?:unknown;providerPackage?:unknown;providers?:unknown;recognitionState?:unknown;busy?:unknown};
    const voices=Array.isArray(raw?.voices)?raw.voices.filter((voice:unknown):voice is AndroidOfflineVoice=>{if(!voice||typeof voice!=='object')return false;const value=voice as Record<string,unknown>;return typeof value.name==='string'&&value.name.length>0&&value.name.length<=512&&typeof value.locale==='string'&&/^en(?:-|$)/i.test(value.locale)&&value.networkRequired===false&&value.installed===true;}).slice(0,200):[];
    const reported=typeof raw?.providerPackage==='string'?raw.providerPackage:null;
    const providers=Array.isArray(raw?.providers)?raw.providers.filter((entry:unknown):entry is AndroidSpeechProvider=>{if(!entry||typeof entry!=='object')return false;const row=entry as Record<string,unknown>;return typeof row.packageName==='string'&&row.packageName.length<=200&&/^([a-zA-Z0-9_]+\.)+[a-zA-Z0-9_]+$/.test(row.packageName)&&typeof row.label==='string'&&row.label.length<=200;}).slice(0,32):[];
    return {recognitionState:['installed','missing','unknown','unavailable','busy','permission_required'].includes(String(raw?.recognitionState))?raw.recognitionState as AndroidRecognitionState:raw?.onDeviceRecognition===true?'unknown':'unavailable',busy:raw?.busy===true,onDeviceRecognition:raw?.onDeviceRecognition===true,voices:providerPackage&&reported!==providerPackage?[]:voices,providerPackage:reported,providers};
  }catch{return {onDeviceRecognition:false,voices:[],providerPackage:null,providers:[],recognitionState:'unavailable',busy:false};}
};
/** Coalesces concurrent checks for one provider; completed or timed-out checks never become a stale cache. */
export const readAndroidSpeechCapabilities=(providerPackage:string|null=null):Promise<AndroidSpeechCapabilities>=>{
 const key=providerPackage??'';const pending=pendingCapabilities.get(key);if(pending)return pending;
 if(pendingCapabilities.size>=4)return Promise.resolve({onDeviceRecognition:false,voices:[],providerPackage:null,providers:[],recognitionState:'busy',busy:true});
 const work=queryAndroidSpeechCapabilities(providerPackage).finally(()=>{if(pendingCapabilities.get(key)===work)pendingCapabilities.delete(key);});pendingCapabilities.set(key,work);return work;
};
/** Starts one owned optional utterance; never falls back to another voice or engine. */
export const startAndroidSpeechPlayback=(text:string,voiceName:string,options:AndroidSpeechPlaybackOptions={}):{requestId:string;result:Promise<void>}=>{
  const module=native();if(!module?.speak||!module.stopSpeaking)throw new Error('Android offline speech unavailable. Keep text or select Kokoro.');
  if(active)throw new Error('Android speech is already playing.');if(!text.trim()||text.length>2000||!voiceName||voiceName.length>512)throw new Error('Invalid Android speech request.');
  const providerPackage=options.providerPackage??null,rate=options.rate??1,pitch=options.pitch??1;
  if(!Number.isFinite(rate)||rate<0.5||rate>2||!Number.isFinite(pitch)||pitch<0.5||pitch>2||(providerPackage!==null&&(providerPackage.length>200||!/^([a-zA-Z0-9_]+\.)+[a-zA-Z0-9_]+$/.test(providerPackage))))throw new Error('Invalid Android speech customization.');
  const requestId=`android-tts-${Date.now()}-${++sequence}`;
  let cancel!:()=>void;const cancelled=new Promise<never>((_,reject)=>{cancel=()=>reject(new Error('Android speech stopped.'));});active={requestId,cancel};
  const stop=()=>{try{void module.stopSpeaking(requestId).catch(()=>{});}catch{/* native best effort */}};
  let work:Promise<boolean>;try{work=module.speak({requestId,text,voiceName,providerPackage,rate,pitch});}catch(error){active=null;throw error;}
  let timer:ReturnType<typeof setTimeout>|null=null;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{stop();reject(new Error('Android speech timed out.'));},75000);});
  const result=Promise.race([work,timeout,cancelled]).then(ok=>{if(!ok)throw new Error('Android offline voice could not speak. Keep text or select Kokoro.');}).finally(()=>{if(timer)clearTimeout(timer);if(active?.requestId===requestId)active=null;});
  return {requestId,result};
};
/** Stops only the matching utterance, including a native promise that never settles. */
export const stopAndroidSpeechPlayback=async(requestId:string):Promise<void>=>{
  if(active?.requestId!==requestId)return;active.cancel();active=null;
  try{await bounded(native()?.stopSpeaking(requestId)??Promise.resolve(false),2000);}catch{/* cancellation already settled locally */}
};
