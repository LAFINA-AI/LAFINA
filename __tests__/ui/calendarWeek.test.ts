import {baseOccurrenceId,getWeekDays} from '../../src/ui/screens/calendar/utils/calendarHelpers';
import {formatLocalDate,initialScrollMinutes} from '../../src/ui/screens/calendar/utils/timeGridLayout';

const labels=(date:Date,monday:boolean)=>getWeekDays(date,monday).map(formatLocalDate);

describe('calendar week strip',()=>{
  it('starts on Sunday by default and always holds the selected day',()=>{
    // Thursday 5 Nov 2026
    expect(labels(new Date(2026,10,5),false)).toEqual(['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07']);
  });
  it('starts on Monday when that setting is on',()=>{
    expect(labels(new Date(2026,10,5),true)).toEqual(['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
  });
  it('puts a Sunday last, not first, in a Monday week',()=>{
    expect(labels(new Date(2026,10,8),true)[6]).toBe('2026-11-08');
    expect(labels(new Date(2026,10,8),false)[0]).toBe('2026-11-08');
  });
  it('crosses month and year boundaries',()=>{
    expect(labels(new Date(2026,11,31),false)).toEqual(['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
    expect(labels(new Date(2027,2,1),true)[0]).toBe('2027-03-01');
  });
  it('does not re-centre when another day in the same week is chosen',()=>{
    expect(labels(new Date(2026,10,1),false)).toEqual(labels(new Date(2026,10,7),false));
  });
  it('returns local midnights whatever the time of the selected date',()=>{
    for(const day of getWeekDays(new Date(2026,10,5,23,59),false))expect(day.getHours()).toBe(0);
  });
});

describe('recurring occurrence IDs',()=>{
  it('resolves an occurrence to its stored row and leaves other IDs alone',()=>{
    expect(baseOccurrenceId('block-1_occur_2026-11-05')).toBe('block-1');
    expect(baseOccurrenceId('block-1')).toBe('block-1');
  });
});

describe('where a day opens',()=>{
  it('opens today an hour above the current-time line',()=>{
    expect(initialScrollMinutes(new Date(2026,10,5),new Date(2026,10,5,14,30))).toBe(13*60+30);
  });
  it('does not scroll above midnight early in the day',()=>{
    expect(initialScrollMinutes(new Date(2026,10,5),new Date(2026,10,5,0,20))).toBe(0);
  });
  it('opens other days at 7 AM',()=>{
    expect(initialScrollMinutes(new Date(2026,10,6),new Date(2026,10,5,14,30))).toBe(7*60);
  });
});
