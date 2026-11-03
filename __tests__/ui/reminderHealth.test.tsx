import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {TouchableOpacity,Linking,Text} from 'react-native';
import {ReminderHealth} from '../../src/ui/components/profile/ReminderHealth';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {readReminderHealth,recoverReminderHealth} from '../../src/scheduler/reminderHealth';
jest.mock('../../src/scheduler/reminderHealth',()=>({readReminderHealth:jest.fn(),recoverReminderHealth:jest.fn()}));
describe('reminder health controls',()=>{
  it('shows denied/unavailable evidence, opens settings and reports recovery results',async()=>{
    jest.mocked(readReminderHealth).mockResolvedValue({permissions:{notificationsEnabled:false,canScheduleExactAlarms:false,canUseFullScreenIntent:true},local:{pending:2,queued:1,blocked:1,inexact:1,ringing:0,recent:[{state:'pending',reason:'Other delivery condition',at:'2026-11-03'}]},checkedAt:'2026-11-03'});
    jest.mocked(recoverReminderHealth).mockResolvedValue({ok:false,message:'Retry unavailable'});
    const settings=jest.spyOn(Linking,'openSettings').mockResolvedValue();let tree!:Renderer.ReactTestRenderer;
    await act(async()=>{tree=Renderer.create(<ThemeProvider userId="health-ui"><ReminderHealth userId="health-ui" visible onClose={()=>{}}/></ThemeProvider>);});
    expect(JSON.stringify(tree.toJSON())).toContain('Not allowed');
    const press=async(label:string)=>{const button=tree.root.findAllByType(TouchableOpacity).find(b=>b.findAllByType(Text).some(t=>t.props.children===label))!;await act(async()=>button.props.onPress());};
    await press('Notification and app settings');expect(settings).toHaveBeenCalled();await press('Retry reminder registration');expect(JSON.stringify(tree.toJSON())).toContain('Retry unavailable');
    await press('Refresh health');expect(readReminderHealth).toHaveBeenCalledTimes(3);
    await act(async()=>tree.unmount());settings.mockRestore();
  });
});
