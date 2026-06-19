import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { Send, Trash2 } from 'lucide-react-native';
import { Colors, Fonts, Shadows } from '../theme';
import { chatStore, ChatMessage } from '../../storage/chatStore';
import { processCommand } from '../../ai/nlu/parser';

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
    // Scroll to bottom after loading
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
    const userMsgId = 'msg_' + Math.random().toString(36).substr(2, 9);
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
      // 2. Process Command via NLU Parser (modifies tasks/events/notes in SQLite)
      const aiReply = processCommand(userText, userId);

      // 3. Insert AI Response
      const aiMsgId = 'msg_' + Math.random().toString(36).substr(2, 9);
      const aiMsg = {
        id: aiMsgId,
        sessionId,
        sender: 'assistant' as const,
        content: aiReply,
      };
      chatStore.insertMessage(aiMsg);

      // Reload chat and trigger parent screen refresh (calendar, tasks updates)
      loadChatHistory();
      onRefresh();
    }, 600);
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

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.assistantTime]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>LAFINA Assistant</Text>
          <Text style={styles.headerSubtitle}>Offline NLU Scheduler</Text>
        </View>
        <TouchableOpacity onPress={handleClearChat} style={styles.clearBtn}>
          <Trash2 size={20} color={Colors.red} />
        </TouchableOpacity>
      </View>

      {/* Message List */}
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Ask me to schedule events, create tasks, or save notes!</Text>
          <Text style={styles.exampleText}>Try: "add task Submit paper by 9:00 PM"</Text>
          <Text style={styles.exampleText}>Try: "block 13:00-15:00 for Exam Review"</Text>
          <Text style={styles.exampleText}>Try: "note Remind me to call Mom"</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Input Row */}
      <View style={[styles.inputContainer, { bottom: isKeyboardVisible ? 0 : 104 }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask LAFINA..."
          placeholderTextColor="#888"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={handleSend} style={[styles.sendBtn, Shadows.micButton]}>
          <Send size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={{ height: isKeyboardVisible ? 0 : 170 }} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Fonts.heading,
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#888',
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
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#EFEFEF',
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
    color: Colors.textDark,
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
    color: '#999',
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
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  exampleText: {
    fontSize: 12,
    color: '#888',
    fontFamily: Fonts.body,
    marginTop: 6,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#EFEFEF',
    position: 'absolute',
    left: 0,
    right: 0,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#DDD',
    backgroundColor: '#F9F9F9',
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textDark,
    marginRight: 10,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
