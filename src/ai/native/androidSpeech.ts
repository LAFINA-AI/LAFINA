import {NativeModules} from 'react-native';
export interface AndroidOfflineVoice {name:string;locale:string;networkRequired:false;installed:true;}
export interface AndroidSpeechCapabilities {onDeviceRecognition:boolean;voices:AndroidOfflineVoice[];}
interface SpeechModule {getCapabilities:()=>Promise<unknown>;speak:(request:{requestId:string;text:string;voiceName:string})=>Promise<boolean>;stopSpeaking:(requestId:string)=>Promise<boolean>;}
const native=():SpeechModule|null=>NativeModules.LafinaAndroidSpeech??null;
const bounded=<T>(work:Promise<T>,ms:number,onTimeout:()=>void=()=>{}):Promise<T>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{onTimeout();reject(new Error('Android speech timed out.'));},ms);work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
let sequence=0,active:{requestId:string;cancel:()=>void}|null=null;
/** Reads installed English offline voice metadata; unavailable native support remains explicit. */
export const readAndroidSpeechCapabilities=async():Promise<AndroidSpeechCapabilities>=>{
  try{const module=native();if(!module?.getCapabilities)return {onDeviceRecognition:false,voices:[]};const raw=await bounded(module.getCapabilities(),12000) as {onDeviceRecognition?:unknown;voices?:unknown};
    const voices=Array.isArray(raw?.voices)?raw.voices.filter((voice:unknown):voice is AndroidOfflineVoice=>{if(!voice||typeof voice!=='object')return false;const value=voice as Record<string,unknown>;return typeof value.name==='string'&&value.name.length>0&&value.name.length<=512&&typeof value.locale==='string'&&/^en(?:-|$)/i.test(value.locale)&&value.networkRequired===false&&value.installed===true;}).slice(0,200):[];
    return {onDeviceRecognition:raw?.onDeviceRecognition===true,voices};
  }catch{return {onDeviceRecognition:false,voices:[]};}
};
/** Starts one owned optional utterance; never falls back to another voice or engine. */
export const startAndroidSpeechPlayback=(text:string,voiceName:string):{requestId:string;result:Promise<void>}=>{
  const module=native();if(!module?.speak||!module.stopSpeaking)throw new Error('Android offline speech unavailable. Keep text or select Kokoro.');
  if(active)throw new Error('Android speech is already playing.');if(!text.trim()||text.length>2000||!voiceName||voiceName.length>512)throw new Error('Invalid Android speech request.');
  const requestId=`android-tts-${Date.now()}-${++sequence}`;
  let cancel!:()=>void;const cancelled=new Promise<never>((_,reject)=>{cancel=()=>reject(new Error('Android speech stopped.'));});active={requestId,cancel};
  const stop=()=>{try{void module.stopSpeaking(requestId).catch(()=>{});}catch{/* native best effort */}};
  let work:Promise<boolean>;try{work=module.speak({requestId,text,voiceName});}catch(error){active=null;throw error;}
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
