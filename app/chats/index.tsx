import { ThemedView } from "@/components/ui/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ChatItem = {
  id: string;
  title: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  source: string;
};

export default function ChatsScreen() {
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const isDark = useThemeColor({}, 'text') === '#FFFFFF'; // Rough check

  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    try {
      // Assuming API_BASE is reachable, straightforward fetch
      const apiBase = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiBase}/chats`);
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (e) {
      console.error("Failed to load chats", e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: ChatItem }) => {
    const isUser = item.role === "user";
    return (
      <View style={[
        styles.messageRow,
        isUser ? styles.userRow : styles.botRow
      ]}>
        <View style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.botBubble
        ]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.botTime]}>
             {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ 
        title: "Chat History",
        headerStyle: { backgroundColor },
        headerTintColor: isDark ? "#FFF" : "#000",
      }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: isDark ? "#9CA3AF" : "#6B7280" }]}>
            No chats yet
          </Text>
          <Text style={[styles.emptyHint, { color: isDark ? "#6B7280" : "#9CA3AF" }]}>
            Ask questions during your workout or use Ask Coach
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
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
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
  },

  listContent: {
    padding: 16,
    gap: 12,
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
    backgroundColor: '#3B82F6', // Blue
    borderBottomRightRadius: 2,
  },
  botBubble: {
    backgroundColor: '#374151', // Gray
    borderBottomLeftRadius: 2,
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
