import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  PanResponder,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { notesStore, Note } from '../../storage/notesStore';
import { tasksStore } from '../../storage/tasksStore';
import {
  Pin,
  Plus,
  Search,
  Grid,
  List,
  FileText,
  X,
  Bold,
  Italic,
  CheckSquare,
  Image as ImageIcon,
  GripVertical,
} from 'lucide-react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const lafinaDefaultLogo = require('../../assets/lafina_default_logo.png');
const lafinaLogoGradient = require('../../assets/lafina_logo_gradient_bg.png');
const splashIcon = require('../../assets/spash_icon.png');

const getLocalImage = (uri: string | null) => {
  if (uri === 'lafina_default_logo') return lafinaDefaultLogo;
  if (uri === 'lafina_logo_gradient_bg') return lafinaLogoGradient;
  if (uri === 'spash_icon') return splashIcon;
  return null;
};

const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;

  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    let isChecklist = false;
    let isCompleted = false;
    let remainingLine = line;

    if (line.startsWith('- [ ] ')) {
      isChecklist = true;
      isCompleted = false;
      remainingLine = line.slice(6);
    } else if (line.startsWith('- [x] ')) {
      isChecklist = true;
      isCompleted = true;
      remainingLine = line.slice(6);
    }

    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const parts = remainingLine.split(regex);

    const inlineElements = parts.map((part, partIndex) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={partIndex} style={{ fontWeight: 'bold' }}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <Text key={partIndex} style={{ fontStyle: 'italic' }}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return part;
    });

    return (
      <Text key={lineIndex} style={isCompleted ? { textDecorationLine: 'line-through', color: '#999' } : undefined}>
        {isChecklist && (
          <Text style={{ color: isCompleted ? Colors.success : Colors.red, fontWeight: 'bold' }}>
            {isCompleted ? '☑ ' : '☐ '}
          </Text>
        )}
        {inlineElements}
        {lineIndex < lines.length - 1 ? '\n' : ''}
      </Text>
    );
  });
};

