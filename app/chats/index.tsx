import { useAuth } from "@/components/AuthProvider";
import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { fetchChatHistory, groupChatsByDate, type ChatMessage, type ChatsByDate } from "@/lib/chatStorage";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChatsScreen() {
  const [chatGroups, setChatGroups] = useState<ChatsByDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const isDark = textColor === '#FFFFFF';
  const { session } = useAuth();

  const loadChats = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }
    
    try {
      const messages = await fetchChatHistory();
      const grouped = groupChatsByDate(messages);
      setChatGroups(grouped);
    } catch (e) {
      console.error("Failed to load chats", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadChats();
  }, [loadChats]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    const sourceLabel = item.source === 'coach_modal' ? '🏋️ Coach' : '💬 Workout';
    
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          {!isUser && (
            <Text style={styles.sourceLabel}>{sourceLabel}</Text>
          )}
          <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.botTime]}>
            {item.created_at 
              ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''
            }
          </Text>
        </View>
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: ChatsByDate }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.datePill}>
        <Text style={styles.dateText}>{section.displayDate}</Text>
      </View>
    </View>
  );

  // Convert to SectionList format
  const sections = chatGroups.map(group => ({
    ...group,
    data: group.messages,
  }));

  if (!session) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ 
          title: "Chat History",
          headerStyle: { backgroundColor },
          headerTintColor: isDark ? "#FFF" : "#000",
        }} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: isDark ? "#9CA3AF" : "#6B7280" }]}>
            Sign in to view chat history
          </Text>
          <Pressable 
            style={styles.signInButton}
            onPress={() => router.push('/auth/sign-in')}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ 
        title: "Chat History",
        headerStyle: { backgroundColor },
        headerTintColor: isDark ? "#FFF" : "#000",
      }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={isDark ? "#FFF" : "#000"} />
        </View>
      ) : chatGroups.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyIcon]}>💬</Text>
          <Text style={[styles.emptyText, { color: isDark ? "#9CA3AF" : "#6B7280" }]}>
            No chats yet
          </Text>
          <Text style={[styles.emptyHint, { color: isDark ? "#6B7280" : "#9CA3AF" }]}>
            Ask questions during your workout{'\n'}or use Ask Coach from the menu
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id || `${item.created_at}-${item.role}`}
          renderItem={renderMessage}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={isDark ? "#FFF" : "#000"}
            />
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  signInButton: {
    marginTop: 20,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  listContent: {
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    marginVertical: 16,
  },
  datePill: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 8,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  botRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#1F2937',
    borderBottomLeftRadius: 4,
  },
  sourceLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  botText: {
    color: '#F3F4F6',
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    opacity: 0.7,
    alignSelf: 'flex-end',
  },
  userTime: {
    color: '#E0E7FF',
  },
  botTime: {
    color: '#9CA3AF',
  },
});
