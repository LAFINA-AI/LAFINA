import { generateIcsString, parseIcsString } from '../../src/storage/icsHelper';
import { Event, Task } from '../../src/storage/tasksStore';
import { TimeBlock } from '../../src/storage/timeBlocksStore';

describe('icsHelper', () => {
  const mockEvents: Event[] = [
    {
      id: 'event_1',
      userId: 'user_abc',
      title: 'Class Lecture: Intro to Programming',
      date: '2026-06-25',
      startTime: '09:00',
      endTime: '10:30',
      location: 'USTP CDO Room 304',
      createdAt: '2026-06-24T12:00:00Z',
      updatedAt: '2026-06-24T12:00:00Z',
    },
    {
      id: 'event_2',
      userId: 'user_abc',
      title: 'Lunch with Group Partners, discuss thesis',
      date: '2026-06-25',
      startTime: '12:00',
      endTime: '13:00',
      location: null,
      createdAt: '2026-06-24T12:00:00Z',
      updatedAt: '2026-06-24T12:00:00Z',
    },
  ];

  const mockBlocks: TimeBlock[] = [
    {
      id: 'block_1',
      userId: 'user_abc',
      title: 'Study Session',
      date: '2026-06-25',
      startTime: '14:00',
      endTime: '16:00',
      color: '#FF5722',
      category: 'Studies',
      notes: 'Prepare for midterms.',
      createdAt: '2026-06-24T12:00:00Z',
      updatedAt: '2026-06-24T12:00:00Z',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task_1',
      userId: 'user_abc',
      title: 'Submit Homework 3; Math & Science',
      dueDate: '2026-06-26',
      dueTime: '23:59',
      isCompleted: false,
      priority: 'High',
      category: 'Assignments',
      notes: 'Upload PDF to LMS.',
      createdAt: '2026-06-24T12:00:00Z',
      updatedAt: '2026-06-24T12:00:00Z',
    },
    {
      id: 'task_2',
      userId: 'user_abc',
      title: 'Buy project supplies, notebooks',
      dueDate: '2026-06-27',
      dueTime: null,
      isCompleted: true,
      priority: 'Low',
      category: 'Personal',
      notes: '',
      createdAt: '2026-06-24T12:00:00Z',
      updatedAt: '2026-06-24T12:00:00Z',
    },
  ];

  test('should generate a valid iCalendar string containing events, time blocks, and tasks', () => {
    const icsString = generateIcsString(mockEvents, mockBlocks, mockTasks);

    expect(icsString).toContain('BEGIN:VCALENDAR');
    expect(icsString).toContain('VERSION:2.0');
    expect(icsString).toContain('PRODID:-//LAFINA//NONSGML Calendar//EN');

    // Verify Events
    expect(icsString).toContain('BEGIN:VEVENT');
    expect(icsString).toContain('UID:event_1');
    expect(icsString).toContain('DTSTART:20260625T090000');
    expect(icsString).toContain('DTEND:20260625T103000');
    expect(icsString).toContain('SUMMARY:Class Lecture: Intro to Programming');
    expect(icsString).toContain('LOCATION:USTP CDO Room 304');
    expect(icsString).toContain('X-LAFINA-TYPE:event');

    // Verify Time Blocks
    expect(icsString).toContain('UID:block_1');
    expect(icsString).toContain('DTSTART:20260625T140000');
    expect(icsString).toContain('DTEND:20260625T160000');
    expect(icsString).toContain('SUMMARY:Study Session');
    expect(icsString).toContain('DESCRIPTION:Prepare for midterms.');
    expect(icsString).toContain('CATEGORIES:Studies');
    expect(icsString).toContain('X-LAFINA-COLOR:#FF5722');
    expect(icsString).toContain('X-LAFINA-TYPE:time_block');

    // Verify Tasks
    expect(icsString).toContain('BEGIN:VTODO');
    expect(icsString).toContain('UID:task_1');
    expect(icsString).toContain('DUE:20260626T235900');
    expect(icsString).toContain('SUMMARY:Submit Homework 3\\; Math & Science'); // Semicolon escaped, ampersand literal
    expect(icsString).toContain('STATUS:NEEDS-ACTION');
    expect(icsString).toContain('PRIORITY:1'); // High Priority -> 1

    expect(icsString).toContain('UID:task_2');
    expect(icsString).toContain('DUE;VALUE=DATE:20260627');
    expect(icsString).toContain('SUMMARY:Buy project supplies\\, notebooks'); // Comma escaped
    expect(icsString).toContain('STATUS:COMPLETED');
    expect(icsString).toContain('PRIORITY:9'); // Low Priority -> 9

    expect(icsString).toContain('END:VCALENDAR');
  });

  test('should parse generated iCalendar string correctly back to local models', () => {
    const icsString = generateIcsString(mockEvents, mockBlocks, mockTasks);
    const parsed = parseIcsString(icsString);

    expect(parsed.events).toHaveLength(2);
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.tasks).toHaveLength(2);

    // Event 1
    const ev1 = parsed.events.find(e => e.id === 'event_1');
    expect(ev1).toBeDefined();
    expect(ev1!.title).toBe('Class Lecture: Intro to Programming');
    expect(ev1!.date).toBe('2026-06-25');
    expect(ev1!.startTime).toBe('09:00');
    expect(ev1!.endTime).toBe('10:30');
    expect(ev1!.location).toBe('USTP CDO Room 304');

    // Event 2
    const ev2 = parsed.events.find(e => e.id === 'event_2');
    expect(ev2).toBeDefined();
    expect(ev2!.location).toBeNull();

    // Block 1
    const bl1 = parsed.blocks.find(b => b.id === 'block_1');
    expect(bl1).toBeDefined();
    expect(bl1!.title).toBe('Study Session');
    expect(bl1!.date).toBe('2026-06-25');
    expect(bl1!.startTime).toBe('14:00');
    expect(bl1!.endTime).toBe('16:00');
    expect(bl1!.color).toBe('#FF5722');
    expect(bl1!.category).toBe('Studies');
    expect(bl1!.notes).toBe('Prepare for midterms.');

    // Task 1
    const tk1 = parsed.tasks.find(t => t.id === 'task_1');
    expect(tk1).toBeDefined();
    expect(tk1!.title).toBe('Submit Homework 3; Math & Science'); // Unescaped
    expect(tk1!.dueDate).toBe('2026-06-26');
    expect(tk1!.dueTime).toBe('23:59');
    expect(tk1!.isCompleted).toBe(false);
    expect(tk1!.priority).toBe('High');
    expect(tk1!.category).toBe('Assignments');
    expect(tk1!.notes).toBe('Upload PDF to LMS.');

    // Task 2
    const tk2 = parsed.tasks.find(t => t.id === 'task_2');
    expect(tk2).toBeDefined();
    expect(tk2!.title).toBe('Buy project supplies, notebooks'); // Unescaped
    expect(tk2!.dueDate).toBe('2026-06-27');
    expect(tk2!.dueTime).toBeNull();
    expect(tk2!.isCompleted).toBe(true);
    expect(tk2!.priority).toBe('Low');
    expect(tk2!.category).toBe('Personal');
    expect(tk2!.notes).toBeNull();
  });

  test('should handle unfolded lines in parsing', () => {
    const foldedIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:folded_event',
      'SUMMARY:This is a very long event title that will be folded across multipl',
      ' e lines in the exported file according to RFC 5545 standard rules',
      'DTSTART:20260625T100000',
      'DTEND:20260625T110000',
      'X-LAFINA-TYPE:event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const parsed = parseIcsString(foldedIcs);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].title).toBe('This is a very long event title that will be folded across multiple lines in the exported file according to RFC 5545 standard rules');
  });

  test('should handle empty lists gracefully', () => {
    const icsString = generateIcsString([], [], []);
    const parsed = parseIcsString(icsString);

    expect(parsed.events).toHaveLength(0);
    expect(parsed.blocks).toHaveLength(0);
    expect(parsed.tasks).toHaveLength(0);
  });

  test('should parse default fallback for unrecognized datetime', () => {
    const badIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:bad_event',
      'SUMMARY:Test Event',
      'DTSTART:BAD_DATETIME_FORMAT',
      'DTEND:BAD_DATETIME_FORMAT',
      'X-LAFINA-TYPE:event',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const parsed = parseIcsString(badIcs);
    expect(parsed.events).toHaveLength(1);
    // Should fall back to today's date
    const todayStr = new Date().toISOString().split('T')[0];
    expect(parsed.events[0].date).toBe(todayStr);
  });
});
