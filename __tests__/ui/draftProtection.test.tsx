import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Alert} from 'react-native';
import {useDraftProtection} from '../../src/ui/hooks/useDraftProtection';

describe('transient composer protection',()=>{
  afterEach(()=>jest.restoreAllMocks());
  it('requires discard for navigation and protects against a retained old decision',()=>{
    const alert=jest.spyOn(Alert,'alert');const discard=jest.fn(),replace=jest.fn(),leave=jest.fn();
    let protection!:ReturnType<typeof useDraftProtection>;
    const Harness=({text}:{text:string})=>{protection=useDraftProtection('student',text,false,discard,replace);return null;};
    let tree!:Renderer.ReactTestRenderer;act(()=>{tree=Renderer.create(<Harness text="unsent"/>);});
    act(()=>protection.requestLeave(leave));expect(leave).not.toHaveBeenCalled();
    const old=alert.mock.calls[0][2]!;
    act(()=>tree.update(<Harness text="newer draft"/>));
    act(()=>old[1].onPress?.());expect(discard).not.toHaveBeenCalled();
    act(()=>protection.requestLeave(leave));
    const current=alert.mock.calls[1][2]!;expect(current[0].style).toBe('cancel');
    act(()=>current[1].onPress?.());expect(discard).toHaveBeenCalledTimes(1);expect(leave).toHaveBeenCalledTimes(1);
    act(()=>tree.unmount());
  });
  it('keeps different typed text by default and accepts same text without sending',()=>{
    const alert=jest.spyOn(Alert,'alert');const replace=jest.fn(),done=jest.fn();let protection!:ReturnType<typeof useDraftProtection>;
    const Harness=()=>{protection=useDraftProtection('student','typed',false,jest.fn(),replace);return null;};
    let tree!:Renderer.ReactTestRenderer;act(()=>{tree=Renderer.create(<Harness/>);});
    act(()=>protection.acceptText('spoken',done));expect(replace).not.toHaveBeenCalled();
    const buttons=alert.mock.calls[0][2]!;expect(buttons[0].style).toBe('cancel');
    act(()=>buttons[0].onPress?.());expect(done).toHaveBeenCalledWith(false);
    act(()=>protection.acceptText('typed',done));expect(replace).toHaveBeenCalledWith('typed');
    expect(done).toHaveBeenLastCalledWith(true);
    act(()=>tree.unmount());
  });
});
