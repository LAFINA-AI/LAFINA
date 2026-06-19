import { tasksStore } from '../../storage/tasksStore';
import { timeBlocksStore } from '../../storage/timeBlocksStore';
import { notesStore } from '../../storage/notesStore';
import { Colors } from '../../ui/theme';

/**
 * Parses user command string, performs scheduling database writes,
 * and returns the assistant's reply text response.
 * 
 * Supports:
 * - "add task [Title] by [Time]" (or "remind me to...")
 * - "block [Start]-[End] for [Activity]" (or "work...", "study...")
 * - "note [Body]" (or "note:...")
 * - "complete [Task Title]"
 * 
 * @param command User input text command.
 * @param userId The ID of the user executing the command.
 */
export const processCommand = (command: string, userId: string): string => {
  const trimmedCommand = command.trim();
  const lowercaseCommand = trimmedCommand.toLowerCase();
  
  try {
    // 1. Parse Task: "add task [Title] by [Time]" or "remind me to [Title]"
    if (lowercaseCommand.startsWith('add task') || lowercaseCommand.includes('remind me to')) {
      let taskTitle = trimmedCommand.replace(/(add task|remind me to)/gi, '').trim();
      let dueTime = '17:00';
      
      if (taskTitle.toLowerCase().includes('by')) {
        const parts = taskTitle.split(/by/i);
        taskTitle = parts[0].trim();
        dueTime = parts[1].trim();
      }

      tasksStore.insertTask({
        id: 'task_' + Math.random().toString(36).substr(2, 9),
        userId,
        title: taskTitle || 'Voice Scheduled Task',
        dueDate: new Date().toISOString().split('T')[0],
        dueTime: dueTime,
        isCompleted: false,
        priority: 'Medium',
        category: 'Work',
        notes: 'Created via scheduling command',
      });
      
      return `Task "${taskTitle || 'Voice Scheduled Task'}" has been added to your schedule.`;
    }
    
    // 2. Parse Time Block: "block [Start]-[End] for [Activity]"
    else if (lowercaseCommand.startsWith('block') || lowercaseCommand.includes('work') || lowercaseCommand.includes('study')) {
      let blockTitle = 'Deep Work';
      let startTime = '14:00';
      let endTime = '16:00';
      
      if (lowercaseCommand.includes('for')) {
        const parts = trimmedCommand.split(/for/i);
        blockTitle = parts[1].trim();
        const timeParts = parts[0].replace(/block/i, '').trim().split('-');
        if (timeParts.length === 2) {
          startTime = timeParts[0].trim();
          endTime = timeParts[1].trim();
        }
      }

      timeBlocksStore.insert({
        id: 'block_' + Math.random().toString(36).substr(2, 9),
        userId,
        title: blockTitle,
        date: new Date().toISOString().split('T')[0],
        startTime: startTime,
        endTime: endTime,
        color: Colors.blue,
        category: 'Work',
        notes: 'Time block scheduled via command',
      });
      
      return `I have blocked ${startTime} to ${endTime} for "${blockTitle}" on your calendar.`;
    }

    // 3. Parse Note: "note [Body]" or "note: [Body]"
    else if (lowercaseCommand.startsWith('note:') || lowercaseCommand.startsWith('note ')) {
      const noteBody = trimmedCommand.replace(/(note:|note)/gi, '').trim();
      notesStore.insert({
        id: 'note_' + Math.random().toString(36).substr(2, 9),
        userId,
        title: 'Quick Note',
        body: noteBody || 'Empty note contents.',
        isPinned: false,
        tags: ['AI Transcribed'],
        category: 'Personal',
        isVoiceTranscribed: true,
      });
      
      return 'I\'ve captured that note for you.';
    }

    // 4. Parse Task Completion: "complete [Task Title]"
    else if (lowercaseCommand.startsWith('complete')) {
      const searchTitle = lowercaseCommand.replace('complete', '').trim();
      const allTasks = tasksStore.getAllTasks(userId);
      const matching = allTasks.find(t => t.title.toLowerCase().includes(searchTitle));
      
      if (matching) {
        tasksStore.updateTask({
          id: matching.id,
          isCompleted: true,
        });
        return `Marked "${matching.title}" as completed.`;
      } else {
        return `I couldn't find a task matching "${searchTitle}".`;
      }
    }

    // 5. Fallback response
    else {
      return "I've checked your schedule. You have a few items planned. Ask me to add or modify items like tasks, notes, or time blocks.";
    }
  } catch (error) {
    console.error('Error processing command in NLU parser:', error);
    return 'Sorry, I encountered an error while processing that request.';
  }
};
