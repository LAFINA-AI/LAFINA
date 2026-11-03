import {startAndroidSpeechPlayback,stopAndroidSpeechPlayback} from '../ai/native/androidSpeech';
import type {AndroidSpeechPlaybackOptions} from '../ai/native/androidSpeech';
import {db} from '../storage/database';
import type {CallSpeechProvider} from './speechProvider';
/** Creates an account-bound optional offline provider; disposal stops only its own utterance. */
export const createAndroidCallSpeechProvider=(userId:string,voiceName:string,options:AndroidSpeechPlaybackOptions={}):CallSpeechProvider=>{
  let requestId:string|null=null,disposed=false;
  const stop=async()=>{const id=requestId;requestId=null;if(id)await stopAndroidSpeechPlayback(id);};
  return {
    speakText:async text=>{
      if(disposed||db.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('Speech account changed.');
      const playback=startAndroidSpeechPlayback(text,voiceName,options);requestId=playback.requestId;
      const watcher=setInterval(()=>{try{if(db.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)void stopAndroidSpeechPlayback(playback.requestId);}catch{void stopAndroidSpeechPlayback(playback.requestId);}},250);
      try{await playback.result;if(disposed||db.executeSync('SELECT user_id FROM active_session LIMIT 1').rows[0]?.user_id!==userId)throw new Error('Speech account changed.');return {source:'android'};}finally{clearInterval(watcher);if(requestId===playback.requestId)requestId=null;}
    },
    stopSpeech:stop,
    dispose:async()=>{disposed=true;await stop();},
  };
};