/** Smooth spring-like LayoutAnimation preset for swap transitions */
const swapAnimation = {
  duration: 200,
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

/**
 * Helper to get the color associated with a note category.
 */
const getCategoryColor = (cat: string): string => {
  switch (cat?.toLowerCase()) {
    case 'work': return Colors.blue;
    case 'personal': return Colors.yellow;
    case 'health': return Colors.success;
    case 'learning': return '#9B59B6';
    default: return '#9E9E9E';
  }
};

// NoteCardProps is defined alongside NoteCardWithRelease below.

// ──────────────────────────────────────────────────────────────
// Main NotesScreen component
// ──────────────────────────────────────────────────────────────

interface NotesScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

type FilterType = 'All' | 'AI Transcribed' | 'Personal' | 'Work' | 'Pinned';

export const NotesScreen: React.FC<NotesScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
}) => {
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

  // ── Drag-to-reorder (ref-based for performance) ──
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragXRef = useRef(new Animated.Value(0));
  const dragYRef = useRef(new Animated.Value(0));

  // Generation counter: bumped on drag-end to force FlatList re-render once
  const [renderGen, setRenderGen] = useState(0);

  // The authoritative notes array during a drag operation lives in this ref.
  // We mutate this ref on every swap, then flush it into state on release.
  const notesRef = useRef<Note[]>(notes);
  notesRef.current = notes;

  const activeDragIdRef = useRef<string | null>(null);

  // Track the drag threshold for swaps
  const lastSwapDyRef = useRef(0);
  const lastSwapDxRef = useRef(0);

  // AI loading simulations
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActionType, setAiActionType] = useState('');

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadNotes = useCallback(() => {
    const data = notesStore.getAll(userId);
    setNotes(data);
  }, [userId]);

  // ── Drag lifecycle handlers ──

  /**
   * Called when a drag gesture begins on a card.
   * Sets up refs and state for the drag session.
   */
  const handleDragStart = useCallback((noteId: string, _index: number) => {
    activeDragIdRef.current = noteId;
    lastSwapDyRef.current = 0;
    lastSwapDxRef.current = 0;
    setActiveDragId(noteId);
    setIsDragging(true);
  }, []);

  /**
   * Listener attached to dragY to perform live swap detection.
   * This runs on every Animated frame, reads refs (no setState during drag).
   */
  useEffect(() => {
    const currentDragY = dragYRef.current;
    const listenerId = currentDragY.addListener(({ value: dy }) => {
      const draggedId = activeDragIdRef.current;
      if (!draggedId) return;

      const currentNotes = notesRef.current;
      const curIdx = currentNotes.findIndex(n => n.id === draggedId);
      if (curIdx === -1) return;

      let targetIdx = curIdx;
      const isGrid = isGridView; // captured from the closure

      if (isGrid) {
        const HEIGHT_STEP = 110;
        const WIDTH_STEP = 150;
        // Read the current dx value synchronously
        const dx = (dragXRef.current as any)._value || 0;

        const rowDelta = Math.round((dy - lastSwapDyRef.current) / HEIGHT_STEP);
        const colDelta = Math.round((dx - lastSwapDxRef.current) / WIDTH_STEP);

        if (rowDelta === 0 && colDelta === 0) return;

        const curCol = curIdx % 2;
        const curRow = Math.floor(curIdx / 2);
        let newCol = curCol + colDelta;
        let newRow = curRow + rowDelta;

        // Clamp
        if (newCol < 0) newCol = 0;
        if (newCol > 1) newCol = 1;
        const maxRow = Math.floor((currentNotes.length - 1) / 2);
        if (newRow < 0) newRow = 0;
        if (newRow > maxRow) newRow = maxRow;

        targetIdx = newRow * 2 + newCol;
      } else {
        const HEIGHT_STEP = 90;
        const rowDelta = Math.round((dy - lastSwapDyRef.current) / HEIGHT_STEP);
        if (rowDelta === 0) return;
        targetIdx = curIdx + rowDelta;
      }

      // Clamp bounds
      if (targetIdx < 0) targetIdx = 0;
      if (targetIdx >= currentNotes.length) targetIdx = currentNotes.length - 1;
      if (targetIdx === curIdx) return;

      const draggedNote = currentNotes[curIdx];
      const targetNote = currentNotes[targetIdx];

      // Skip if either is pinned
      if (!draggedNote || !targetNote || draggedNote.isPinned || targetNote.isPinned) return;

      // Perform the swap via LayoutAnimation for a smooth transition
      LayoutAnimation.configureNext(swapAnimation);

      const newNotes = [...currentNotes];
      newNotes[curIdx] = targetNote;
      newNotes[targetIdx] = draggedNote;
      notesRef.current = newNotes;
      setNotes(newNotes);

      // Update swap reference point
      if (isGrid) {
        const dx = (dragXRef.current as any)._value || 0;
        lastSwapDxRef.current = dx;
      }
      lastSwapDyRef.current = dy;
    });

    return () => {
      currentDragY.removeListener(listenerId);
    };
  }, [isGridView]);

  /**
   * Called when the drag gesture ends. Saves the new order to SQLite
   * and flushes the ref-based array into React state.
   */
  const handleDragEnd = useCallback(() => {
    // Persist order to database
    const latestNotes = notesRef.current;
    const unpinnedNotes = latestNotes.filter(n => !n.isPinned);
    const orderUpdates = unpinnedNotes.map((note, idx) => ({
      id: note.id,
      sortOrder: idx,
    }));
    notesStore.updateOrder(orderUpdates);

    // Reset drag state
    activeDragIdRef.current = null;
    setActiveDragId(null);
    setIsDragging(false);
    lastSwapDyRef.current = 0;
    lastSwapDxRef.current = 0;

    // Bump generation to ensure FlatList picks up the final order
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
    if (isDragging) return; // Ignore taps during drag
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
    Alert.alert(
      'Attach Image',
      'Choose an asset image to attach:',
      [
        {
          text: 'Default Logo',
          onPress: () => setImageUri('lafina_default_logo'),
        },
        {
          text: 'Gradient Logo',
          onPress: () => setImageUri('lafina_logo_gradient_bg'),
        },
        {
          text: 'Splash Icon',
          onPress: () => setImageUri('spash_icon'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
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
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
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
      // Search query
      const matchesSearch =
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Filter chips
      if (selectedFilter === 'All') return true;
      if (selectedFilter === 'Pinned') return n.isPinned;
      if (selectedFilter === 'AI Transcribed') return n.isVoiceTranscribed;
      return n.category === selectedFilter;
    });
  }, [notes, searchQuery, selectedFilter]);

  // AI Commands implementation
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
        const summary = `\n\n--- AI SUMMARY ---\n• Key focus of this note centers on productivity details.\n• Critical path action items should be extracted and scheduled.\n------------------`;
        setNoteBody((prev) => prev + summary);
      } else if (action === 'clean') {
        // Simple mock of clean up
        setNoteBody((prev) => {
          let cleaned = prev.replace(/\s+/g, ' ').trim();
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
          return cleaned;
        });
        Alert.alert('AI Clean Up', 'Typographical spacing and layout have been refined.');
      } else if (action === 'tasks') {
        // Mock parse sentences starting with "- [ ]" or containing action verbs
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
          Alert.alert('AI Task Extractor', `Successfully created ${taskCount} tasks in your Schedule!`);
          onRefresh();
        } else {
          // If no clean lines, extract whole note as a single task
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
          Alert.alert('AI Task Extractor', `Created 1 task based on note: "${noteTitle}".`);
          onRefresh();
        }
      }
    }, 1500);
  }, [noteBody, noteTitle, noteCategory, userId, onRefresh]);

  const filtered = useMemo(() => getFilteredNotes(), [getFilteredNotes]);

  // Stable keyExtractor
  const keyExtractor = useCallback((item: Note) => item.id, []);

  // ── renderItem with memoized NoteCard ──
  const renderItem = useCallback(({ item, index }: { item: Note; index: number }) => {
    const isItemPinned = item.isPinned;
    const canDrag = !isItemPinned && selectedFilter === 'All' && !searchQuery.trim();
    const isActive = item.id === activeDragId;

    return (
      <NoteCardWithRelease
        item={item}
        index={index}
        isGridView={isGridView}
        isActive={isActive}
        canDrag={canDrag}
        dragX={dragXRef.current}
        dragY={dragYRef.current}
        onPress={handleNoteCardPress}
        onDragStart={handleDragStart}
        onDragRelease={handleDragRelease}
      />
    );
  }, [activeDragId, isGridView, selectedFilter, searchQuery, handleNoteCardPress, handleDragStart, handleDragRelease]);

  return (
    <View style={styles.container}>
      {/* Header Notes */}
      <View style={styles.header}>
        {searchActive ? (
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search notes..."
              placeholderTextColor="#777"
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity onPress={() => { setSearchActive(false); setSearchQuery(''); }} style={styles.headerIconBtn}>
              <X size={16} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>Notes</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => setSearchActive(true)} style={styles.headerIconBtn}>
                <Search size={18} color={Colors.textDark} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsGridView(!isGridView)} style={styles.headerIconBtn}>
                {isGridView ? <List size={18} color={Colors.textDark} /> : <Grid size={18} color={Colors.textDark} />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Filter Chips ScrollRow */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroller}>
          {(['All', 'AI Transcribed', 'Personal', 'Work', 'Pinned'] as FilterType[]).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                selectedFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text style={[styles.filterChipText, selectedFilter === filter && styles.filterChipTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Notes Content List */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <FileText size={48} color={Colors.red} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No notes found</Text>
          <Text style={styles.emptySubtitle}>Tap the + button below to write a new note, or use the voice assistant.</Text>
        </View>
      ) : (
        <FlatList
          key={isGridView ? 'grid' : 'list'}
          data={filtered}
          numColumns={isGridView ? 2 : 1}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.notesList}
          columnWrapperStyle={isGridView ? styles.gridRow : undefined}
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
      <Modal visible={editorVisible} animationType="slide" transparent={false}>
        <View style={styles.editorContainer}>
          {/* Header */}
          <View style={styles.editorHeader}>
            <TouchableOpacity onPress={() => handleDeleteNote(editingNote!.id)} style={styles.deleteNoteBtn} disabled={!editingNote}>
              <Text style={[styles.deleteNoteText, !editingNote && { opacity: 0.3 }]}>Delete</Text>
            </TouchableOpacity>

            <View style={styles.editorHeaderActions}>
              <TouchableOpacity onPress={() => setIsPinned(!isPinned)} style={[styles.headerPinBtn, { flexDirection: 'row', alignItems: 'center' }]}>
                <Pin size={14} color={isPinned ? Colors.red : '#555'} style={{ marginRight: 4, transform: [{ rotate: isPinned ? '45deg' : '0deg' }] }} />
                <Text style={[styles.pinIcon, { color: isPinned ? Colors.red : '#555', marginTop: 0 }]}>{isPinned ? 'Pinned' : 'Pin'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveNote} style={styles.doneBtn}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Form */}
          <ScrollView style={styles.editorForm} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.editorTitleInput}
              placeholder="Title"
              placeholderTextColor="#888"
              value={noteTitle}
              onChangeText={setNoteTitle}
            />

            <View style={styles.categoryEditorRow}>
              <Text style={styles.categoryLabel}>Category:</Text>
              {['Work', 'Personal', 'Health', 'Learning'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.catChipSmall,
                    noteCategory === cat && { backgroundColor: getCategoryColor(cat), borderColor: 'transparent' },
                  ]}
                  onPress={() => setNoteCategory(cat)}
                >
                  <Text style={[styles.catChipSmallText, noteCategory === cat && { color: '#FFF', fontWeight: 'bold' }]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {imageUri && (
              <View style={styles.editorImageContainer}>
                <Image
                  source={getLocalImage(imageUri)}
                  style={styles.editorImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.removeImageOverlayBtn}
                  onPress={handleRemoveImage}
                  activeOpacity={0.7}
                >
                  <X size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}

            {/* Text styling toolbar */}
            <View style={styles.editorToolbar}>
              <TouchableOpacity onPress={() => applyFormatting('bold')} style={styles.toolbarBtn} activeOpacity={0.7}>
                <Bold size={16} color={Colors.textDark} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => applyFormatting('italic')} style={styles.toolbarBtn} activeOpacity={0.7}>
                <Italic size={16} color={Colors.textDark} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => applyFormatting('checklist')} style={styles.toolbarBtn} activeOpacity={0.7}>
                <CheckSquare size={16} color={Colors.textDark} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={imageUri ? handleRemoveImage : handleAttachImage}
                style={[styles.toolbarBtn, styles.imageToolbarBtn, imageUri && styles.imageToolbarBtnActive]}
                activeOpacity={0.7}
              >
                <ImageIcon size={16} color={imageUri ? '#FFF' : Colors.textDark} style={{ marginRight: 4 }} />
                <Text style={[styles.imageToolbarText, imageUri && styles.imageToolbarTextActive]}>
                  {imageUri ? 'Remove Image' : 'Image'}
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.editorBodyInput}
              placeholder="Start writing..."
              placeholderTextColor="#888"
              multiline
              value={noteBody}
              onChangeText={setNoteBody}
              selection={selection}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            />
          </ScrollView>

          {/* AI Loader Overlay */}
          {aiLoading && (
            <View style={styles.aiLoadingOverlay}>
              <ActivityIndicator size="large" color={Colors.yellow} />
              <Text style={styles.aiLoadingText}>AI is performing {aiActionType}...</Text>
            </View>
          )}

          {/* AI Actions Strip */}
          <View style={styles.aiActionsStrip}>
            <TouchableOpacity onPress={() => triggerAiAction('summarize')} style={styles.aiActionBtn}>
              <Text style={styles.aiActionBtnText}>✨ Summarize</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => triggerAiAction('clean')} style={styles.aiActionBtn}>
              <Text style={styles.aiActionBtnText}>✍ Clean Up</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => triggerAiAction('tasks')} style={styles.aiActionBtn}>
              <Text style={styles.aiActionBtnText}>📋 Extract Tasks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
