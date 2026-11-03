import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';

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
      blue: '#2563EB',
      yellow: '#C8A800',
      success: '#2ECC71',
      warning: '#F4A100',
      error: '#FF3B30',
      white: '#FFFFFF',
      black: '#000000',
      overlay: 'rgba(0,0,0,0.5)',
      chipActiveText: '#FFFFFF',
      switchTrackOff: '#767577',
      switchThumb: '#FFFFFF',
      placeholder: '#888888',
      iconMuted: '#AAAAAA',
      eventIconBg: '#F0F0FF',
      bannerBg: '#FFF0F0',
      noteHighlightBg: '#FFF3A3',
      noteHighlightText: '#1A1A1A',
    },
  }),
}));

import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { cloudClient } from '../../src/cloud/cloudClient';
import { chatStore } from '../../src/storage/chatStore';
import { db } from '../../src/storage/database';
import { initDatabase } from '../../src/storage/dbInit';
import { ChatScreen } from '../../src/ui/screens/ChatScreen';

const PRO = 'chat-extras-pro';
const FREE = 'chat-extras-free';

type Tree = ReactTestRenderer.ReactTestRenderer;

/** Every string rendered as a Text child, whether alone or among others. */
const textOf = (tree: { root: ReactTestRenderer.ReactTestInstance }): string =>
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

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let round = 0; round < 20; round += 1) {
      await Promise.resolve();
    }
  });
};

/** The pressable itself; its host view carries the same label and handler. */
const byLabel = (tree: Tree, label: string) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];

const send = async (tree: Tree, text: string): Promise<void> => {
  const input = tree.root.find((node) => typeof node.props.onChangeText === 'function' && node.props.returnKeyType === 'send');
  act(() => input.props.onChangeText(text));
  const button = tree.root.findAll(
    (node) =>
      typeof node.props.accessibilityLabel === 'string' &&
      /^(Send message|Create (PDF|Word|Excel|PowerPoint) file)$/.test(node.props.accessibilityLabel) &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => {
    button.props.onPress();
  });
  await flush();
};

const render = async (userId: string,extras:Partial<React.ComponentProps<typeof ChatScreen>>={}): Promise<Tree> => {
  let tree: Tree;
  act(() => {
    tree = ReactTestRenderer.create(<ChatScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} {...extras} />);
  });
  await flush();
  return tree!;
};

