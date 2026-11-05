import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {ScrollView} from 'react-native';
import type {Task} from '../../src/storage';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {WeekView} from '../../src/ui/screens/calendar/components/WeekView';
import {getWeekDays} from '../../src/ui/screens/calendar/utils/calendarHelpers';
import type {useCalendarData} from '../../src/ui/screens/calendar/hooks/useCalendarData';

jest.mock('react-native/Libraries/Modal/Modal',()=>({__esModule:true,default:({visible,children}:{visible:boolean;children:React.ReactNode})=>visible?children:null}));
jest.mock('@react-native-community/datetimepicker',()=>({__esModule:true,default:()=>null}));
jest.mock('../../src/ui/screens/calendar/components/DayView',()=>({DayView:()=>null}));

const overdue={id:'late',userId:'u',title:'A long overdue laboratory report that needs a second line',dueDate:'2026-11-01',dueTime:'09:00',isCompleted:false,priority:'Medium',category:'Work'} as Task;

describe('Calendar week view',()=>{
  const selected=new Date(2026,10,5);
  const handlers={onEditTask:jest.fn(),onEditEvent:jest.fn(),onEditBlock:jest.fn(),onToggleTask:jest.fn(),onMarkOverdueDone:jest.fn(),onAddBlock:jest.fn(),onRescheduleTask:jest.fn(),onEditTaskSeries:jest.fn(),onCallAboutTask:jest.fn()};
  let tree:Renderer.ReactTestRenderer;
  const render=(monday:boolean,tasks:Task[]=[])=>{
    const calendar={getOverdueTasks:()=>tasks,batches:[],visibilityMap:{}} as unknown as ReturnType<typeof useCalendarData>;
    act(()=>{tree=Renderer.create(<ThemeProvider userId="u"><WeekView calendar={calendar} selectedDate={selected} setSelectedDate={jest.fn()} weekDays={getWeekDays(selected,monday)} timeFormat24h={false} getCategoryColor={()=>'#000000'} {...handlers}/></ThemeProvider>);});
  };
  const pills=()=>[...new Set(tree.root.findAll(node=>typeof node.props.accessibilityLabel==='string'&&/day, November/.test(node.props.accessibilityLabel)&&typeof node.props.onPress==='function').map(node=>node.props.accessibilityLabel as string))];
  const strip=()=>tree.root.findAll(node=>node.props.testID==='week-strip')[0];
  afterEach(()=>act(()=>tree.unmount()));

  it('fits all seven days in a row with no sideways scrolling, Saturday included',()=>{
    render(false);
    const days=pills();
    expect(days).toHaveLength(7);
    expect(days[0]).toContain('Sunday');
    expect(days[6]).toContain('Saturday');
    expect(strip().findAllByType(ScrollView)).toHaveLength(0);
    expect(tree.root.findAllByType(ScrollView).filter(node=>node.props.horizontal&&node.findAll(child=>child.props.testID==='week-strip').length>0)).toHaveLength(0);
  });
  it('follows the Monday week setting',()=>{
    render(true);
    const days=pills();
    expect(days[0]).toContain('Monday');
    expect(days[6]).toContain('Sunday');
  });
  it('opens quick actions from an overdue chip instead of the editor',()=>{
    render(false,[overdue]);
    const chip=tree.root.findAll(node=>node.props.accessibilityLabel===`Overdue task: ${overdue.title}. Show actions.`&&typeof node.props.onPress==='function')[0];
    act(()=>chip.props.onPress());
    expect(handlers.onEditTask).not.toHaveBeenCalled();
    expect(tree.root.findAll(node=>node.props.accessibilityLabel==='Reschedule'&&typeof node.props.onPress==='function').length).toBeGreaterThan(0);
    act(()=>tree.root.findAll(node=>node.props.accessibilityLabel==='Call me about it'&&typeof node.props.onPress==='function')[0].props.onPress());
    expect(handlers.onCallAboutTask).toHaveBeenCalledWith(overdue);
  });
  it('lets a long overdue title wrap instead of cutting it to one line',()=>{
    render(false,[overdue]);
    const title=tree.root.findAll(node=>node.props.children===overdue.title&&typeof node.props.numberOfLines==='number')[0];
    expect(title.props.numberOfLines).toBe(2);
  });
});
