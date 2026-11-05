import {useCallback,useEffect,useRef} from 'react';
import {Alert} from 'react-native';

export type DraftLeaveGuard=(proceed:()=>void)=>void;
export interface SpeechDraftRequest {id:string;userId:string;text:string;onHandled:(accepted:boolean)=>void;}
/** What the replace prompt says; the default describes a speech draft, which never sends. */
export interface ReplaceDraftCopy {title:string;message:string;}
const SPEECH_REPLACE_COPY:ReplaceDraftCopy={title:'Replace Chat draft?',message:'Keep your current text, or replace it with the speech draft. Nothing will be sent.'};

/** Keeps transient text unless an explicit, still-current discard/replacement decision is accepted. */
export const useDraftProtection=(owner:string,text:string,reviewPending:boolean,onDiscard:()=>void,onReplace:(text:string)=>void):{
  requestLeave:DraftLeaveGuard;acceptText:(next:string,done:(accepted:boolean)=>void,copy?:ReplaceDraftCopy)=>void;hasDraft:()=>boolean;
}=>{
  const state=useRef({owner,text,reviewPending,onDiscard,onReplace,version:0,alive:true});
  if(owner!==state.current.owner || text!==state.current.text || reviewPending!==state.current.reviewPending) state.current.version+=1;
  Object.assign(state.current,{owner,text,reviewPending,onDiscard,onReplace});
  useEffect(()=>{const current=state.current;current.alive=true;return ()=>{current.alive=false;current.version+=1;};},[]);
  const hasDraft=useCallback(()=>!!state.current.text.trim() || state.current.reviewPending,[]);
  const requestLeave=useCallback((proceed:()=>void):void=>{
    if(!state.current.alive) return;
    if(!state.current.text.trim() && !state.current.reviewPending){proceed();return;}
    const version=state.current.version;
    Alert.alert('Discard unsent draft?','Your draft and unconfirmed review will be discarded. Saved items are kept.',[
      {text:'Keep editing',style:'cancel'},
      {text:'Discard',style:'destructive',onPress:()=>{if(state.current.alive && state.current.version===version){state.current.onDiscard();proceed();}}},
    ]);
  },[]);
  const acceptText=useCallback((next:string,done:(accepted:boolean)=>void,copy:ReplaceDraftCopy=SPEECH_REPLACE_COPY):void=>{
    if(!state.current.alive || !next.trim()){done(false);return;}
    const version=state.current.version;
    const replace=():void=>{
      if(!state.current.alive || state.current.version!==version){done(false);return;}
      state.current.onReplace(next);done(true);
    };
    if(state.current.text.trim() && state.current.text!==next) Alert.alert(copy.title,copy.message,[
      {text:'Keep current text',style:'cancel',onPress:()=>done(false)},
      {text:'Replace',onPress:replace},
    ],{cancelable:true,onDismiss:()=>done(false)});
    else replace();
  },[]);
  return {requestLeave,acceptText,hasDraft};
};
