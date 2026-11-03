import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text,TextInput,TouchableOpacity,Switch} from 'react-native';
import {db,initDatabase,userStore} from '../../src/storage';
import {personalMemoryStore as memory} from '../../src/storage/personalMemoryStore';
import {PersonalMemory} from '../../src/ui/components/profile/PersonalMemory';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
it('reviews, corrects, disables and forgets explicit preferences from Profile',async()=>{
  await initDatabase();const now=new Date().toISOString();db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['memory-ui','Memory',now,now]);userStore.setCurrentUser('memory-ui');
  let tree!:Renderer.ReactTestRenderer;await act(async()=>{tree=Renderer.create(<ThemeProvider userId="memory-ui"><PersonalMemory userId="memory-ui" visible onClose={()=>{}}/></ThemeProvider>);});
  const press=(label:string)=>act(()=>{tree.root.findAllByType(TouchableOpacity).find(b=>b.findAllByType(Text).some(t=>t.props.children===label))!.props.onPress();});
  act(()=>{tree.root.findByProps({accessibilityLabel:'Preferred event start time'}).props.onChangeText('09:00');tree.root.findByProps({accessibilityLabel:'Preferred event duration'}).props.onChangeText('60');});
  press('Review preferences');expect(memory.read('memory-ui').value).toBeNull();press('Save reviewed preferences');expect(memory.read('memory-ui').value?.startTime).toBe('09:00');
  act(()=>tree.root.findByType(Switch).props.onValueChange(false));expect(memory.offer('memory-ui')).toBeNull();
  press('Forget start time');expect(memory.read('memory-ui').value?.startTime).toBeNull();press('Forget all event preferences');expect(memory.read('memory-ui').value).toBeNull();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(2);await act(async()=>tree.unmount());
});
