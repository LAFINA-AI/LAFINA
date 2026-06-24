import { Task, Event } from './tasksStore';
import { TimeBlock } from './timeBlocksStore';

/**
 * Escapes special characters for iCalendar format values.
 * RFC 5545 requires escaping backslashes, commas, semicolons, and newlines.
 * 
 * @param text The raw string to escape.
 * @returns The escaped string.
 */
const escapeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
};

/**
 * Unescapes special characters from iCalendar format values.
 * 
 * @param text The escaped iCalendar string.
 * @returns The unescaped raw string.
 */
const unescapeText = (text: string): string => {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
};

/**
 * Formats a YYYY-MM-DD date and HH:MM time into an iCalendar date-time string (YYYYMMDDThhmmss).
 * If time is not provided, formats as date-only (YYYYMMDD).
 * 
 * @param date YYYY-MM-DD date string.
 * @param time Optional HH:MM time string.
 * @returns iCalendar formatted string.
 */
const formatIcsDateTime = (date: string, time?: string | null): string => {
  const cleanDate = date.replace(/-/g, '');
  if (!time) {
    return cleanDate;
  }
  const cleanTime = time.replace(/:/g, '');
  return `${cleanDate}T${cleanTime}00`;
};

/**
 * Parses an iCalendar date or date-time string into a structured date (YYYY-MM-DD) and time (HH:MM).
 * Handles formats: YYYYMMDD, YYYYMMDDThhmmss, YYYYMMDDThhmmssZ.
 * 
 * @param icsValue The raw iCalendar datetime value.
 * @returns An object with date and optional time.
 */
