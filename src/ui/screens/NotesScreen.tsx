import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Colors, Fonts, Layout, Shadows } from '../theme';
import { notesStore, Note } from '../../storage/notesStore';
import { tasksStore } from '../../storage/tasksStore';

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

  // AI loading simulations
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActionType, setAiActionType] = useState('');

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadNotes = () => {
    const data = notesStore.getAll(userId);
    setNotes(data);
  };

  const handleCreateNotePress = () => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteBody('');
    setNoteCategory('Personal');
    setNoteTags([]);
    setIsPinned(false);
    setIsVoice(false);
    setEditorVisible(true);
  };

  const handleNoteCardPress = (note: Note) => {
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNoteCategory(note.category);
    setNoteTags(note.tags);
    setIsPinned(note.isPinned);
    setIsVoice(note.isVoiceTranscribed);
    setEditorVisible(true);
  };

  const handleSaveNote = () => {
    if (!noteTitle.trim() && !noteBody.trim()) {
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
      });
    }

    setEditorVisible(false);
    loadNotes();
    onRefresh();
  };

  const handleDeleteNote = (id: string) => {
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
  };

  const getFilteredNotes = () => {
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
  };

  // AI Commands implementation
  const triggerAiAction = (action: 'summarize' | 'clean' | 'tasks') => {
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
        let cleaned = noteBody.replace(/\s+/g, ' ').trim();
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        setNoteBody(cleaned);
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
  };

  const getCategoryColor = (cat: string) => {
    switch (cat?.toLowerCase()) {
      case 'work': return Colors.blue;
      case 'personal': return Colors.yellow;
      case 'health': return Colors.success;
      case 'learning': return '#9B59B6';
      default: return '#9E9E9E';
    }
  };

  const filtered = getFilteredNotes();

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
              <Text style={styles.headerIconText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>Notes</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => setSearchActive(true)} style={styles.headerIconBtn}>
                <Text style={styles.headerIconText}>🔍</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsGridView(!isGridView)} style={styles.headerIconBtn}>
                <Text style={styles.headerIconText}>{isGridView ? '☰' : '⊞'}</Text>
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
          <Text style={styles.emptyIllustration}>📝</Text>
          <Text style={styles.emptyTitle}>No notes found</Text>
          <Text style={styles.emptySubtitle}>Tap the + button below to write a new note, or use the voice assistant.</Text>
        </View>
      ) : (
        <FlatList
          key={isGridView ? 'grid' : 'list'}
          data={filtered}
          numColumns={isGridView ? 2 : 1}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.notesList}
          columnWrapperStyle={isGridView ? styles.gridRow : undefined}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                isGridView ? styles.gridCard : styles.listCard,
                Shadows.card,
              ]}
              onPress={() => handleNoteCardPress(item)}
            >
              <View style={[styles.noteTopStrip, { backgroundColor: getCategoryColor(item.category) }]} />
              <View style={styles.cardPadding}>
                <View style={styles.titleRow}>
                  <Text style={styles.noteCardTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.isPinned && <Text style={styles.pinText}>📌</Text>}
                </View>
                <Text style={styles.noteCardBody} numberOfLines={isGridView ? 3 : 2}>
                  {item.body}
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
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={[styles.fab, Shadows.card]} onPress={handleCreateNotePress}>
        <Text style={styles.fabText}>+</Text>
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
              <TouchableOpacity onPress={() => setIsPinned(!isPinned)} style={styles.headerPinBtn}>
                <Text style={styles.pinIcon}>{isPinned ? '📌 Pinned' : '📍 Pin'}</Text>
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

            {/* Text styling toolbar mockup */}
            <View style={styles.editorToolbar}>
              <Text style={styles.toolbarItem}>𝐁</Text>
              <Text style={styles.toolbarItem}>𝐼</Text>
              <Text style={styles.toolbarItem}>• List</Text>
              <Text style={styles.toolbarItem}>☑ Checklist</Text>
              <Text style={styles.toolbarItem}>🖼 Image</Text>
            </View>

            <TextInput
              style={styles.editorBodyInput}
              placeholder="Start writing..."
              placeholderTextColor="#888"
              multiline
              value={noteBody}
              onChangeText={setNoteBody}
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
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
    paddingVertical: 8,
    marginBottom: 12,
  },
  toolbarItem: {
    fontSize: 13,
    color: '#555',
    marginRight: 16,
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
