import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {createCommandSession} from '../../ai/nlu/commandSession';
import type {CommandReview,CommandSession,CommandExecutionResult,CommandProposal} from '../../ai/nlu/commandSession';

/** Retires private reviews on background, expiry, account change and unmount, including StrictMode replay. */
export const useCommandReview=(userId:string,active=true):{
  review:CommandReview|null;prepare:(text:string)=>CommandProposal;
  confirm:()=>CommandExecutionResult;cancel:()=>void;
}=>{
  const current=useRef<{userId:string;session:CommandSession}|null>(null);
  const activeRef=useRef(active);activeRef.current=active;
  const [review,setReview]=useState<CommandReview|null>(null);
  const cancel=useCallback(()=>{if(current.current?.userId===userId) current.current.session.cancel();setReview(null);},[userId]);
  useEffect(()=>{
    const entry={userId,session:createCommandSession(userId)};
    current.current=entry;setReview(null);
    const subscription=AppState.addEventListener('change',state=>{
      if(state!=='active'){entry.session.cancel();setReview(null);}
    });
    return ()=>{subscription.remove();entry.session.dispose();if(current.current===entry) current.current=null;};
  },[userId]);
  useEffect(()=>{if(!active) cancel();},[active,cancel]);
  useEffect(()=>{
    if(!review) return;
    const timer=setTimeout(cancel,Math.max(0,Date.parse(review.expiresAt)-Date.now()));
    return ()=>clearTimeout(timer);
  },[review,cancel]);
  return {
    review,
    prepare:(text)=>{
      const entry=current.current;
      if(!activeRef.current || entry?.userId!==userId) return {review:null,reply:'Open a new command session.'};
      const result=entry.session.propose(text);setReview(result.review);return result;
    },
    confirm:()=>{
      const entry=current.current;
      if(!activeRef.current || !review || entry?.userId!==userId) return {status:'invalid',reply:'Prepare the command again.'};
      const result=entry.session.confirm(review.id);if(result.status!=='failed') setReview(null);return result;
    },
    cancel,
  };
};