const parseIcsDateTime = (icsValue: string): { date: string; time?: string } => {
  // Strip any trailing Z (UTC identifier) or extra text
  const clean = icsValue.trim().replace(/Z$/, '');
  
  if (clean.includes('T')) {
    const [datePart, timePart] = clean.split('T');
    if (/^\d{8}$/.test(datePart) && timePart.length >= 4) {
      const year = datePart.substring(0, 4);
      const month = datePart.substring(4, 6);
      const day = datePart.substring(6, 8);
      const hour = timePart.substring(0, 2);
      const minute = timePart.substring(2, 4);
      return {
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}`,
      };
    }
  }
  
  if (/^\d{8}$/.test(clean)) {
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    return {
      date: `${year}-${month}-${day}`,
    };
  }
  
  // Fallback to today if format is unrecognized
  const todayStr = new Date().toISOString().split('T')[0];
  return { date: todayStr };
};

/**
 * Folds a line to a maximum of 75 octets as specified in RFC 5545.
 * Folds by inserting a CRLF and a single space character.
 * 
 * @param line The line of text to fold.
 * @returns The folded line string.
 */
const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  
  let result = '';
  let remaining = line;
  
  // First chunk can be up to 75 characters
  result += remaining.substring(0, 75);
  remaining = remaining.substring(75);
  
  // Subsequent chunks can be up to 74 characters (because of the leading space)
  while (remaining.length > 0) {
    result += '\r\n ' + remaining.substring(0, 74);
    remaining = remaining.substring(74);
  }
  
  return result;
};

/**
 * Generates an iCalendar RFC 5545 compliant string for events, time blocks, and tasks.
 * 
 * @param events List of calendar events.
 * @param blocks List of schedule/time blocks.
 * @param tasks List of tasks.
 * @returns iCalendar formatted string.
 */
export const generateIcsString = (
  events: Event[],
  blocks: TimeBlock[],
  tasks: Task[]
): string => {
  const nowFormatted = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LAFINA//NONSGML Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];

  // 1. Export Events
  events.forEach((event) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}`);
    lines.push(`DTSTAMP:${nowFormatted}`);
    lines.push(`DTSTART:${formatIcsDateTime(event.date, event.startTime)}`);
    lines.push(`DTEND:${formatIcsDateTime(event.date, event.endTime)}`);
    lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`));
    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeText(event.location)}`));
    }
    if (event.recurrenceRule) {
      lines.push(`RRULE:${event.recurrenceRule}`);
    }
    lines.push('X-LAFINA-TYPE:event');
    lines.push('END:VEVENT');
  });

  // 2. Export Time Blocks
  blocks.forEach((block) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${block.id}`);
    lines.push(`DTSTAMP:${nowFormatted}`);
    lines.push(`DTSTART:${formatIcsDateTime(block.date, block.startTime)}`);
    lines.push(`DTEND:${formatIcsDateTime(block.date, block.endTime)}`);
    lines.push(foldLine(`SUMMARY:${escapeText(block.title)}`));
    if (block.notes) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(block.notes)}`));
    }
    lines.push(foldLine(`CATEGORIES:${escapeText(block.category)}`));
    lines.push(`X-LAFINA-COLOR:${block.color}`);
    if (block.recurrenceRule) {
      lines.push(`RRULE:${block.recurrenceRule}`);
    }
    lines.push('X-LAFINA-TYPE:time_block');
    lines.push('END:VEVENT');
  });

  // 3. Export Tasks
  tasks.forEach((task) => {
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${task.id}`);
    lines.push(`DTSTAMP:${nowFormatted}`);
    if (task.dueDate) {
      const dt = formatIcsDateTime(task.dueDate, task.dueTime);
      if (task.dueTime) {
        lines.push(`DUE:${dt}`);
      } else {
        lines.push(`DUE;VALUE=DATE:${dt}`);
      }
    }
    lines.push(foldLine(`SUMMARY:${escapeText(task.title)}`));
    if (task.notes) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(task.notes)}`));
    }
    lines.push(foldLine(`CATEGORIES:${escapeText(task.category)}`));
    lines.push(`STATUS:${task.isCompleted ? 'COMPLETED' : 'NEEDS-ACTION'}`);
    
    // Priority mapping: High -> 1, Medium -> 5, Low -> 9
    const priorityNum = task.priority === 'High' ? 1 : task.priority === 'Medium' ? 5 : 9;
    lines.push(`PRIORITY:${priorityNum}`);
    if (task.recurrenceRule) {
      lines.push(`RRULE:${task.recurrenceRule}`);
    }
    lines.push('X-LAFINA-TYPE:task');
    lines.push('END:VTODO');
  });

  lines.push('END:VCALENDAR');
  
  // Join lines with CRLF as required by RFC 5545
  return lines.join('\r\n') + '\r\n';
};

/**
 * Parses an iCalendar string back into LAFINA tasks, events, and time blocks.
 * Supports unfolding lines and parsing custom properties.
 * 
 * @param icsContent The iCalendar file content string.
 * @returns Parsed events, time blocks, and tasks.
 */