// NoteCardWithRelease – Thin wrapper that adds onDragRelease
// callback to the memoized NoteCard component.
// ──────────────────────────────────────────────────────────────

interface NoteCardWithReleaseProps {
  item: Note;
  index: number;
  isGridView: boolean;
  isActive: boolean;
  canDrag: boolean;
  dragX: Animated.Value;
  dragY: Animated.Value;
  onPress: (note: Note) => void;
  onDragStart: (noteId: string, index: number) => void;
  onDragRelease: () => void;
}

const NoteCardWithRelease = React.memo<NoteCardWithReleaseProps>(({
  item,
  _index,
  isGridView,
  isActive,
  canDrag,
  dragX,
  dragY,
  onPress,
  onDragStart,
  onDragRelease,
}) => {
  const panRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);

  const itemRef = useRef(item);
  itemRef.current = item;

  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;

  const onDragReleaseRef = useRef(onDragRelease);
  onDragReleaseRef.current = onDragRelease;

  if (!panRef.current && canDrag) {
    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        const currentItem = itemRef.current;
        dragX.setValue(0);
        dragY.setValue(0);
        onDragStartRef.current(currentItem.id, -1);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: dragX, dy: dragY }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        // Animate back to origin with a spring, then notify parent
        Animated.parallel([
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: false,
            tension: 120,
            friction: 8,
          }),
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: false,
            tension: 120,
            friction: 8,
          }),
        ]).start(() => {
          onDragReleaseRef.current();
        });
      },
      onPanResponderTerminate: () => {
        dragX.setValue(0);
        dragY.setValue(0);
        onDragReleaseRef.current();
      },
    });
  }

  const panHandlers = canDrag && panRef.current ? panRef.current.panHandlers : {};

  const cardStyle = isActive
    ? {
        transform: [
          { translateX: dragX },
          { translateY: dragY },
        ],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 15,
        zIndex: 999,
        opacity: 0.92,
      }
    : { zIndex: 1 };

  return (
    <Animated.View
      style={[
        isGridView ? styles.gridCard : styles.listCard,
        Shadows.card,
        cardStyle,
      ]}
    >
      <View style={[styles.noteTopStrip, { backgroundColor: getCategoryColor(item.category) }]} />

      {isGridView ? (
        // ── Grid View Layout ──
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => onPress(item)}
          activeOpacity={0.7}
          disabled={isActive}
        >
          {item.imageUri && (
            <Image
              source={getLocalImage(item.imageUri)}
              style={styles.gridCardImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.cardPadding}>
            <View style={styles.titleRow}>
              <Text style={styles.noteCardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {canDrag && (
                <View
                  {...panHandlers}
                  style={dragHandleStyles.gridHandle}
                >
                  <GripVertical size={14} color="#AAA" />
                </View>
              )}
              {item.isPinned && <Pin size={12} color={Colors.red} style={{ transform: [{ rotate: '45deg' }] }} />}
            </View>
            <Text style={styles.noteCardBody} numberOfLines={item.imageUri ? 2 : 4}>
              {renderMarkdown(item.body)}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardDate}>
                {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              {item.isVoiceTranscribed && (
                <View style={styles.voiceBadge}>
                  <Text style={styles.voiceBadgeText}>AI</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        // ── List View Layout ──
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => onPress(item)}
            activeOpacity={0.7}
            disabled={isActive}
          >
            <View style={{ flexDirection: 'row', padding: 12, alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: item.imageUri ? 12 : 0 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.noteCardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.isPinned && <Pin size={12} color={Colors.red} style={{ transform: [{ rotate: '45deg' }] }} />}
                </View>
                <Text style={styles.noteCardBody} numberOfLines={2}>
                  {renderMarkdown(item.body)}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  {item.isVoiceTranscribed && (
                    <View style={styles.voiceBadge}>
                      <Text style={styles.voiceBadgeText}>AI Transcribed</Text>
                    </View>
                  )}
                </View>
              </View>

              {item.imageUri && (
                <Image
                  source={getLocalImage(item.imageUri)}
                  style={styles.listCardImage}
                  resizeMode="cover"
                />
              )}
            </View>
          </TouchableOpacity>

          {canDrag && (
            <View
              {...panHandlers}
              style={dragHandleStyles.listHandle}
            >
              <GripVertical size={18} color="#AAA" />
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.isGridView === next.isGridView &&
    prev.isActive === next.isActive &&
    prev.canDrag === next.canDrag &&
    prev.index === next.index
  );
});

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const dragHandleStyles = StyleSheet.create({
  gridHandle: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listHandle: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F5F5F5',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
    backgroundColor: '#EAEAEA',
    borderRadius: 8,
    paddingLeft: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: Colors.textDark,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: Colors.darkBg,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  headerIconBtn: {
    padding: 8,
    marginLeft: 8,
  },
  headerIconText: {
    fontSize: 16,
    color: '#333',
  },
  filterContainer: {
    marginBottom: 12,
  },
  filterScroller: {
    paddingRight: 16,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadiusPill,
    backgroundColor: '#EAEAEA',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: Colors.red,
  },
  filterChipText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: '#555',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },

  // Notes lists
  notesList: {
    paddingBottom: 120,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: Layout.borderRadiusCard,
    marginBottom: 12,
    overflow: 'hidden',
  },
  listCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: Layout.borderRadiusCard,
    marginBottom: 12,
    overflow: 'hidden',
  },
  noteTopStrip: {
    height: 4,
    width: '100%',
  },
  cardPadding: {
    padding: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noteCardTitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.textDark,
    flex: 1,
  },
  pinText: {
    fontSize: 10,
    marginLeft: 4,
  },
  noteCardBody: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDate: {
    fontSize: 10,
    color: '#9E9E9E',
    fontFamily: Fonts.body,
  },
  voiceBadge: {
    backgroundColor: '#F0F0FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  voiceBadgeText: {
    color: '#5B5BFF',
    fontSize: 8,
    fontWeight: 'bold',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIllustration: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },

  // FAB
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
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '300',
  },

  // Editor Modal
  editorContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  deleteNoteBtn: {
    paddingVertical: 6,
  },
  deleteNoteText: {
    color: Colors.error,
    fontWeight: 'bold',
  },
  editorHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerPinBtn: {
    marginRight: 16,
    paddingVertical: 6,
  },
  pinIcon: {
    fontSize: 13,
    color: '#555',
  },
  doneBtn: {
    backgroundColor: Colors.red,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  doneText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  editorForm: {
    flex: 1,
    padding: 16,
  },
  editorTitleInput: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textDark,
    marginBottom: 12,
    paddingVertical: 0,
  },
  categoryEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryLabel: {
    fontSize: 12,
    color: '#777',
    marginRight: 8,
  },
  catChipSmall: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCC',
    marginRight: 4,
  },
  catChipSmallText: {
    fontSize: 11,
    color: '#555',
  },
  editorToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    paddingVertical: 6,
    marginBottom: 12,
  },
  toolbarBtn: {
    padding: 8,
    marginRight: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  imageToolbarBtn: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
  },
  imageToolbarBtnActive: {
    backgroundColor: Colors.red,
  },
  imageToolbarText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textDark,
  },
  imageToolbarTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  editorImageContainer: {
    position: 'relative',
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    height: 180,
    width: '100%',
  },
  editorImage: {
    width: '100%',
    height: '100%',
  },
  removeImageOverlayBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCardImage: {
    width: '100%',
    height: 80,
    backgroundColor: '#EAEAEA',
  },
  listCardImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#EAEAEA',
  },
  editorBodyInput: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Colors.textDark,
    lineHeight: 22,
    height: 400,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },

  // AI Loading
  aiLoadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  aiLoadingText: {
    marginTop: 12,
    color: Colors.textDark,
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },

  // AI Actions Strip
  aiActionsStrip: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  aiActionBtn: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    paddingVertical: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  aiActionBtnText: {
    color: Colors.yellow,
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: Fonts.body,
  },
});
