import {NativeModules} from 'react-native';
export interface SpeechDiagnostics {
 available:boolean;sdk:number|null;onDeviceRecognition:boolean;recognitionState:string;
 captureActive:boolean;speechActive:boolean;
 metrics:{ttsInitializationMs:number|null;recognitionSupportMs:number|null;captureReadyMs:number|null;captureDurationMs:number|null;speechStartMs:number|null;speechDurationMs:number|null;};
}
const empty=():SpeechDiagnostics=>({available:false,sdk:null,onDeviceRecognition:false,recognitionState:'unavailable',captureActive:false,speechActive:false,metrics:{ttsInitializationMs:null,recognitionSupportMs:null,captureReadyMs:null,captureDurationMs:null,speechStartMs:null,speechDurationMs:null}});
/** Reads process-local timing metadata only; rejects raw payload fields and never starts audio or persists diagnostics. */
export const readAndroidSpeechDiagnostics=async():Promise<SpeechDiagnostics>=>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const module=NativeModules.LafinaAndroidSpeech as {getDiagnostics?:()=>Promise<unknown>}|undefined;if(!module?.getDiagnostics)return empty();
  const raw=await Promise.race([module.getDiagnostics(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagnostics timeout')),2000);})]);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return empty();const value=raw as Record<string,unknown>;
  if(typeof value.sdk!=='number'||!Number.isInteger(value.sdk)||value.sdk<24||value.sdk>100)return empty();
  const metrics=value.metrics&&typeof value.metrics==='object'?value.metrics as Record<string,unknown>:{};
  const metric=(key:string):number|null=>typeof metrics[key]==='number'&&Number.isFinite(metrics[key])&&Number(metrics[key])>=0&&Number(metrics[key])<=120000?Number(metrics[key]):null;
  return {available:true,sdk:value.sdk,onDeviceRecognition:value.onDeviceRecognition===true,recognitionState:['installed','missing','unknown','unavailable','busy','permission_required'].includes(String(value.recognitionState))?String(value.recognitionState):'unknown',captureActive:value.captureActive===true,speechActive:value.speechActive===true,metrics:{ttsInitializationMs:metric('ttsInitializationMs'),recognitionSupportMs:metric('recognitionSupportMs'),captureReadyMs:metric('captureReadyMs'),captureDurationMs:metric('captureDurationMs'),speechStartMs:metric('speechStartMs'),speechDurationMs:metric('speechDurationMs')}};
 }catch{return empty();}finally{if(timer)clearTimeout(timer);}
};
