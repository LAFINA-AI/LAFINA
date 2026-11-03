import {db} from './database';
export interface ProfileStatistics {completedTasksCount:number|null;notesCount:number|null;voiceCommandsCount:null;}
export const profileStatisticsStore={
  /** Counts actual local records; historical content flags cannot prove spoken-command usage. */
  read:(userId:string):ProfileStatistics=>{
    try{
      if(!userId)throw new Error('Statistics owner required.');
      const completedTasksCount=Number(db.executeSync('SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND deleted_at IS NULL AND is_completed=1',[userId]).rows[0]?.count??0);
      const notesCount=Number(db.executeSync('SELECT COUNT(*) AS count FROM notes WHERE user_id=? AND deleted_at IS NULL',[userId]).rows[0]?.count??0);
      return {completedTasksCount,notesCount,voiceCommandsCount:null};
    }catch{return {completedTasksCount:null,notesCount:null,voiceCommandsCount:null};}
  },
};
