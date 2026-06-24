import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Alert,
  Keyboard,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Colors, Fonts } from '../theme';
import { chatStore } from '../../storage';
import type { ChatMessage } from '../../storage';
import { processCommand } from '../../ai';
import { useTheme } from '../contexts/ThemeContext';
import { useThemedStyles } from '../theme/createThemedStyles';
import { AI_PROCESSING_DELAY_MS } from '../../constants';
import type { ThemeColors } from '../contexts/ThemeContext';
import { generateId } from '../../utils';

// Chat sub-components
import { ChatMessageItem } from '../components/chat/ChatMessageItem';
import { ChatInput } from '../components/chat/ChatInput';

interface ChatScreenProps {
  userId: string;
  refreshTrigger: number;
  onRefresh: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { colors } = useTheme();
  const themed = useThemedStyles((c) => getChatThemedStyles(c));

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    loadChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refreshTrigger]);

  const loadChatHistory = () => {
    const history = chatStore.getMessages(userId);
    setMessages(history);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 100);
  };

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');
    Keyboard.dismiss();

    const sessionId = chatStore.ensureDefaultSession(userId);

    // 1. Insert User Message
    const userMsgId = generateId('msg');
    const userMsg = {
      id: userMsgId,
      sessionId,
      sender: 'user' as const,
      content: userText,
    };
    chatStore.insertMessage(userMsg);

    // Temp state update for immediate user feedback
    const tempMessages = [
      ...messages,
      {
        ...userMsg,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    setMessages(tempMessages);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Simulate AI processing delay
    setTimeout(() => {
      // 2. Process Command via NLU Parser
      const aiReply = processCommand(userText, userId);

      // 3. Insert AI Response
      const aiMsgId = generateId('msg');
      const aiMsg = {
        id: aiMsgId,
        sessionId,
        sender: 'assistant' as const,
        content: aiReply,
      };
      chatStore.insertMessage(aiMsg);

      loadChatHistory();
      onRefresh();
    }, AI_PROCESSING_DELAY_MS);
  };

  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat History',
      'Are you sure you want to clear your conversation history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            chatStore.clearHistory(userId);
            loadChatHistory();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    return <ChatMessageItem item={item} />;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, themed.container]}
      behavior={undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, themed.header]}>
        <View>
          <Text style={[styles.headerTitle, themed.headerTitle]}>LAFINA Assistant</Text>
          <Text style={[styles.headerSubtitle, themed.headerSubtitle]}>Offline NLU Scheduler</Text>
        </View>
        <TouchableOpacity onPress={handleClearChat} style={styles.clearBtn}>
          <Trash2 size={20} color={colors.red} />
        </TouchableOpacity>
      </View>

      {/* Message List */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, themed.emptyText]}>Ask me to schedule events, create tasks, or save notes!</Text>
          <Text style={[styles.exampleText, themed.exampleText]}>Try: "add task Submit paper by 9:00 PM"</Text>
          <Text style={[styles.exampleText, themed.exampleText]}>Try: "block 13:00-15:00 for Exam Review"</Text>
          <Text style={[styles.exampleText, themed.exampleText]}>Try: "note Remind me to call Mom"</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Input Row */}
      <ChatInput
        inputText={inputText}
        setInputText={setInputText}
        onSend={handleSend}
        isKeyboardVisible={isKeyboardVisible}
      />
      <View style={{ height: isKeyboardVisible ? 0 : 170 }} />
    </KeyboardAvoidingView>
  );
};

const getChatThemedStyles = (colors: ThemeColors) => ({
  container: { backgroundColor: colors.background },
  header: { backgroundColor: colors.cardBg, borderBottomColor: colors.border },
  headerTitle: { color: colors.textPrimary },
  headerSubtitle: { color: colors.textSecondary },
  emptyText: { color: colors.textSecondary },
  exampleText: { color: colors.textMuted },
  assistantBubble: { backgroundColor: colors.cardBg, borderColor: colors.border },
  assistantText: { color: colors.textPrimary },
  assistantTime: { color: colors.textMuted },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  clearBtn: {
    padding: 8,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: Fonts.heading,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  exampleText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
