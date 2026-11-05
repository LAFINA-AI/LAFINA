import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {Task} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {OverdueActionsSheet} from '../../src/ui/screens/calendar/components/OverdueActionsSheet';

jest.mock('react-native/Libraries/Modal/Modal',()=>({__esModule:true,default:({visible,children}:{visible:boolean;children:React.ReactNode})=>visible?children:null}));
jest.mock('@react-native-community/datetimepicker',()=>({__esModule:true,default:()=>null}));

const task=(extra:Partial<Task>={}):Task=>({id:'t1',userId:'u',title:'Submit lab report',dueDate:'2026-11-01',dueTime:'09:00',isCompleted:false,priority:'Medium',category:'Work',recurrenceRule:null,...extra} as Task);

describe('overdue quick actions',()=>{
  const handlers={onClose:jest.fn(),onReschedule:jest.fn(),onEditSeries:jest.fn(),onMarkDone:jest.fn(),onCall:jest.fn()};
  let tree:Renderer.ReactTestRenderer;
  const render=(value:Task|null)=>{act(()=>{tree=Renderer.create(<ThemeProvider userId="u"><OverdueActionsSheet task={value} {...handlers}/></ThemeProvider>);});};
  const button=(label:string)=>tree.root.findAll(node=>node.props.accessibilityLabel===label&&typeof node.props.onPress==='function')[0];
  const picker=(id:string)=>tree.root.findAll(node=>node.props.testID===id&&typeof node.props.onChange==='function')[0];
  beforeEach(()=>jest.clearAllMocks());
  afterEach(()=>act(()=>tree.unmount()));

  it('shows nothing without a task',()=>{
    render(null);
    expect(button('Reschedule')).toBeUndefined();
  });
  it('offers all three actions and shows the full title and due date',()=>{
    render(task());
    expect(button('Reschedule')).toBeDefined();
    expect(button('Mark done')).toBeDefined();
    expect(button('Call me about it')).toBeDefined();
    const text=tree.root.findAllByType(Text).map(node=>node.props.children).flat().join(' ');
    expect(text).toContain('Submit lab report');
    expect(text).toContain('Was due 2026-11-01 at 09:00');
  });
  it('marks done and calls for the exact task, closing the sheet first',()=>{
    const value=task();
    render(value);
    act(()=>button('Mark done').props.onPress());
    expect(handlers.onMarkDone).toHaveBeenCalledWith(value);
    act(()=>button('Call me about it').props.onPress());
    expect(handlers.onCall).toHaveBeenCalledWith(value);
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });
  it('reschedules a timed task through the date then time pickers',()=>{
    const value=task();
    render(value);
    act(()=>button('Reschedule').props.onPress());
    act(()=>picker('overdue-date-picker').props.onChange({type:'set'},new Date(2026,10,20)));
    expect(handlers.onReschedule).not.toHaveBeenCalled();
    act(()=>picker('overdue-time-picker').props.onChange({type:'set'},new Date(2026,10,20,14,5)));
    expect(handlers.onReschedule).toHaveBeenCalledWith(value,'2026-11-20','14:05');
    expect(picker('overdue-time-picker')).toBeUndefined();
  });
  it('keeps a date-only task date-only',()=>{
    const value=task({dueTime:null});
    render(value);
    act(()=>button('Reschedule').props.onPress());
    act(()=>picker('overdue-date-picker').props.onChange({type:'set'},new Date(2026,10,20)));
    expect(handlers.onReschedule).toHaveBeenCalledWith(value,'2026-11-20',null);
  });
  it('changes nothing when a picker is dismissed',()=>{
    render(task());
    act(()=>button('Reschedule').props.onPress());
    act(()=>picker('overdue-date-picker').props.onChange({type:'dismissed'},undefined));
    expect(handlers.onReschedule).not.toHaveBeenCalled();
    expect(picker('overdue-date-picker')).toBeUndefined();
  });
  it('sends a repeating task to the series editor instead of moving or completing one occurrence',()=>{
    const value=task({id:'t1_occur_2026-11-01',recurrenceRule:'FREQ=WEEKLY'});
    render(value);
    expect(button('Reschedule')).toBeUndefined();
    expect(button('Mark done')).toBeUndefined();
    expect(button('Call me about it')).toBeDefined();
    act(()=>button('Edit series').props.onPress());
    expect(handlers.onEditSeries).toHaveBeenCalledWith(value);
  });
});
