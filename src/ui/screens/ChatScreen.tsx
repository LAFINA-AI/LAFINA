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
import { Trash2, Plus } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { Fonts, Colors } from '../theme';
import { chatStore } from '../../storage';
import { LAFINA_LOGO_CHAT_HEADER_XML } from '../../assets/lafina_logo_chat_header_xml';
import type { ChatMessage } from '../../storage';
import { runLocalLlmChat } from '../../ai';
import { useThemedStyles } from '../theme/createThemedStyles';
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

  const handleSend = async () => {
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

    // 2. Process Command via SmolLM2 Local LLM Chatbot
    const aiReply = await runLocalLlmChat(userText, userId);

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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SvgXml
            xml={LAFINA_LOGO_CHAT_HEADER_XML}
            width={38}
            height={38}
            style={styles.headerLogo}
          />
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>LAFINA Assistant</Text>
            <Text style={styles.headerSubtitle}>Offline NLU Scheduler</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleClearChat} style={styles.headerIconBtn}>
            <View style={styles.plusCircle}>
              <Plus size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearChat} style={styles.headerIconBtn}>
            <Trash2 size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
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
    backgroundColor: Colors.blue,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 38,
    height: 38,
    marginRight: 10,
  },
  headerTextContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    padding: 6,
    marginLeft: 12,
  },
  plusCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
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
