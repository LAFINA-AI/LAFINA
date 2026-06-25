import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Pin, Bold, Italic, CheckSquare, Image as ImageIcon, X } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import { getLocalImage } from './NoteCard';
import { getCategoryColor } from '../../../theme/categoryColors';
import type { Note } from '../../../../storage';

interface NoteEditorProps {
  visible: boolean;
  editingNote: Note | null;
  noteTitle: string;
  noteBody: string;
  noteCategory: string;
  noteTags: string[];
  isPinned: boolean;
  imageUri: string | null;
  selection: { start: number; end: number };
  aiLoading: boolean;
  aiActionType: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onPinToggle: () => void;
  onImageUriChange: (v: string | null) => void;
  onSelectionChange: (s: { start: number; end: number }) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onFormatting: (type: 'bold' | 'italic' | 'checklist') => void;
  onAttachImage: () => void;
  onRemoveImage: () => void;
  onAiAction: (action: 'summarize' | 'clean' | 'tasks') => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  visible, editingNote, noteTitle, noteBody, noteCategory,
  isPinned, imageUri, selection, aiLoading, aiActionType,
  onTitleChange, onBodyChange, onCategoryChange, onPinToggle,
  onSelectionChange, onClose: _onClose, onSave, onDelete,
  onFormatting, onAttachImage, onRemoveImage, onAiAction,
}) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.editorContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.editorHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onDelete} style={styles.deleteNoteBtn} disabled={!editingNote}>
            <Text style={[styles.deleteNoteText, !editingNote && { opacity: 0.3 }]}>Delete</Text>
          </TouchableOpacity>

          <View style={styles.editorHeaderActions}>
            <TouchableOpacity onPress={onPinToggle} style={[styles.headerPinBtn, { flexDirection: 'row', alignItems: 'center' }]}>
              <Pin size={14} color={isPinned ? colors.red : colors.textSecondary} style={{ marginRight: 4, transform: [{ rotate: isPinned ? '45deg' : '0deg' }] }} />
              <Text style={[{ color: isPinned ? colors.red : colors.textSecondary }, { fontSize: 13 }]}>{isPinned ? 'Pinned' : 'Pin'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form */}
        <ScrollView style={styles.editorForm} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.editorTitleInput, { color: colors.textPrimary }]}
            placeholder="Title"
            placeholderTextColor={colors.textSecondary}
            value={noteTitle}
            onChangeText={onTitleChange}
          />

          <View style={styles.categoryEditorRow}>
            <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>Category:</Text>
            {['Work', 'Personal', 'Health', 'Learning'].map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catChipSmall,
                  { borderColor: colors.border },
                  { borderColor: colors.textSecondary },
                  noteCategory === cat && { backgroundColor: getCategoryColor(cat), borderColor: 'transparent' },
                ]}
                onPress={() => onCategoryChange(cat)}
              >
                <Text style={[
                  { color: colors.textSecondary },
                  noteCategory === cat && { color: colors.white, fontWeight: 'bold' },
                  { fontSize: 11 },
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {imageUri && (
            <View style={[styles.editorImageContainer, { borderColor: colors.border }]}>
              <Image source={getLocalImage(imageUri)} style={styles.editorImage} resizeMode="cover" />
              <TouchableOpacity style={styles.removeImageOverlayBtn} onPress={onRemoveImage} activeOpacity={0.7}>
                <X size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
          )}

          {/* Toolbar */}
          <View style={[styles.editorToolbar, { borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => onFormatting('bold')} style={[styles.toolbarBtn, { backgroundColor: colors.inputBg }]} activeOpacity={0.7}>
              <Bold size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onFormatting('italic')} style={[styles.toolbarBtn, { backgroundColor: colors.inputBg }]} activeOpacity={0.7}>
              <Italic size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onFormatting('checklist')} style={[styles.toolbarBtn, { backgroundColor: colors.inputBg }]} activeOpacity={0.7}>
              <CheckSquare size={16} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={imageUri ? onRemoveImage : onAttachImage}
              style={[styles.toolbarBtn, { backgroundColor: colors.inputBg }, styles.imageToolbarBtn, imageUri && { backgroundColor: Colors.red }]}
              activeOpacity={0.7}
            >
              <ImageIcon size={16} color={imageUri ? colors.white : colors.textPrimary} style={{ marginRight: 4 }} />
              <Text style={[styles.imageToolbarText, { color: colors.textPrimary }, imageUri && { color: colors.white, fontWeight: 'bold' }]}>
                {imageUri ? 'Remove Image' : 'Image'}
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.editorBodyInput, { color: colors.textPrimary }]}
            placeholder="Start writing..."
            placeholderTextColor={colors.textSecondary}
            multiline
            value={noteBody}
            onChangeText={onBodyChange}
            selection={selection}
            onSelectionChange={(e) => onSelectionChange(e.nativeEvent.selection)}
          />
        </ScrollView>

        {/* AI Loader */}
        {aiLoading && (
          <View style={[styles.aiLoadingOverlay, { backgroundColor: 'rgba(18, 18, 18, 0.85)' }]}>
            <ActivityIndicator size="large" color={Colors.yellow} />
            <Text style={[styles.aiLoadingText, { color: colors.textPrimary }]}>AI is performing {aiActionType}...</Text>
          </View>
        )}

        {/* AI Actions */}
        <View style={[styles.aiActionsStrip, { backgroundColor: colors.cardBg }]}>
          <TouchableOpacity onPress={() => onAiAction('summarize')} style={[styles.aiActionBtn, { backgroundColor: colors.inputBg }]}>
            <Text style={styles.aiActionBtnText}>✨ Summarize</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onAiAction('clean')} style={[styles.aiActionBtn, { backgroundColor: colors.inputBg }]}>
            <Text style={styles.aiActionBtnText}>✍ Clean Up</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onAiAction('tasks')} style={[styles.aiActionBtn, { backgroundColor: colors.inputBg }]}>
            <Text style={styles.aiActionBtnText}>📋 Extract Tasks</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  editorContainer: { flex: 1 },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  deleteNoteBtn: { paddingVertical: 6 },
  deleteNoteText: { color: Colors.error, fontWeight: 'bold' },
  editorHeaderActions: { flexDirection: 'row', alignItems: 'center' },
  headerPinBtn: { marginRight: 16, paddingVertical: 6 },
  doneBtn: { backgroundColor: Colors.red, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 12 },
  doneText: { color: Colors.textLight, fontWeight: 'bold' },
  editorForm: { flex: 1, padding: 16 },
  editorTitleInput: { fontFamily: 'sans-serif-medium', fontSize: 22, fontWeight: 'bold', marginBottom: 12, paddingVertical: 0 },
  categoryEditorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  categoryLabel: { fontSize: 12, marginRight: 8 },
  catChipSmall: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, marginRight: 4 },
  editorToolbar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 6, marginBottom: 12 },
  toolbarBtn: { padding: 8, marginRight: 8, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  imageToolbarBtn: { flexDirection: 'row', paddingHorizontal: 12 },
  imageToolbarText: { fontSize: 12, fontFamily: 'sans-serif' },
  editorImageContainer: { position: 'relative', marginVertical: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, height: 180, width: '100%' },
  editorImage: { width: '100%', height: '100%' },
  removeImageOverlayBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  editorBodyInput: { fontFamily: 'sans-serif', fontSize: 15, lineHeight: 22, height: 400, textAlignVertical: 'top', paddingVertical: 0 },
  aiLoadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  aiLoadingText: { marginTop: 12, fontWeight: 'bold', fontFamily: 'sans-serif' },
  aiActionsStrip: { flexDirection: 'row', paddingTop: 10, paddingBottom: 10, paddingHorizontal: 12, justifyContent: 'space-between' },
  aiActionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, marginHorizontal: 4, alignItems: 'center' },
  aiActionBtnText: { color: Colors.yellow, fontSize: 11, fontWeight: 'bold', fontFamily: 'sans-serif' },
});
