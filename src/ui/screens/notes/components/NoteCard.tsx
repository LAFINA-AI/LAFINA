import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  PanResponder,
  Animated,
  GestureResponderHandlers,
} from 'react-native';
import { Pin, GripVertical } from 'lucide-react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Shadows } from '../../../theme';
import { getCategoryColor } from '../../../theme/categoryColors';
import type { Note } from '../../../../storage';

const lafinaDefaultLogo = require('../../../../assets/lafina_default_logo.png');
const lafinaLogoGradient = require('../../../../assets/lafina_logo_gradient_bg.png');
const splashIcon = require('../../../../assets/spash_icon.png');

export const getLocalImage = (uri: string | null) => {
  if (uri === 'lafina_default_logo') return lafinaDefaultLogo;
  if (uri === 'lafina_logo_gradient_bg') return lafinaLogoGradient;
  if (uri === 'spash_icon') return splashIcon;
  return null;
};

export const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    let isChecklist = false;
    let isCompleted = false;
    let remainingLine = line;

    if (line.startsWith('- [ ] ')) {
      isChecklist = true;
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
        return <Text key={partIndex} style={{ fontWeight: 'bold' }}>{part.slice(2, -2)}</Text>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <Text key={partIndex} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
      }
      return part;
    });

    return (
      <Text key={lineIndex} style={isCompleted ? { textDecorationLine: 'line-through', color: colors.textMuted } : undefined}>
        {isChecklist && <Text style={{ color: isCompleted ? colors.success : colors.red, fontWeight: 'bold' }}>{isCompleted ? '☑ ' : '☐ '}</Text>}
        {inlineElements}
        {lineIndex < lines.length - 1 ? '\n' : ''}
      </Text>
    );
  });
};

const dragHandleStyles = StyleSheet.create({
  gridHandle: { padding: 6, justifyContent: 'center', alignItems: 'center' },
  listHandle: { paddingHorizontal: 16, paddingVertical: 24, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1 },
});

interface NoteCardBaseProps {
  item: Note;
  isGridView: boolean;
  onPress: (note: Note) => void;
  isActive: boolean;
  canDrag: boolean;
  panHandlers: GestureResponderHandlers;
  dragX: Animated.Value;
  dragY: Animated.Value;
  onLayout: (id: string, layout: { x: number; y: number; width: number; height: number }) => void;
}