describe('Chat files and handbook answers on mobile', () => {
  beforeAll(async () => {
    await initDatabase();
    const now = new Date().toISOString();
    for (const [id, role] of [[PRO, 'student_pro'], [FREE, 'student']]) {
      db.executeSync(
        'INSERT OR IGNORE INTO users (id, username, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, id, role, now, now],
      );
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    db.executeSync('DELETE FROM messages');
    db.executeSync('DELETE FROM local_settings');
    jest.spyOn(cloudClient, 'isOnline').mockResolvedValue(true);
    jest.spyOn(cloudClient, 'getAccessToken').mockReturnValue('token');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.mocked(RNFS.writeFile).mockReset();
    jest.mocked(Share.open).mockClear();
  });

  const serve = (routes: Record<string, unknown>) =>
    jest.spyOn(cloudClient, 'request').mockImplementation(async (path: string) => {
      const data = routes[path];
      return data ? { status: 'success', data: data as never } : { status: 'server_error', error: 'unexpected' };
    });

  it('creates a PDF from a request in so many words, and keeps it as a card to share', async () => {
    const request = serve({
      '/v1/ai/handbook/status': { enabled: false, functional: false, passages: 0 },
      '/v1/ai/documents': {
        summary: 'Here is your study guide on cell organelles.',
        filename: 'cell-organelles.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        contentBase64: 'JVBERi0xLjc=',
        warnings: [],
      },
    });
    const tree = await render(PRO);

    await send(tree, 'Make me a PDF study guide on cell organelles');

    expect(request).toHaveBeenCalledWith('/v1/ai/documents', expect.anything(), true);
    const [path, contents, encoding] = jest.mocked(RNFS.writeFile).mock.calls[0];
    expect(path).toMatch(/^\/documents\/attachments\/.+\.pdf$/);
    expect([contents, encoding]).toEqual(['JVBERi0xLjc=', 'base64']);

    const reply = chatStore.getMessages(PRO).find((message) => message.sender === 'assistant')!;
    expect(reply.content).toBe('Here is your study guide on cell organelles.');
    expect(reply.attachment).toMatchObject({ fileName: 'cell-organelles.pdf', format: 'pdf', uri: path });
    expect(textOf(tree)).toContain('cell-organelles.pdf');

    await act(async () => {
      byLabel(tree, 'Open or share cell-organelles.pdf').props.onPress();
    });
    await flush();
    expect(RNFS.copyFile).toHaveBeenCalledWith(path, '/temp/cell-organelles.pdf');
    expect(Share.open).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'file:///temp/cell-organelles.pdf', type: 'application/pdf' }),
    );
  });

  it('tags a reply grounded in the Student Handbook with its pages', async () => {
    const request = serve({
      '/v1/ai/handbook/status': { enabled: true, functional: true, passages: 412 },
      '/v1/ai/chat': {
        reply: 'USTP grades on a 1.0 to 5.0 scale.',
        model: 'deepseek-v4-flash',
        sources: [{ page: '32', pageEnd: '32', section: 'Grading', score: 0.8 }],
      },
    });
    const tree = await render(PRO);
    expect(textOf(tree)).toContain('Handbook');

    await send(tree, 'What is the grading system at USTP?');

    const chatCall = request.mock.calls.find(([path]) => path === '/v1/ai/chat')!;
    expect(JSON.parse(String(chatCall[1]?.body)).useHandbook).toBe(true);
    const text = textOf(tree);
    expect(text).toContain('USTP grades on a 1.0 to 5.0 scale.');
    expect(text).toContain('Handbook p. 32');
  });

  it('explains Student Pro instead of opening the file formats', async () => {
    serve({});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const tree = await render(FREE);

    act(() => byLabel(tree, 'Create a file (Student Pro)').props.onPress());

    expect(alert).toHaveBeenCalledWith('Student Pro Required', expect.stringContaining('exclusive to Student Pro'));
    expect(textOf(tree)).not.toContain('PDF document');
  });

  it('offers the formats and the handbook switch to a Student Pro', async () => {
    serve({ '/v1/ai/handbook/status': { enabled: true, functional: true, passages: 412 } });
    const tree = await render(PRO);

    act(() => byLabel(tree, 'Create a file').props.onPress());
    const text = textOf(tree);
    expect(text).toContain('PDF document');
    expect(text).toContain('Excel workbook');
    expect(text).toContain('Answer from the Student Handbook');

    act(() => {
      tree.root
        .find((node) => node.props.accessibilityLabel === 'Answer from the Student Handbook' && node.props.onValueChange)
        .props.onValueChange(false);
    });
    const setting = db.executeSync('SELECT value FROM local_settings WHERE user_id = ? AND key = ?', [PRO, 'handbook'])
      .rows?.[0];
    expect(setting?.value).toBe('off');

    act(() => {
      tree.root
        .find((node) => node.props.accessibilityRole === 'button' && node.props.onPress && textOf({ root: node }).includes('Word document'))
        .props.onPress();
    });
    expect(textOf(tree)).toContain('Creating a Word file');
  });
  it('reviews a Chat command before writing, including online-capable accounts',async()=>{
    db.executeSync('DELETE FROM active_session');db.executeSync('DELETE FROM notes');
    db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',[PRO,new Date().toISOString(),new Date().toISOString()]);
    serve({'/v1/ai/handbook/status':{enabled:false,functional:false,passages:0}});
    const tree=await render(PRO);
    await send(tree,'note: reviewed Chat note');
    expect(db.executeSync('SELECT * FROM notes').rows).toHaveLength(0);
    expect(textOf(tree)).toContain('reviewed Chat note');
    act(()=>byLabel(tree,'Cancel review').props.onPress());
    const input=tree.root.find(node=>node.props.returnKeyType==='send');
    expect(input.props.value).toBe('note: reviewed Chat note');
    await send(tree,'note: corrected Chat note');
    act(()=>byLabel(tree,'Confirm command').props.onPress());
    expect(db.executeSync('SELECT body FROM notes').rows[0].body).toBe('corrected Chat note');
    act(()=>tree.unmount());
  });
  it('registers a draft navigation guard and requires an explicit discard',async()=>{
    let guard:((proceed:()=>void)=>void)|null=null;
    const register=(next:typeof guard)=>{guard=next;};
    const tree=await render(FREE,{registerDraftGuard:register});
    const input=tree.root.find(node=>node.props.returnKeyType==='send');
    act(()=>input.props.onChangeText('unsent Chat text'));
    const leave=jest.fn(),alert=jest.spyOn(Alert,'alert');
    act(()=>guard?.(leave));expect(leave).not.toHaveBeenCalled();
    const buttons=alert.mock.calls[0][2]!;expect(buttons[0].style).toBe('cancel');
    act(()=>buttons[1].onPress?.());expect(leave).toHaveBeenCalledTimes(1);
    expect(tree.root.find(node=>node.props.returnKeyType==='send').props.value).toBe('');
    act(()=>tree.unmount());expect(guard).toBeNull();
  });
  it('hands speech to the composer with keep/replace and never automatically sends',async()=>{
    const tree=await render(FREE);const handled=jest.fn(),alert=jest.spyOn(Alert,'alert');
    act(()=>tree.root.find(node=>node.props.returnKeyType==='send').props.onChangeText('typed text'));
    act(()=>tree.update(<ChatScreen userId={FREE} refreshTrigger={0} onRefresh={jest.fn()} speechDraft={{id:'speech-one',userId:FREE,text:'spoken text',onHandled:handled}}/>));
    act(()=>alert.mock.calls[0][2]![0].onPress?.());
    expect(handled).toHaveBeenCalledWith(false);
    expect(tree.root.find(node=>node.props.returnKeyType==='send').props.value).toBe('typed text');
    act(()=>tree.update(<ChatScreen userId={FREE} refreshTrigger={0} onRefresh={jest.fn()} speechDraft={{id:'speech-two',userId:FREE,text:'spoken text',onHandled:handled}}/>));
    act(()=>alert.mock.calls[1][2]![1].onPress?.());
    expect(tree.root.find(node=>node.props.returnKeyType==='send').props.value).toBe('spoken text');
    expect(chatStore.getMessages(FREE)).toHaveLength(0);
    act(()=>tree.unmount());
  });

  it('keeps an initial speech handoff editable on a newly opened Chat screen',async()=>{
    const handled=jest.fn();const tree=await render(FREE,{speechDraft:{id:'new-screen',userId:FREE,text:'note: editable handoff',onHandled:handled}});
    expect(tree.root.find(node=>node.props.returnKeyType==='send').props.value).toBe('note: editable handoff');
    expect(handled).toHaveBeenCalledWith(true);
    expect(chatStore.getMessages(FREE)).toHaveLength(0);
    act(()=>tree.unmount());
  });

  it('loads the newest history page and earlier messages only on request',async()=>{
    const sessionId=chatStore.ensureDefaultSession(FREE),now=new Date().toISOString();
    for(let i=0;i<65;i++)db.executeSync('INSERT INTO messages(id,session_id,sender,content,created_at,updated_at) VALUES(?,?,?,?,?,?)',[`page-${String(i).padStart(3,'0')}`,sessionId,'user',`Synthetic ${i}`,now,now]);
    const full=jest.spyOn(chatStore,'getMessages');const tree=await render(FREE);
    const list=tree.root.find(node=>Array.isArray(node.props.data)&&typeof node.props.renderItem==='function');
    expect(list.props.data).toHaveLength(50);expect(full).not.toHaveBeenCalled();
    act(()=>byLabel(tree,'Load earlier messages').props.onPress());
    const loaded=tree.root.find(node=>Array.isArray(node.props.data)&&typeof node.props.renderItem==='function').props.data as Array<{id:string}>;
    expect(loaded).toHaveLength(65);expect(new Set(loaded.map(message=>message.id)).size).toBe(65);
    act(()=>tree.unmount());
  });

  it('answers actual local tasks before any online Chat request',async()=>{
    db.executeSync('DELETE FROM tasks');
    const now=new Date().toISOString(),date=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
    db.executeSync('INSERT INTO tasks(id,user_id,title,due_date,due_time,is_completed,priority,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',['live-query',PRO,'Actual local quiz',date,'09:00',0,'Medium','Work',now,now]);
    const request=serve({'/v1/ai/handbook/status':{enabled:false,functional:false,passages:0}});
    const tree=await render(PRO);await send(tree,'What are my tasks today?');
    expect(chatStore.getMessages(PRO).at(-1)?.content).toContain('Actual local quiz');
    expect(request.mock.calls.some(call=>call[0]==='/v1/ai/chat')).toBe(false);
    act(()=>tree.unmount());
  });
  it('selects a command-guide example into the draft without sending it',async()=>{
    const tree=await render(FREE);act(()=>byLabel(tree,'Command guide').props.onPress());
    act(()=>byLabel(tree,'Use example: Show agenda tomorrow').props.onPress());
    expect(tree.root.find(node=>node.props.returnKeyType==='send').props.value).toBe('Show agenda tomorrow');
    expect(chatStore.getMessages(FREE)).toHaveLength(0);
    act(()=>tree.unmount());
  });

  it('routes untimed creation and exact deletion through explicit Chat reviews',async()=>{
    db.executeSync('DELETE FROM active_session');db.executeSync('DELETE FROM tasks');
    const now=new Date().toISOString();db.executeSync('INSERT INTO active_session(user_id,created_at,updated_at) VALUES(?,?,?)',[FREE,now,now]);
    const tree=await render(FREE);await send(tree,'Add task Read chapter 5');
    expect(db.executeSync('SELECT id FROM tasks WHERE user_id=?',[FREE]).rows).toHaveLength(0);
    act(()=>byLabel(tree,'Confirm command').props.onPress());
    expect(db.executeSync('SELECT due_date,due_time FROM tasks WHERE user_id=?',[FREE]).rows[0]).toMatchObject({due_date:null,due_time:null});
    await send(tree,'Delete task "Read chapter 5"');
    expect(db.executeSync('SELECT deleted_at FROM tasks WHERE user_id=?',[FREE]).rows[0].deleted_at).toBeNull();
    act(()=>byLabel(tree,'Confirm command').props.onPress());
    expect(db.executeSync('SELECT deleted_at FROM tasks WHERE user_id=?',[FREE]).rows[0].deleted_at).not.toBeNull();
    act(()=>tree.unmount());
  });

});
