import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Send } from 'lucide-react-native';
import { Colors, Fonts, Shadows } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  onSend: () => void;
  isKeyboardVisible: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  setInputText,
  onSend,
  isKeyboardVisible,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles();

  return (
    <View style={[
      styles.inputContainer,
      themed.inputContainer,
      { bottom: isKeyboardVisible ? 0 : 104 }
    ]}>
      <TextInput
        style={[styles.input, themed.input]}
        placeholder="Ask LAFINA..."
        placeholderTextColor={colors.textSecondary}
        value={inputText}
        onChangeText={setInputText}
        onSubmitEditing={onSend}
        returnKeyType="send"
      />
      <TouchableOpacity onPress={onSend} style={[styles.sendBtn, Shadows.micButton]}>
        <Send size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: Fonts.body,
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

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    inputContainer: {
      backgroundColor: colors.cardBg,
      borderTopColor: colors.border,
    },
    input: {
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
      color: colors.textPrimary,
    },
  };
}
