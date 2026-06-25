import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert, Animated, LayoutAnimation, UIManager } from 'react-native';
import type { Note } from '../../../../storage';
import { notesStore, tasksStore } from '../../../../storage';
import { FilterType } from '../types';
import { generateId } from '../../../../utils';

// Enable LayoutAnimation on Android
if (UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Smooth spring-like LayoutAnimation preset for swap transitions */
const swapAnimation = {
  duration: 300,
  create: {
    type: LayoutAnimation.Types.spring,
    property: LayoutAnimation.Properties.scaleXY,
    springDamping: 0.7,
  },
  update: {
    type: LayoutAnimation.Types.spring,
    springDamping: 0.7,
  },
};

interface UseNotesDataOptions {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

export const useNotesData = (options: UseNotesDataOptions) => {
  const { userId, refreshTrigger, onRefresh } = options;

  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('All');
  const [isGridView, setIsGridView] = useState(true);

  // Editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState('Personal');
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);
  const [isVoice, setIsVoice] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragXRef = useRef(new Animated.Value(0));
  const dragYRef = useRef(new Animated.Value(0));
  const [renderGen, setRenderGen] = useState(0);
  const notesRef = useRef<Note[]>(notes);
  const activeDragIdRef = useRef<string | null>(null);
  const cardLayoutsRef = useRef<{ [id: string]: { x: number; y: number; width: number; height: number } }>({});
  const dragStartLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  notesRef.current = notes;

  // AI loading
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActionType, setAiActionType] = useState('');

  const loadNotes = useCallback(() => {
    const data = notesStore.getAll(userId);
    setNotes(data);
  }, [userId]);

  useEffect(() => {
    loadNotes();
  }, [userId, refreshTrigger, loadNotes]);

  // ── Drag lifecycle ──

  const onCardLayout = useCallback((id: string, layout: { x: number; y: number; width: number; height: number }) => {
    cardLayoutsRef.current[id] = layout;
  }, []);

  const handleDragStart = useCallback((noteId: string, _index: number) => {
    activeDragIdRef.current = noteId;
    dragOffsetRef.current = { x: 0, y: 0 };
    const layout = cardLayoutsRef.current[noteId];
    dragStartLayoutRef.current = layout ? { ...layout } : null;
    setActiveDragId(noteId);
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((dx: number, dy: number) => {
    const draggedId = activeDragIdRef.current;
    if (!draggedId) return;
    const initialLayout = dragStartLayoutRef.current;
    if (!initialLayout) return;

    const currentX = initialLayout.x + dx + dragOffsetRef.current.x;
    const currentY = initialLayout.y + dy + dragOffsetRef.current.y;

    dragXRef.current.setValue(dx + dragOffsetRef.current.x);
    dragYRef.current.setValue(dy + dragOffsetRef.current.y);

    const centerX = currentX + initialLayout.width / 2;
    const centerY = currentY + initialLayout.height / 2;

    const currentNotes = notesRef.current;
    const curIdx = currentNotes.findIndex(n => n.id === draggedId);
    if (curIdx === -1) return;

    const draggedNote = currentNotes[curIdx];
    if (!draggedNote) return;

    let targetIdx = -1;
    let minDistance = Infinity;
    const baseCenterX = initialLayout.x + dragOffsetRef.current.x + initialLayout.width / 2;
    const baseCenterY = initialLayout.y + dragOffsetRef.current.y + initialLayout.height / 2;
    const distToSelfSqr = Math.pow(centerX - baseCenterX, 2) + Math.pow(centerY - baseCenterY, 2);

    for (let i = 0; i < currentNotes.length; i++) {
      const note = currentNotes[i];
      if (note.id === draggedId || note.isPinned) continue;
      const layout = cardLayoutsRef.current[note.id];
      if (layout) {
        const d = Math.pow(centerX - (layout.x + layout.width / 2), 2) + Math.pow(centerY - (layout.y + layout.height / 2), 2);
        if (d < distToSelfSqr && d < minDistance) {
          minDistance = d;
          targetIdx = i;
        }
      }
    }

    if (targetIdx === -1 || targetIdx === curIdx) return;
    const targetNote = currentNotes[targetIdx];
    const targetLayout = cardLayoutsRef.current[targetNote.id];
    if (!targetLayout) return;

    LayoutAnimation.configureNext(swapAnimation);
    const newNotes = [...currentNotes];
    newNotes.splice(curIdx, 1);
    newNotes.splice(targetIdx, 0, draggedNote);

    const oldLayoutsMap = { ...cardLayoutsRef.current };
    for (let i = 0; i < currentNotes.length; i++) {
      const oldNote = currentNotes[i];
      const newIndex = newNotes.findIndex(n => n.id === oldNote.id);
      if (newIndex !== -1) {
        cardLayoutsRef.current[oldNote.id] = oldLayoutsMap[currentNotes[newIndex].id];
      }
    }

    notesRef.current = newNotes;
    setNotes(newNotes);

    const oldBaseX = initialLayout.x + dragOffsetRef.current.x;
    const oldBaseY = initialLayout.y + dragOffsetRef.current.y;
    dragOffsetRef.current.x += oldBaseX - targetLayout.x;
    dragOffsetRef.current.y += oldBaseY - targetLayout.y;
    dragXRef.current.setValue(dx + dragOffsetRef.current.x);
    dragYRef.current.setValue(dy + dragOffsetRef.current.y);
    dragStartLayoutRef.current = {
      x: targetLayout.x - dragOffsetRef.current.x,
      y: targetLayout.y - dragOffsetRef.current.y,
      width: initialLayout.width,
      height: initialLayout.height,
    };
  }, []);

  const handleDragEnd = useCallback(() => {
    const latestNotes = notesRef.current;
    const unpinnedNotes = latestNotes.filter(n => !n.isPinned);
    const orderUpdates = unpinnedNotes.map((note, idx) => ({ id: note.id, sortOrder: idx }));
    notesStore.updateOrder(orderUpdates);

    activeDragIdRef.current = null;
    setActiveDragId(null);
    setIsDragging(false);
    dragOffsetRef.current = { x: 0, y: 0 };
    dragStartLayoutRef.current = null;
    setRenderGen(g => g + 1);
    onRefresh();
  }, [onRefresh]);

  const handleDragRelease = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // ── Editor ──

  const openNewNote = useCallback(() => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteBody('');
    setNoteCategory('Personal');
    setNoteTags([]);
    setIsPinned(false);
    setIsVoice(false);
    setImageUri(null);
    setSelection({ start: 0, end: 0 });
    setEditorVisible(true);
  }, []);

  const openEditNote = useCallback((note: Note) => {
    if (isDragging) return;
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteCategory(note.category);
    setNoteTags(note.tags);
    setIsPinned(note.isPinned);
    setIsVoice(note.isVoiceTranscribed);
    setImageUri(note.imageUri || null);
    setSelection({ start: note.body.length, end: note.body.length });
    setEditorVisible(true);
  }, [isDragging]);

  const closeEditor = useCallback(() => setEditorVisible(false), []);

  const applyFormatting = useCallback((type: 'bold' | 'italic' | 'checklist') => {
    const { start, end } = selection;
    const before = noteBody.substring(0, start);
    const selected = noteBody.substring(start, end);
    const after = noteBody.substring(end);
    let newText = '';
    let newCursorPos = start;

    if (type === 'bold') {
      newText = start === end ? `${before}****${after}` : `${before}**${selected}**${after}`;
      newCursorPos = start === end ? start + 2 : start + 2 + selected.length + 2;
    } else if (type === 'italic') {
      newText = start === end ? `${before}**${after}` : `${before}*${selected}*${after}`;
      newCursorPos = start === end ? start + 1 : start + 1 + selected.length + 1;
    } else if (type === 'checklist') {
      const needsNewline = start > 0 && noteBody.charAt(start - 1) !== '\n';
      const prefix = needsNewline ? '\n- [ ] ' : '- [ ] ';
      newText = `${before}${prefix}${selected}${after}`;
      newCursorPos = start + prefix.length + selected.length;
    }

    setNoteBody(newText);
    setSelection({ start: newCursorPos, end: newCursorPos });
  }, [noteBody, selection]);

  const saveNote = useCallback(() => {
    if (!noteTitle.trim() && !noteBody.trim() && !imageUri) {
      setEditorVisible(false);
      return;
    }
    const titleStr = noteTitle.trim() || 'Untitled Note';

    if (editingNote) {
      notesStore.update({
        id: editingNote.id,
        title: titleStr,
        body: noteBody,
        category: noteCategory,
        isPinned: isPinned,
        tags: noteTags,
        imageUri: imageUri,
      });
    } else {
      notesStore.insert({
        id: generateId('note'),
        userId,
        title: titleStr,
        body: noteBody,
        category: noteCategory,
        isPinned: isPinned,
        tags: isVoice ? ['AI Transcribed'] : noteTags,
        isVoiceTranscribed: isVoice,
        imageUri: imageUri,
      });
    }

    setEditorVisible(false);
    loadNotes();
    onRefresh();
  }, [noteTitle, noteBody, imageUri, editingNote, noteCategory, isPinned, noteTags, isVoice, userId, loadNotes, onRefresh]);

  const deleteNote = useCallback((id: string) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        notesStore.delete(id);
        setEditorVisible(false);
        loadNotes();
        onRefresh();
      }},
    ]);
  }, [loadNotes, onRefresh]);

  const getFilteredNotes = useCallback(() => {
    return notes.filter((n) => {
      const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (selectedFilter === 'All') return true;
      if (selectedFilter === 'Pinned') return n.isPinned;
      if (selectedFilter === 'AI Transcribed') return n.isVoiceTranscribed;
      return n.category === selectedFilter;
    });
  }, [notes, searchQuery, selectedFilter]);

  const triggerAiAction = useCallback((action: 'summarize' | 'clean' | 'tasks') => {
    if (!noteBody.trim()) {
      Alert.alert('Error', 'Please enter some text in the note body first.');
      return;
    }
    setAiActionType(action);
    setAiLoading(true);

    setTimeout(() => {
      setAiLoading(false);
      if (action === 'summarize') {
        setNoteBody((prev) => prev + `\n\n--- AI SUMMARY ---\n• Key focus of this note centers on productivity details.\n• Critical path action items should be extracted and scheduled.\n------------------`);
      } else if (action === 'clean') {
        setNoteBody((prev) => {
          let cleaned = prev.replace(/\s+/g, ' ').trim();
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          return cleaned;
        });
        Alert.alert('AI Clean Up', 'Typographical spacing and layout have been refined.');
      } else if (action === 'tasks') {
        const lines = noteBody.split('\n');
        let taskCount = 0;
        lines.forEach((line) => {
          const cleanedLine = line.replace(/[-*]\s*\[\s*\]/g, '').trim();
          if (cleanedLine.length > 5) {
            tasksStore.insertTask({
              id: generateId('task'),
              userId,
              title: cleanedLine,
              dueDate: new Date().toISOString().split('T')[0],
              dueTime: '09:00',
              isCompleted: false,
              priority: 'Medium',
              category: noteCategory,
              notes: 'Extracted from note: ' + noteTitle,
            });
            taskCount++;
          }
        });
        if (taskCount > 0) {
          Alert.alert('AI Task Extractor', `Successfully created ${taskCount} tasks in your Schedule!`);
          onRefresh();
        } else {
          tasksStore.insertTask({
            id: generateId('task'),
            userId,
            title: noteTitle,
            dueDate: new Date().toISOString().split('T')[0],
            dueTime: '09:00',
            isCompleted: false,
            priority: 'Medium',
            category: noteCategory,
            notes: noteBody,
          });
          Alert.alert('AI Task Extractor', `Created 1 task based on note: "${noteTitle}".`);
          onRefresh();
        }
      }
    }, 1500);
  }, [noteBody, noteTitle, noteCategory, userId, onRefresh]);

  const filtered = useMemo(() => getFilteredNotes(), [getFilteredNotes]);

  return {
    // Data
    notes, filtered, searchQuery, searchActive, selectedFilter, isGridView,
    // Editor
    editorVisible, editingNote, noteTitle, noteBody, noteCategory, noteTags,
    isPinned, isVoice, imageUri, selection,
    // Drag
    activeDragId, isDragging, dragXRef, dragYRef, renderGen,
    // AI
    aiLoading, aiActionType,
    // Setters
    setSearchQuery, setSearchActive, setSelectedFilter, setIsGridView,
    setNoteTitle, setNoteBody, setNoteCategory, setNoteTags,
    setIsPinned, setIsVoice, setImageUri, setSelection,
    // Actions
    loadNotes, onCardLayout, handleDragStart, handleDragMove, handleDragRelease,
    openNewNote, openEditNote, closeEditor,
    applyFormatting, saveNote, deleteNote,
    triggerAiAction,
  };
};
