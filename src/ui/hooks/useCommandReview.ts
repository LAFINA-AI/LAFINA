import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {createCommandSession} from '../../ai/nlu/commandSession';
import type {CommandReview,CommandSession,CommandExecutionResult,CommandProposal,FreeTimeChoice} from '../../ai/nlu/commandSession';

/** Free times waiting for a pick. The prompt says what they are for. */
export interface FreeTimeOfferState {prompt:string;choices:readonly FreeTimeChoice[];expiresAt:string;}

/** Retires private reviews on background, expiry, account change and unmount, including StrictMode replay. */
export const useCommandReview=(userId:string,active=true):{
  review:CommandReview|null;prepare:(text:string)=>CommandProposal;
  offer:FreeTimeOfferState|null;choose:(choiceId:string)=>CommandProposal;
  confirm:()=>CommandExecutionResult;cancel:()=>void;
}=>{
  const current=useRef<{userId:string;session:CommandSession}|null>(null);
  const activeRef=useRef(active);activeRef.current=active;
  const [review,setReview]=useState<CommandReview|null>(null);
  const [offer,setOffer]=useState<FreeTimeOfferState|null>(null);
  const cancel=useCallback(()=>{if(current.current?.userId===userId) current.current.session.cancel();setReview(null);setOffer(null);},[userId]);
  useEffect(()=>{
    const entry={userId,session:createCommandSession(userId)};
    current.current=entry;setReview(null);setOffer(null);
    const subscription=AppState.addEventListener('change',state=>{
      if(state!=='active'){entry.session.cancel();setReview(null);setOffer(null);}
    });
    return ()=>{subscription.remove();entry.session.dispose();if(current.current===entry) current.current=null;};
  },[userId]);
  useEffect(()=>{if(!active) cancel();},[active,cancel]);
  useEffect(()=>{
    if(!review) return;
    const timer=setTimeout(cancel,Math.max(0,Date.parse(review.expiresAt)-Date.now()));
    return ()=>clearTimeout(timer);
  },[review,cancel]);
  useEffect(()=>{
    if(!offer) return;
    const timer=setTimeout(cancel,Math.max(0,Date.parse(offer.expiresAt)-Date.now()));
    return ()=>clearTimeout(timer);
  },[offer,cancel]);
  return {
    review,
    offer,
    choose:(choiceId)=>{
      const entry=current.current;
      setOffer(null);
      if(!activeRef.current || entry?.userId!==userId) return {review:null,reply:'Open a new command session.'};
      const result=entry.session.choose(choiceId);setReview(result.review);return result;
    },
    prepare:(text)=>{
      const entry=current.current;
      if(!activeRef.current || entry?.userId!==userId) return {review:null,reply:'Open a new command session.'};
      const result=entry.session.propose(text);setReview(result.review);
      setOffer(result.choices?.length&&result.choicesExpireAt?{prompt:result.reply,choices:result.choices,expiresAt:result.choicesExpireAt}:null);
      return result;
    },
    confirm:()=>{
      const entry=current.current;
      if(!activeRef.current || !review || entry?.userId!==userId) return {status:'invalid',reply:'Prepare the command again.'};
      const result=entry.session.confirm(review.id);if(result.status!=='failed') setReview(null);return result;
    },
    cancel,
  };
};