export const parseIcsString = (
  icsContent: string
): {
  events: Omit<Event, 'userId' | 'createdAt' | 'updatedAt'>[];
  blocks: Omit<TimeBlock, 'userId' | 'createdAt' | 'updatedAt'>[];
  tasks: Omit<Task, 'userId' | 'createdAt' | 'updatedAt'>[];
} => {
  const events: Omit<Event, 'userId' | 'createdAt' | 'updatedAt'>[] = [];
  const blocks: Omit<TimeBlock, 'userId' | 'createdAt' | 'updatedAt'>[] = [];
  const tasks: Omit<Task, 'userId' | 'createdAt' | 'updatedAt'>[] = [];

  // Step 1: Unfold lines (lines starting with space/tab are continuation of previous line)
  const unfoldedLines: string[] = [];
  const rawLines = icsContent.split(/\r?\n/);
  
  for (const line of rawLines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfoldedLines.length > 0) {
        unfoldedLines[unfoldedLines.length - 1] += line.substring(1);
      }
    } else if (line.trim().length > 0) {
      unfoldedLines.push(line);
    }
  }

  // State tracker for parsing
  let currentComponent: 'VEVENT' | 'VTODO' | null = null;
  let componentData: { [key: string]: string } = {};

  for (const line of unfoldedLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const fullKey = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);

    // Get the base property name by splitting off any parameters (e.g. DUE;VALUE=DATE)
    const baseKey = fullKey.split(';')[0].toUpperCase();

    if (baseKey === 'BEGIN') {
      const compType = value.toUpperCase();
      if (compType === 'VEVENT' || compType === 'VTODO') {
        currentComponent = compType as any;
        componentData = {};
      }
    } else if (baseKey === 'END') {
      const compType = value.toUpperCase();
      if (compType === 'VEVENT' && currentComponent === 'VEVENT') {
        // Distinguish VEVENT between regular Event and TimeBlock
        const type = componentData['X-LAFINA-TYPE'] || 'event';
        const uid = componentData['UID'] || 'imported_' + Math.random().toString(36).substring(2, 9);
        const summary = unescapeText(componentData['SUMMARY'] || 'Untitled Event');
        const dtstart = componentData['DTSTART'] || '';
        const dtend = componentData['DTEND'] || '';
        const rrule = componentData['RRULE'] || null;

        const startParsed = parseIcsDateTime(dtstart);
        const endParsed = parseIcsDateTime(dtend);

        if (type === 'time_block') {
          blocks.push({
            id: uid,
            title: summary,
            date: startParsed.date,
            startTime: startParsed.time || '09:00',
            endTime: endParsed.time || '10:00',
            color: componentData['X-LAFINA-COLOR'] || '#2196F3',
            category: unescapeText(componentData['CATEGORIES'] || 'Work'),
            notes: componentData['DESCRIPTION'] ? unescapeText(componentData['DESCRIPTION']) : undefined,
            recurrenceRule: rrule,
          });
        } else {
          events.push({
            id: uid,
            title: summary,
            date: startParsed.date,
            startTime: startParsed.time || '12:00',
            endTime: endParsed.time || '13:00',
            location: componentData['LOCATION'] ? unescapeText(componentData['LOCATION']) : null,
            recurrenceRule: rrule,
          });
        }
        currentComponent = null;
      } else if (compType === 'VTODO' && currentComponent === 'VTODO') {
        const uid = componentData['UID'] || 'imported_' + Math.random().toString(36).substring(2, 9);
        const summary = unescapeText(componentData['SUMMARY'] || 'Untitled Task');
        const description = componentData['DESCRIPTION'] ? unescapeText(componentData['DESCRIPTION']) : null;
        const categories = unescapeText(componentData['CATEGORIES'] || 'General');
        const status = componentData['STATUS'] || 'NEEDS-ACTION';
        const priorityVal = parseInt(componentData['PRIORITY'] || '5', 10);
        const dueVal = componentData['DUE'] || '';
        const rrule = componentData['RRULE'] || null;

        let priority: 'High' | 'Medium' | 'Low' = 'Medium';
        if (priorityVal > 0 && priorityVal <= 4) priority = 'High';
        else if (priorityVal >= 5 && priorityVal <= 8) priority = 'Medium';
        else if (priorityVal >= 9) priority = 'Low';

        let dueDate: string | null = null;
        let dueTime: string | null = null;
        if (dueVal) {
          const dueParsed = parseIcsDateTime(dueVal);
          dueDate = dueParsed.date;
          dueTime = dueParsed.time || null;
        }

        tasks.push({
          id: uid,
          title: summary,
          dueDate,
          dueTime,
          isCompleted: status.toUpperCase() === 'COMPLETED',
          priority,
          category: categories,
          notes: description,
          recurrenceRule: rrule,
        });
        currentComponent = null;
      }
    } else if (currentComponent) {
      // Store fields for the current component
      componentData[baseKey] = value;
    }
  }

  return { events, blocks, tasks };
};
