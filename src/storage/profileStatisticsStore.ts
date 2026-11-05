import {db} from './database';
export interface ProfileStatistics {
  completedTasksCount:number|null;
  notesCount:number|null;
  /** Whole percent of finished reminders answered without a snooze; null when there are none or on a read failure. */
  onTimeRate:number|null;
  /** Reminders that reached acknowledged or missed; null only on a read failure. */
  finishedRemindersCount:number|null;
}
export const profileStatisticsStore={
  /** Counts actual local records; historical content flags cannot prove spoken-command usage. */
  read:(userId:string):ProfileStatistics=>{
    try{
      if(!userId)throw new Error('Statistics owner required.');
      const completedTasksCount=Number(db.executeSync('SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND deleted_at IS NULL AND is_completed=1',[userId]).rows[0]?.count??0);
      const notesCount=Number(db.executeSync('SELECT COUNT(*) AS count FROM notes WHERE user_id=? AND deleted_at IS NULL',[userId]).rows[0]?.count??0);
      const reminders=db.executeSync(`SELECT
          COALESCE(SUM(CASE WHEN status='acknowledged' AND snooze_count=0 THEN 1 ELSE 0 END),0) AS on_time,
          COALESCE(SUM(CASE WHEN status IN ('acknowledged','missed') THEN 1 ELSE 0 END),0) AS finished
        FROM reminders WHERE user_id=? AND deleted_at IS NULL`,[userId]).rows[0];
      const finishedRemindersCount=Number(reminders?.finished??0);
      const onTimeRate=finishedRemindersCount>0?Math.round((Number(reminders?.on_time??0)/finishedRemindersCount)*100):null;
      return {completedTasksCount,notesCount,onTimeRate,finishedRemindersCount};
    }catch{return {completedTasksCount:null,notesCount:null,onTimeRate:null,finishedRemindersCount:null};}
  },
};
