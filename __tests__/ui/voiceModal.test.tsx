import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { DeviceEventEmitter,NativeModules,PermissionsAndroid,TextInput } from 'react-native';
import {db} from '../../src/storage/database';
import {initDatabase} from '../../src/storage/dbInit';

jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? children : null,
}));

jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: jest.fn(),
    colors: {
      background: '#FAF9F6',
      cardBg: '#FFFFFF',
      inputBg: '#F7F7F7',
      divider: '#EEEEEE',
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#888888',
      border: '#DDDDDD',
      statusBarStyle: 'dark-content',
      red: '#F75A5A',
      blue: '#E6003A',
      yellow: '#C8A800',
      success: '#2ECC71',
      warning: '#F4A100',
      error: '#FF3B30',
      white: '#FFFFFF',
      black: '#000000',
      overlay: 'rgba(0,0,0,0.5)',
    },
  }),
}));

import { VoiceModal } from '../../src/ui/components/VoiceModal';

/** Every string rendered as a Text child. */
const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
  tree.root
    .findAll((node) => {
      const { children } = node.props;
      return typeof children === 'string' || (Array.isArray(children) && children.some((c) => typeof c === 'string'));
    })
    .map((node) => {
      const { children } = node.props;
      return Array.isArray(children) ? children.filter((c) => typeof c !== 'object').join('') : children;
    })
    .join(' | ');

const render = (): ReactTestRenderer.ReactTestRenderer => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<VoiceModal visible userId="voice-user" onClose={jest.fn()} />);
  });
  return tree;
};

describe('voice assistant sheet', () => {
  beforeAll(async()=>{await initDatabase();});

  beforeEach(() => {
    db.executeSync('DELETE FROM notes');db.executeSync('DELETE FROM active_session');
    const now=new Date().toISOString();
    db.executeSync('INSERT OR IGNORE INTO users(id,username,created_at,updated_at) VALUES(?,?,?,?)',['voice-user','voice-user',now,now]);
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',['voice-user',now,now]);

    // Jest runs as iOS, where PermissionsAndroid only logs that it does nothing.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('has no debug label, and says where the words will appear', () => {
    const tree = render();
    const text = textOf(tree);
    expect(text).not.toMatch(/DEBUG|🔍/);
    expect(text).toContain('You said');
    expect(text).toContain('Your words will show up here as you speak.');
    expect(text).toContain('Hold the mic button to talk');
    act(() => tree.unmount());
  });

  it('shows the words as they are transcribed', () => {
    const tree = render();
    act(() => {
      DeviceEventEmitter.emit('onSpeechPartialResult', { transcript: 'add task submit' });
    });
    expect(tree.root.findByProps({ testID: 'voice-transcript' }).props.children.join('')).toBe(
      '“add task submit”',
    );

    act(() => {
      DeviceEventEmitter.emit('onSpeechFinalResult', { transcript: 'add task submit report by 5pm' });
    });
    expect(textOf(tree)).toContain('add task submit report by 5pm');
    expect(textOf(tree)).not.toContain('Your words will show up here');
    act(() => tree.unmount());
  });

  it('has no suggested commands, only the mic and a box for typing one', () => {
    const tree = render();
    const text = textOf(tree);
    for (const command of [
      'Add task submit report by 5pm',
      'Block 2-4pm today for deep work',
      'Note: review pilot evaluation parameters',
    ]) {
      expect(text).not.toContain(command);
    }
    expect(text).not.toContain('Or try one of these');
    expect(tree.root.findAll((node) => node.props.placeholder === 'Or type a command...').length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
  it('prepares typed text, permits cancellation, and saves only on Confirm',()=>{
    const tree=render();
    act(()=>tree.root.findByType(TextInput).props.onChangeText('note: reviewed text'));
    act(()=>tree.root.findByProps({accessibilityLabel:'Send command'}).props.onPress());
    expect(db.executeSync('SELECT * FROM notes').rows).toHaveLength(0);
    act(()=>tree.root.findByProps({accessibilityLabel:'Cancel review'}).props.onPress());
    expect(tree.root.findByType(TextInput).props.value).toBe('note: reviewed text');
    act(()=>tree.root.findByProps({accessibilityLabel:'Send command'}).props.onPress());
    act(()=>tree.root.findByProps({accessibilityLabel:'Confirm command'}).props.onPress());
    expect(db.executeSync('SELECT body FROM notes').rows[0].body).toBe('reviewed text');
    act(()=>tree.unmount());
  });
  it('turns a finished recording into an editable draft without saving',async()=>{
    jest.spyOn(PermissionsAndroid,'check').mockResolvedValue(true);
    NativeModules.LafinaSpeechToText={startListening:jest.fn(({captureId}:{captureId:string})=>Promise.resolve({captureId,transcript:'note: dictated text',speechDetected:true,cancelled:false})),stopListening:jest.fn().mockResolvedValue(true),cancelListening:jest.fn().mockResolvedValue(true)};
    const tree=render();
    await act(async()=>{await tree.root.findByProps({accessibilityLabel:'Hold to talk'}).props.onPressIn();});
    await act(async()=>{await tree.root.findByProps({accessibilityLabel:'Hold to talk'}).props.onPressOut();});
    expect(tree.root.findByType(TextInput).props.value).toBe('note: dictated text');
    expect(db.executeSync('SELECT * FROM notes').rows).toHaveLength(0);
    act(()=>tree.root.findByType(TextInput).props.onChangeText('note: corrected text'));
    act(()=>tree.root.findByProps({accessibilityLabel:'Send command'}).props.onPress());
    expect(textOf(tree)).toContain('corrected text');
    act(()=>tree.root.findByProps({accessibilityLabel:'Confirm command'}).props.onPress());
    expect(db.executeSync('SELECT body FROM notes').rows[0].body).toBe('corrected text');
    act(()=>tree.unmount());delete NativeModules.LafinaSpeechToText;
  });

});
