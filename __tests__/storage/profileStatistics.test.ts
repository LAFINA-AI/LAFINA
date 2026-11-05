import {db,initDatabase,tasksStore,notesStore,remindersStore} from '../../src/storage';
import {profileStatisticsStore} from '../../src/storage/profileStatisticsStore';
describe('truthful profile evidence',()=>{
  beforeAll(async()=>{await initDatabase();});
  it('counts real account-owned records',()=>{
    const owner='stats-evidence',now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[owner,'Stats',now,now]);
    expect(profileStatisticsStore.read(owner)).toEqual({completedTasksCount:0,notesCount:0,onTimeRate:null,finishedRemindersCount:0});
    tasksStore.insertTask({id:'stats-task',userId:owner,title:'Voice appears in a typed title',isCompleted:true,priority:'Medium',category:'Work',notes:'voice is merely text'});
    notesStore.insert({id:'stats-note',userId:owner,title:'Typed assistant note',body:'Text',category:'Work',isPinned:false,tags:[],isVoiceTranscribed:true,imageUri:null});
    expect(profileStatisticsStore.read(owner)).toEqual({completedTasksCount:1,notesCount:1,onTimeRate:null,finishedRemindersCount:0});
    expect(profileStatisticsStore.read('other-stats-owner').notesCount).toBe(0);
    tasksStore.deleteTask('stats-task');expect(profileStatisticsStore.read(owner).completedTasksCount).toBe(0);
  });
  it('rates finished reminders answered without a snooze, per account, ignoring deleted ones',()=>{
    const owner='rate-owner',foreign='rate-foreign',now=new Date().toISOString();
    for(const id of [owner,foreign])db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[id,id,now,now]);
    const add=(id:string,userId:string,status:string,snoozes=0,deleted=false)=>{
      remindersStore.insertReminder({id,userId,task:id,description:null,scheduledAt:now,triggerAt:now,status:'pending',preCastAudioPath:null});
      db.executeSync('UPDATE reminders SET status=?,snooze_count=?,deleted_at=? WHERE id=?',[status,snoozes,deleted?now:null,id]);
    };
    add('rate-pending',owner,'pending');
    expect(profileStatisticsStore.read(owner)).toMatchObject({onTimeRate:null,finishedRemindersCount:0});
    add('rate-on-time',owner,'acknowledged');
    add('rate-snoozed',owner,'acknowledged',2);
    add('rate-missed',owner,'missed');
    add('rate-deleted',owner,'missed',0,true);
    add('rate-foreign-row',foreign,'missed');
    expect(profileStatisticsStore.read(owner)).toMatchObject({onTimeRate:33,finishedRemindersCount:3});
    expect(profileStatisticsStore.read(foreign)).toMatchObject({onTimeRate:0,finishedRemindersCount:1});
  });
  it('reports database failures as unavailable instead of a fabricated zero',()=>{
    const execute=jest.spyOn(db,'executeSync').mockImplementationOnce(()=>{throw new Error('unavailable');});
    expect(profileStatisticsStore.read('stats-evidence')).toEqual({completedTasksCount:null,notesCount:null,onTimeRate:null,finishedRemindersCount:null});execute.mockRestore();
  });
});
