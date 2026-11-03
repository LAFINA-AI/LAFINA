import {db,initDatabase,tasksStore,notesStore} from '../../src/storage';
import {profileStatisticsStore} from '../../src/storage/profileStatisticsStore';
describe('truthful profile evidence',()=>{
  beforeAll(async()=>{await initDatabase();});
  it('counts real account-owned records and leaves unrecorded voice usage unavailable',()=>{
    const owner='stats-evidence',now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',[owner,'Stats',now,now]);
    expect(profileStatisticsStore.read(owner)).toEqual({completedTasksCount:0,notesCount:0,voiceCommandsCount:null});
    tasksStore.insertTask({id:'stats-task',userId:owner,title:'Voice appears in a typed title',isCompleted:true,priority:'Medium',category:'Work',notes:'voice is merely text'});
    notesStore.insert({id:'stats-note',userId:owner,title:'Typed assistant note',body:'Text',category:'Work',isPinned:false,tags:[],isVoiceTranscribed:true,imageUri:null});
    expect(profileStatisticsStore.read(owner)).toEqual({completedTasksCount:1,notesCount:1,voiceCommandsCount:null});
    expect(profileStatisticsStore.read('other-stats-owner').notesCount).toBe(0);
    tasksStore.deleteTask('stats-task');expect(profileStatisticsStore.read(owner).completedTasksCount).toBe(0);
  });
  it('reports database failures as unavailable instead of a fabricated zero',()=>{
    const execute=jest.spyOn(db,'executeSync').mockImplementationOnce(()=>{throw new Error('unavailable');});
    expect(profileStatisticsStore.read('stats-evidence')).toEqual({completedTasksCount:null,notesCount:null,voiceCommandsCount:null});execute.mockRestore();
  });
});