export const NoteCardBase: React.FC<NoteCardBaseProps> = ({
  item, isGridView, onPress, isActive, canDrag, panHandlers,
  dragX, dragY, onLayout,
}) => {
  const { colors } = useTheme();

  const cardStyle = isActive
    ? {
        transform: [{ translateX: dragX }, { translateY: dragY }, { scale: 1.04 }],
        shadowColor: colors.black,
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
      onLayout={(e) => {
        const { x, y, width, height } = e.nativeEvent.layout;
        onLayout(item.id, { x, y, width, height });
      }}
      style={[
        isGridView ? styles.gridCard : styles.listCard,
        Shadows.card,
        cardStyle,
        { backgroundColor: colors.cardBg },
      ]}
    >
      <View style={[styles.noteTopStrip, { backgroundColor: getCategoryColor(item.category) }]} />

      {isGridView ? (
        <TouchableOpacity style={{ flex: 1 }} onPress={() => onPress(item)} activeOpacity={0.7} disabled={isActive}>
          {item.imageUri && (
            <Image source={getLocalImage(item.imageUri)} style={[styles.gridCardImage, { backgroundColor: colors.inputBg }]} resizeMode="cover" />
          )}
          <View style={styles.cardPadding}>
            <View style={styles.titleRow}>
              <Text style={[styles.noteCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
              {canDrag && <View {...panHandlers} style={dragHandleStyles.gridHandle}><GripVertical size={14} color={colors.iconMuted} /></View>}
              {item.isPinned && <Pin size={12} color={colors.red} style={{ transform: [{ rotate: '45deg' }] }} />}
            </View>
            <Text style={[styles.noteCardBody, { color: colors.textSecondary }]} numberOfLines={item.imageUri ? 2 : 4}>
              {renderMarkdown(item.body)}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={[styles.cardDate, { color: colors.textMuted }]}>
                {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              {item.isVoiceTranscribed && (
                <View style={[styles.voiceBadge, { backgroundColor: 'rgba(91, 91, 255, 0.15)' }]}>
                  <Text style={[styles.voiceBadgeText, { color: colors.blue }]}>AI</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => onPress(item)} activeOpacity={0.7} disabled={isActive}>
            <View style={{ flexDirection: 'row', padding: 12, alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: item.imageUri ? 12 : 0 }}>
                <View style={styles.titleRow}>
                  <Text style={[styles.noteCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                  {item.isPinned && <Pin size={12} color={colors.red} style={{ transform: [{ rotate: '45deg' }] }} />}
                </View>
                <Text style={[styles.noteCardBody, { color: colors.textSecondary }]} numberOfLines={2}>
                  {renderMarkdown(item.body)}
                </Text>
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardDate, { color: colors.textMuted }]}>
                    {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  {item.isVoiceTranscribed && (
                    <View style={[styles.voiceBadge, { backgroundColor: 'rgba(91, 91, 255, 0.15)' }]}>
                      <Text style={[styles.voiceBadgeText, { color: colors.blue }]}>AI Transcribed</Text>
                    </View>
                  )}
                </View>
              </View>
              {item.imageUri && (
                <Image source={getLocalImage(item.imageUri)} style={[styles.listCardImage, { backgroundColor: colors.inputBg }]} resizeMode="cover" />
              )}
            </View>
          </TouchableOpacity>
          {canDrag && (
            <View {...panHandlers} style={[dragHandleStyles.listHandle, { borderLeftColor: colors.border }]}>
              <GripVertical size={18} color={colors.iconMuted} />
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
};

interface NoteCardWithDragProps {
  item: Note;
  index: number;
  isGridView: boolean;
  isActive: boolean;
  canDrag: boolean;
  dragX: Animated.Value;
  dragY: Animated.Value;
  onPress: (note: Note) => void;
  onDragStart: (noteId: string, index: number) => void;
  onDragMove: (dx: number, dy: number) => void;
  onDragRelease: () => void;
  onLayout: (id: string, layout: { x: number; y: number; width: number; height: number }) => void;
}

export const NoteCardWithDrag = React.memo<NoteCardWithDragProps>(({
  item, index: _index, isGridView, isActive, canDrag,
  dragX, dragY, onPress, onDragStart, onDragMove, onDragRelease, onLayout,
}) => {
  const panRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragMoveRef = useRef(onDragMove);
  onDragMoveRef.current = onDragMove;
  const onDragReleaseRef = useRef(onDragRelease);
  onDragReleaseRef.current = onDragRelease;

  if (!panRef.current && canDrag) {
    panRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderGrant: () => {
        dragX.setValue(0);
        dragY.setValue(0);
        onDragStartRef.current(itemRef.current.id, -1);
      },
      onPanResponderMove: (_, gs) => onDragMoveRef.current(gs.dx, gs.dy),
      onPanResponderRelease: () => {
        Animated.parallel([
          Animated.spring(dragX, { toValue: 0, useNativeDriver: false, tension: 120, friction: 8 }),
          Animated.spring(dragY, { toValue: 0, useNativeDriver: false, tension: 120, friction: 8 }),
        ]).start(() => onDragReleaseRef.current());
      },
      onPanResponderTerminate: () => {
        dragX.setValue(0);
        dragY.setValue(0);
        onDragReleaseRef.current();
      },
    });
  }

  const panHandlers = canDrag && panRef.current ? panRef.current.panHandlers : {};

  return (
    <NoteCardBase
      item={item}
      isGridView={isGridView}
      onPress={onPress}
      isActive={isActive}
      canDrag={canDrag}
      panHandlers={panHandlers}
      dragX={dragX}
      dragY={dragY}
      onLayout={onLayout}
    />
  );
}, (prev, next) => {
  return prev.item === next.item && prev.isGridView === next.isGridView &&
    prev.isActive === next.isActive && prev.canDrag === next.canDrag &&
    prev.index === next.index;
});

const styles = StyleSheet.create({
  gridCard: { width: '48%', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  listCard: { width: '100%', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  noteTopStrip: { height: 4, width: '100%' },
  cardPadding: { padding: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  noteCardTitle: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'bold', flex: 1 },
  noteCardBody: { fontFamily: 'sans-serif', fontSize: 12, lineHeight: 16, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardDate: { fontSize: 10, fontFamily: 'sans-serif' },
  voiceBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  voiceBadgeText: { fontSize: 8, fontWeight: 'bold' },
  gridCardImage: { width: '100%', height: 80 },
  listCardImage: { width: 60, height: 60, borderRadius: 8 },
});
