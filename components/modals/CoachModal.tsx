import { ScreenHeader } from "@/components/ui/screen-header";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ChatMessage, clearAllChatHistory, fetchChatHistory } from "@/lib/chatStorage";
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  question: string;
  onChangeQuestion: Dispatch<SetStateAction<string>>;
  loading: boolean;
  answer: string | null;
  error: string | null;
  onSubmit: (chatHistory: ChatMessage[]) => void;
  onClose: () => void;
};

export function CoachModal({
  visible,
  question,
  onChangeQuestion,
  loading,
  answer,
  error,
  onSubmit,
  onClose,
}: Props) {
  const disabled = loading || !question.trim();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const iconColor = useThemeColor({}, 'icon');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const placeholderColor = useThemeColor({}, 'placeholder');
  const chatBackground = useThemeColor({}, 'secondaryBackground');

  // Fix: Ensure internal content contrasts with the container background
  const sendBtnColor = isDark ? '#FFFFFF' : '#111827';
  const sendArrowColor = isDark ? '#111827' : '#FFFFFF'; // Dark arrow on white btn, White arrow on dark btn
  
  const userBubbleColor = isDark ? '#FFFFFF' : '#111827';
  const userBubbleTextColor = isDark ? '#111827' : '#FFFFFF'; // Inverse text color for user bubbles
  const userBubbleBorderColor = isDark ? '#FFFFFF' : '#111827';

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fetch history when modal opens
  useEffect(() => {
    if (visible) {
      setHistoryLoading(true);
      fetchChatHistory('coach_modal')
        .then(msgs => {
          // Sort explicitly by date ascending (oldest first)
          const sorted = msgs.sort((a, b) =>
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          );
          setHistory(sorted);
        })
        .catch(err => console.error("Failed to load coach history:", err))
        .finally(() => setHistoryLoading(false));
    }
  }, [visible]);

  // Scroll logic is handled by inverted FlatList
  useEffect(() => {
    // No-op
  }, [visible, history, answer, loading]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[
        styles.messageRow,
        isUser ? styles.userRow : styles.aiRow
      ]}>
        <ThemedView style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
          {
            borderColor: isUser ? userBubbleBorderColor : borderColor,
            ...(isUser && { backgroundColor: userBubbleColor }),
          }
        ]}>
          <ThemedText style={[
            styles.messageText,
            isUser && { color: userBubbleTextColor }
          ]}>
            {item.content}
          </ThemedText>
        </ThemedView>
      </View>
    );
  };

  const handleSend = () => {
    if (disabled) return;

    // Optimistically add user message to history
    const userMsg: ChatMessage = {
      role: 'user',
      content: question,
      source: 'coach_modal',
      created_at: new Date().toISOString()
    };
    const updatedHistory = [...history, userMsg];
    setHistory(updatedHistory);

    // Call parent submit logic with chat history for multi-turn context
    onSubmit(updatedHistory);
    // Input is cleared by parent
    onChangeQuestion("");
  };

  const handleClear = () => {
    if (history.length === 0) return;

    Alert.alert(
      "Clear Chat?",
      "This will remove all messages from the coach chat history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearAllChatHistory();
              setHistory([]);
            } catch {
              Alert.alert("Error", "Failed to clear chat history.");
            }
          }
        }
      ]
    );
  };

  // Track whether the current answer has been committed to history
  const committedRef = useRef(false);

  // Reset committed flag when a new question starts loading
  useEffect(() => {
    if (loading) {
      committedRef.current = false;
    }
  }, [loading]);

  // Effect to commit the answer to history once streaming is done
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && !loading && answer) {
      // Just finished loading a valid answer — commit to history
      committedRef.current = true;
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: answer,
        source: 'coach_modal',
        created_at: new Date().toISOString()
      };
      setHistory(prev => [...prev, aiMsg]);
    }
    wasLoading.current = loading;
  }, [loading, answer]);

  // Combine history with current streaming answer
  // Only append streaming answer if it hasn't been committed to history yet
  const displayData = [...history];
  if ((loading || answer) && !committedRef.current) {
    if (answer) {
      displayData.push({
        role: 'assistant',
        content: answer,
        source: 'coach_modal',
        created_at: new Date().toISOString()
      });
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1, backgroundColor }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <ScreenHeader
            title="Coach"
            onBack={onClose}
            rightElement={
              <Pressable onPress={handleClear} style={[styles.iconBtn, { opacity: history.length ? 1 : 0.3 }]} disabled={!history.length}>
                <MaterialCommunityIcons name="trash-can-outline" size={24} color={iconColor} />
              </Pressable>
            }
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            {historyLoading && history.length === 0 ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={placeholderColor} />
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={[...displayData].reverse()}
                inverted
                renderItem={renderItem}
                keyExtractor={(item, index) => item.id || `msg-${index}`}
                contentContainerStyle={styles.chatContent}
                style={[styles.chatArea, { backgroundColor: chatBackground }]}
                ListHeaderComponent={
                  loading && !answer ? (
                    <View style={styles.aiRow}>
                      <ThemedView style={[styles.bubble, styles.aiBubble, { borderColor, paddingVertical: 12 }]}>
                        <ActivityIndicator size="small" color={placeholderColor} />
                      </ThemedView>
                    </View>
                  ) : null
                }
              />
            )}

            <ThemedView style={[styles.inputFooter, { backgroundColor, borderTopColor: borderColor }]}>
              <TextInput
                value={question}
                onChangeText={onChangeQuestion}
                placeholder="Ask anything..."
                placeholderTextColor={placeholderColor}
                style={[styles.input, { backgroundColor: inputBackground, color: textColor }]}
                multiline
                editable={!loading}
              />
              <Pressable
                onPress={handleSend}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: sendBtnColor },
                  disabled && styles.sendBtnDisabled,
                  pressed && !disabled && { opacity: 0.8 }
                ]}
              >
                <Text style={[styles.sendArrow, { color: sendArrowColor }]}>↑</Text>
              </Pressable>
            </ThemedView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({

  iconBtn: {
    padding: 8,
  },

  chatArea: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  chatContent: {
    padding: 16,
    paddingBottom: 20,
    gap: 16,
    flexGrow: 1,
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 12,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  aiRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: "85%",
    borderWidth: 1,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  inputFooter: {
    flexDirection: "row",
    padding: 12,
    marginBottom: 10, // Higher up
    gap: 10,
    borderTopWidth: 1,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    borderRadius: 12, // Match other inputs
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendArrow: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: -2,
  },
});
