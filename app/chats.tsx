import { useAuth } from "@/contexts/AuthProvider";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/useThemeColor";
import { fetchChatHistory, groupChatsByDate, type ChatMessage, type ChatsByDate } from "@/lib/chatStorage";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ChatsScreen() {
  const [chatGroups, setChatGroups] = useState<ChatsByDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'text');
  const placeholder = useThemeColor({}, 'placeholder');
  const tint = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const botBubbleBg = useThemeColor({}, 'secondaryBackground');
  const { session } = useAuth();

  const loadChats = useCallback(async () => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoadError(false);
    try {
      const messages = await fetchChatHistory();
      const grouped = groupChatsByDate(messages);
      setChatGroups(grouped);
    } catch (e) {
      console.error("Failed to load chats", e);
      setLoadError(true);
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
    const sourceLabel = item.source === 'coach_modal' ? 'Coach' : 'Workout';

    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble, { backgroundColor: isUser ? tint : botBubbleBg }]}>
          {!isUser && (
            <Text style={[styles.sourceLabel, { color: placeholder }]}>{sourceLabel}</Text>
          )}
          <Text style={[styles.messageText, { color: isUser ? onTint : iconColor }]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, { color: isUser ? onTint : placeholder }]}>
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
        <Text style={[styles.dateText, { color: placeholder }]}>{section.displayDate}</Text>
      </View>
    </View>
  );

  // Convert to SectionList format - Reverse messages for inverted list (Newest at index 0 = Visual Bottom)
  const sections = chatGroups.map(group => ({
    ...group,
    data: [...group.messages].reverse(),
  }));

  if (!session) {
    return (
      <ThemedView style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{
          title: "Chat History",
          headerStyle: { backgroundColor },
          headerTintColor: iconColor,
          headerShadowVisible: false,
        }} />
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: placeholder }]}>
            Sign in to view chat history
          </Text>
          <Pressable
            style={[styles.signInButton, { backgroundColor: tint }]}
            onPress={() => router.push('/auth/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.signInButtonText, { color: onTint }]}>Sign In</Text>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{
        headerShown: false,
      }} />

      <ScreenHeader title="Chat History" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={iconColor} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: placeholder }]}>
            Failed to load chat history
          </Text>
          <Text style={[styles.emptyHint, { color: placeholder }]}>
            Pull down to retry
          </Text>
        </View>
      ) : chatGroups.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyIcon]}></Text>
          <Text style={[styles.emptyText, { color: placeholder }]}>
            No chats yet
          </Text>
          <Text style={[styles.emptyHint, { color: placeholder }]}>
            Ask questions during your workout{'\n'}or use Ask Coach from the menu
          </Text>
        </View>
      ) : (
        <SectionList
          sections={[...sections].reverse()}
          inverted
          keyExtractor={(item) => item.id || `${item.created_at}-${item.role}`}
          renderItem={renderMessage}
          renderSectionFooter={renderSectionHeader}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={iconColor}
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
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInButtonText: {
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
    borderBottomRightRadius: 4,
  },
  botBubble: {
    // backgroundColor set dynamically via botBubbleBg (isDark ternary)
    borderBottomLeftRadius: 4,
  },
  sourceLabel: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    opacity: 0.7,
    alignSelf: 'flex-end',
  },
});
