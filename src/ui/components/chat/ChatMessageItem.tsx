import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import { ChatMessage } from '../../../storage/chatStore';

interface ChatMessageItemProps {
  item: ChatMessage;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ item }) => {
  const isUser = item.sender === 'user';
  const themed = useThemedStyles();

  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[
        styles.bubble,
        isUser ? styles.userBubble : [styles.assistantBubble, themed.assistantBubble]
      ]}>
        <Text style={[
          styles.messageText,
          isUser ? styles.userText : [styles.assistantText, themed.assistantText]
        ]}>
          {item.content}
        </Text>
        <Text style={[
          styles.timeText,
          isUser ? styles.userTime : [styles.assistantTime, themed.assistantTime]
        ]}>
          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    marginVertical: 6,
    width: '100%',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...Shadows.card,
  },
  userBubble: {
    backgroundColor: Colors.blue,
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    borderBottomLeftRadius: 2,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    // Handled by themed styles
  },
  timeText: {
    fontSize: 9,
    fontFamily: Fonts.body,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  assistantTime: {
    // Handled by themed styles
  },
});

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    assistantBubble: {
      backgroundColor: colors.cardBg,
      borderColor: colors.border,
    },
    assistantText: {
      color: colors.textPrimary,
    },
    assistantTime: {
      color: colors.textMuted,
    },
  };
}
