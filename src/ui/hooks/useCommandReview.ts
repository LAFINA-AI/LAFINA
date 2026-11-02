import {useCallback,useEffect,useMemo,useState} from 'react';
import {AppState} from 'react-native';
import {createCommandSession} from '../../ai/nlu/commandSession';
import type {CommandReview,CommandExecutionResult,CommandProposal} from '../../ai/nlu/commandSession';

/** Retires private reviews on background, expiry, account change and unmount. */
export const useCommandReview=(userId:string,active=true):{
  review:CommandReview|null;prepare:(text:string)=>CommandProposal;
  confirm:()=>CommandExecutionResult;cancel:()=>void;
}=>{
  const session=useMemo(()=>createCommandSession(userId),[userId]);
  const [review,setReview]=useState<CommandReview|null>(null);
  const cancel=useCallback(()=>{session.cancel();setReview(null);},[session]);
  useEffect(()=>{
    setReview(null);
    const subscription=AppState.addEventListener('change',state=>{if(state!=='active') cancel();});
    return ()=>{subscription.remove();session.dispose();};
  },[session,cancel]);
  useEffect(()=>{if(!active) cancel();},[active,cancel]);
  useEffect(()=>{
    if(!review) return;
    const timer=setTimeout(cancel,Math.max(0,Date.parse(review.expiresAt)-Date.now()));
    return ()=>clearTimeout(timer);
  },[review,cancel]);
  return {
    review,
    prepare:(text)=>{const result=session.propose(text);setReview(result.review);return result;},
    confirm:()=>{
      if(!active || !review) return {status:'invalid',reply:'Prepare the command again.'};
      const result=session.confirm(review.id);if(result.status!=='failed') setReview(null);return result;
    },
    cancel,
  };
};
