import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { Colors, Fonts, Shadows } from '../theme';
import { useTheme } from '../contexts/ThemeContext';
import { notesStore, Note } from '../../storage/notesStore';
import { tasksStore } from '../../storage/tasksStore';
import {
  Plus,
  Search,
  Grid,
  List,
  FileText,
  X,
} from 'lucide-react-native';
import { FilterChips, FilterType } from '../components/notes/FilterChips';
import { NoteCard } from '../components/notes/NoteCard';
import { NoteEditorModal } from '../components/notes/NoteEditorModal';

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

interface NotesScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

export const NotesScreen: React.FC<NotesScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles();

  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('All');
  const [isGridView, setIsGridView] = useState(true);

  // Editor Modal
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

  // Drag-to-reorder (ref-based for performance)
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragXRef = useRef(new Animated.Value(0));
  const dragYRef = useRef(new Animated.Value(0));

  const [renderGen, setRenderGen] = useState(0);

  const notesRef = useRef<Note[]>(notes);
  notesRef.current = notes;

  const activeDragIdRef = useRef<string | null>(null);
  const cardLayoutsRef = useRef<{ [id: string]: { x: number; y: number; width: number; height: number } }>({});
  const dragStartLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const [aiLoading, setAiLoading] = useState(false);
  const [aiActionType, setAiActionType] = useState('');

  const loadNotes = useCallback(() => {
    const data = notesStore.getAll(userId);
    setNotes(data);
  }, [userId]);

  useEffect(() => {
    loadNotes();
  }, [userId, refreshTrigger, loadNotes]);

  const onCardLayout = useCallback((id: string, layout: { x: number; y: number; width: number; height: number }) => {
    cardLayoutsRef.current[id] = layout;
  }, []);

  const handleDragStart = useCallback((noteId: string, _index: number) => {
    activeDragIdRef.current = noteId;
    dragOffsetRef.current = { x: 0, y: 0 };

    const layout = cardLayoutsRef.current[noteId];
    if (layout) {
      dragStartLayoutRef.current = { ...layout };
    } else {
      dragStartLayoutRef.current = null;
    }

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
        const layoutCenterX = layout.x + layout.width / 2;
        const layoutCenterY = layout.y + layout.height / 2;

        const distToTargetSqr = Math.pow(centerX - layoutCenterX, 2) + Math.pow(centerY - layoutCenterY, 2);

        if (distToTargetSqr < distToSelfSqr && distToTargetSqr < minDistance) {
          minDistance = distToTargetSqr;
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
        const correspondingOldNoteAtNewIndex = currentNotes[newIndex];
        cardLayoutsRef.current[oldNote.id] = oldLayoutsMap[correspondingOldNoteAtNewIndex.id];
      }
    }

    notesRef.current = newNotes;
    setNotes(newNotes);

    const oldBaseX = initialLayout.x + dragOffsetRef.current.x;
    const oldBaseY = initialLayout.y + dragOffsetRef.current.y;

    const newBaseX = targetLayout.x;
    const newBaseY = targetLayout.y;

    dragOffsetRef.current.x += oldBaseX - newBaseX;
    dragOffsetRef.current.y += oldBaseY - newBaseY;

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
    const orderUpdates = unpinnedNotes.map((note, idx) => ({
      id: note.id,
      sortOrder: idx,
    }));
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

  const handleCreateNotePress = useCallback(() => {
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

  const handleNoteCardPress = useCallback((note: Note) => {
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

  const applyFormatting = useCallback((type: 'bold' | 'italic' | 'checklist') => {
    const { start, end } = selection;
    const before = noteBody.substring(0, start);
    const selected = noteBody.substring(start, end);
    const after = noteBody.substring(end);

    let newText = '';
    let newCursorPos = start;

    if (type === 'bold') {
      if (start === end) {
        newText = `${before}****${after}`;
        newCursorPos = start + 2;
      } else {
        newText = `${before}**${selected}**${after}`;
        newCursorPos = start + 2 + selected.length + 2;
      }
    } else if (type === 'italic') {
      if (start === end) {
        newText = `${before}**${after}`;
        newCursorPos = start + 1;
      } else {
        newText = `${before}*${selected}*${after}`;
        newCursorPos = start + 1 + selected.length + 1;
      }
    } else if (type === 'checklist') {
      const needsNewline = start > 0 && noteBody.charAt(start - 1) !== '\n';
      const checklistPrefix = needsNewline ? '\n- [ ] ' : '- [ ] ';
      newText = `${before}${checklistPrefix}${selected}${after}`;
      newCursorPos = start + checklistPrefix.length + selected.length;
    }

    setNoteBody(newText);
    setSelection({ start: newCursorPos, end: newCursorPos });
  }, [noteBody, selection]);

  const handleAttachImage = useCallback(() => {
    // Simulating Alert.alert picker logic
    // In React Native environment, Alert.alert shows a native dialog.
    // Keeping exactly the same function structure for native alert interface.
    // Imported modules verify this behavior correctly.
    const AlertRN = require('react-native').Alert;
    AlertRN.alert(
      'Attach Image',
      'Choose an asset image to attach:',
      [
        { text: 'Default Logo', onPress: () => setImageUri('lafina_default_logo') },
        { text: 'Gradient Logo', onPress: () => setImageUri('lafina_logo_gradient_bg') },
        { text: 'Splash Icon', onPress: () => setImageUri('spash_icon') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, []);

  const handleRemoveImage = useCallback(() => {
    setImageUri(null);
  }, []);

  const handleSaveNote = useCallback(() => {
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
        id: 'note_' + Math.random().toString(36).substr(2, 9),
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

  const handleDeleteNote = useCallback((id: string) => {
    const AlertRN = require('react-native').Alert;
    AlertRN.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          notesStore.delete(id);
          setEditorVisible(false);
          loadNotes();
          onRefresh();
        },
      },
    ]);
  }, [loadNotes, onRefresh]);

  const getFilteredNotes = useCallback(() => {
    return notes.filter((n) => {
      const matchesSearch =
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedFilter === 'All') return true;
      if (selectedFilter === 'Pinned') return n.isPinned;
      if (selectedFilter === 'AI Transcribed') return n.isVoiceTranscribed;
      return n.category === selectedFilter;
    });
  }, [notes, searchQuery, selectedFilter]);

  const triggerAiAction = useCallback((action: 'summarize' | 'clean' | 'tasks') => {
    const AlertRN = require('react-native').Alert;
    if (!noteBody.trim()) {
      AlertRN.alert('Error', 'Please enter some text in the note body first.');
      return;
    }
    setAiActionType(action);
    setAiLoading(true);

    setTimeout(() => {
      setAiLoading(false);
      if (action === 'summarize') {
        const summary = `\n\n--- AI SUMMARY ---\n• Key focus of this note centers on productivity details.\n• Critical path action items should be extracted and scheduled.\n------------------`;
        setNoteBody((prev) => prev + summary);
      } else if (action === 'clean') {
        setNoteBody((prev) => {
          let cleaned = prev.replace(/\s+/g, ' ').trim();
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          return cleaned;
        });
        AlertRN.alert('AI Clean Up', 'Typographical spacing and layout have been refined.');
      } else if (action === 'tasks') {
        const lines = noteBody.split('\n');
        let taskCount = 0;
        lines.forEach((line) => {
          const cleanedLine = line.replace(/[-*]\s*\[\s*\]/g, '').trim();
          if (cleanedLine.length > 5) {
            tasksStore.insertTask({
              id: 'task_' + Math.random().toString(36).substr(2, 9),
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
          AlertRN.alert('AI Task Extractor', `Successfully created ${taskCount} tasks in your Schedule!`);
          onRefresh();
        } else {
          tasksStore.insertTask({
            id: 'task_' + Math.random().toString(36).substr(2, 9),
            userId,
            title: noteTitle,
            dueDate: new Date().toISOString().split('T')[0],
            dueTime: '09:00',
            isCompleted: false,
            priority: 'Medium',
            category: noteCategory,
            notes: noteBody,
          });
          AlertRN.alert('AI Task Extractor', `Created 1 task based on note: "${noteTitle}".`);
          onRefresh();
        }
      }
    }, 1500);
  }, [noteBody, noteTitle, noteCategory, userId, onRefresh]);

  const filtered = useMemo(() => getFilteredNotes(), [getFilteredNotes]);
  const keyExtractor = useCallback((item: Note) => item.id, []);

  const renderItem = useCallback(({ item, index }: { item: Note; index: number }) => {
    const isItemPinned = item.isPinned;
    const canDrag = !isItemPinned && selectedFilter === 'All' && !searchQuery.trim();
    const isActive = item.id === activeDragId;

    return (
      <NoteCard
        key={item.id}
        item={item}
        index={index}
        isGridView={isGridView}
        isActive={isActive}
        canDrag={canDrag}
        dragX={dragXRef.current}
        dragY={dragYRef.current}
        onPress={handleNoteCardPress}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragRelease={handleDragRelease}
        onLayout={onCardLayout}
      />
    );
  }, [activeDragId, isGridView, selectedFilter, searchQuery, handleNoteCardPress, handleDragStart, handleDragMove, handleDragRelease, onCardLayout]);

  return (
    <View style={[styles.container, themed.container]}>
      {/* Header Notes */}
      <View style={styles.header}>
        {searchActive ? (
          <View style={[styles.searchRow, themed.searchRow]}>
            <TextInput
              style={[styles.searchInput, themed.searchInput]}
              placeholder="Search notes..."
              placeholderTextColor={colors.textSecondary}
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity onPress={() => { setSearchActive(false); setSearchQuery(''); }} style={styles.headerIconBtn}>
              <X size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.headerTitle, themed.headerTitle]}>Notes</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => setSearchActive(true)} style={styles.headerIconBtn}>
                <Search size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsGridView(!isGridView)} style={styles.headerIconBtn}>
                {isGridView ? <List size={18} color={colors.textPrimary} /> : <Grid size={18} color={colors.textPrimary} />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Filter Chips ScrollRow */}
      <FilterChips selectedFilter={selectedFilter} onSelectFilter={setSelectedFilter} />

      {/* Notes Content List */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <FileText size={48} color={colors.red} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyTitle, themed.emptyTitle]}>No notes found</Text>
          <Text style={[styles.emptySubtitle, themed.emptySubtitle]}>Tap the + button below to write a new note, or use the voice assistant.</Text>
        </View>
      ) : isGridView ? (
        <ScrollView
          style={styles.notesListScroll}
          contentContainerStyle={[styles.notesList, styles.gridContainer]}
          scrollEnabled={!isDragging}
        >
          {filtered.map((item, index) => renderItem({ item, index }))}
        </ScrollView>
      ) : (
        <FlatList
          key="list"
          data={filtered}
          numColumns={1}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.notesList}
          scrollEnabled={!isDragging}
          extraData={renderGen}
          renderItem={renderItem}
          removeClippedSubviews={false}
          windowSize={21}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, Shadows.card]} onPress={handleCreateNotePress}>
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Editor Modal Sheet */}
      <NoteEditorModal
        visible={editorVisible}
        editingNote={editingNote}
        noteTitle={noteTitle}
        setNoteTitle={setNoteTitle}
        noteBody={noteBody}
        setNoteBody={setNoteBody}
        noteCategory={noteCategory}
        setNoteCategory={setNoteCategory}
        isPinned={isPinned}
        setIsPinned={setIsPinned}
        imageUri={imageUri}
        selection={selection}
        setSelection={setSelection}
        aiLoading={aiLoading}
        aiActionType={aiActionType}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
        onAttachImage={handleAttachImage}
        onRemoveImage={handleRemoveImage}
        onApplyFormatting={applyFormatting}
        onTriggerAiAction={triggerAiAction}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    height: 40,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    borderRadius: 8,
    paddingLeft: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  headerIconBtn: {
    padding: 8,
    marginLeft: 8,
  },
  notesList: {
    paddingBottom: 120,
  },
  notesListScroll: {
    flex: 1,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    container: {
      backgroundColor: colors.background,
    },
    searchRow: {
      backgroundColor: colors.inputBg,
    },
    searchInput: {
      color: colors.textPrimary,
    },
    headerTitle: {
      color: colors.textPrimary,
    },
    emptyTitle: {
      color: colors.textPrimary,
    },
    emptySubtitle: {
      color: colors.textSecondary,
    },
  };
}
