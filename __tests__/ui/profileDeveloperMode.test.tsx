import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {db,initDatabase,localSettingsStore} from '../../src/storage';
import {isQaDiagnosticsAvailable} from '../../src/storage/qaSqlChecks';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {DEVELOPER_MODE_SETTING,ProfileScreen} from '../../src/ui/screens/ProfileScreen';

jest.mock('../../src/storage/qaSqlChecks',()=>({isQaDiagnosticsAvailable:jest.fn(),runQaSqlChecks:jest.fn()}));

const USER='developer-mode-user';

describe('developer mode on Profile',()=>{
  let tree:Renderer.ReactTestRenderer;
  const render=async()=>{await act(async()=>{tree=Renderer.create(<ThemeProvider userId={USER}><ProfileScreen userId={USER} refreshTrigger={0} onRefresh={jest.fn()}/></ThemeProvider>);});};
  const text=()=>JSON.stringify(tree.toJSON());
  const version=()=>tree.root.findAll(node=>node.props.accessibilityLabel==='App Version'&&typeof node.props.onPress==='function')[0];
  const tapVersion=(times:number)=>{for(let i=0;i<times;i++)act(()=>version().props.onPress());};
  beforeAll(async()=>{await initDatabase();});
  beforeEach(()=>{
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,role,is_new_user,created_at,updated_at) VALUES(?,?,?,0,?,?)',[USER,USER,'student',now,now]);
    db.executeSync('DELETE FROM local_settings WHERE user_id=?',[USER]);
  });
  afterEach(async()=>{await act(async()=>tree.unmount());jest.restoreAllMocks();});

  it('never shows the tools or an unlock in a build the native gate refuses',async()=>{
    jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(false);
    localSettingsStore.set(USER,DEVELOPER_MODE_SETTING,'1');
    await render();
    expect(text()).not.toContain('QA diagnostics');
    expect(version()).toBeUndefined();
    expect(text()).toContain('App Version');
  });
  it('hides the tools in a QA build until the flag is on',async()=>{
    jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(true);
    await render();
    expect(text()).not.toContain('QA diagnostics');
    tapVersion(6);
    expect(text()).not.toContain('QA diagnostics');
  });
  it('turns on after seven taps, stays on, and more taps change nothing',async()=>{
    jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(true);
    await render();
    tapVersion(7);
    expect(text()).toContain('QA diagnostics');
    expect(localSettingsStore.get(USER,DEVELOPER_MODE_SETTING)).toBe('1');
    tapVersion(7);
    expect(text()).toContain('QA diagnostics');
    await act(async()=>tree.unmount());
    await render();
    expect(text()).toContain('QA diagnostics');
  });
  it('needs the taps close together',async()=>{
    jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(true);
    await render();
    let clock=1_000_000;
    jest.spyOn(Date,'now').mockImplementation(()=>clock);
    for(let i=0;i<7;i++){act(()=>version().props.onPress());clock+=4000;}
    expect(text()).not.toContain('QA diagnostics');
  });
  it('can be turned off again',async()=>{
    jest.mocked(isQaDiagnosticsAvailable).mockReturnValue(true);
    localSettingsStore.set(USER,DEVELOPER_MODE_SETTING,'1');
    await render();
    const row=tree.root.findAll(node=>node.props.text==='Turn off developer mode')[0];
    act(()=>row.props.onPress());
    expect(text()).not.toContain('QA diagnostics');
    expect(localSettingsStore.get(USER,DEVELOPER_MODE_SETTING)).toBe('0');
  });
});
