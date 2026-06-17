import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/useThemeColor';

interface NavItemProps {
  icon: string;
  label: string;
  description?: string;
  onPress: () => void;
  cardBackground: string;
  iconColor: string;
  placeholder: string;
}

function NavItem({ icon, label, description, onPress, cardBackground, iconColor, placeholder }: NavItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.navCard,
        { backgroundColor: cardBackground },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.navLeft}>
        <IconSymbol name={icon as any} size={22} color={iconColor} />
        <View style={styles.navText}>
          <ThemedText type="defaultSemiBold" style={styles.navLabel}>{label}</ThemedText>
          {description ? (
            <ThemedText style={[styles.navDesc, { color: placeholder }]}>{description}</ThemedText>
          ) : null}
        </View>
      </View>
      <IconSymbol name="chevron.right" size={18} color={placeholder} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cardBackground = useThemeColor({}, 'cardBackground');
  const iconColor = useThemeColor({}, 'icon');
  const placeholder = useThemeColor({}, 'placeholder');
  const sectionHeaderColor = useThemeColor({}, 'placeholder');

  const go = (path: Href) => () => router.push(path);

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="More" showBack={false} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        {/* Coaching */}
        <ThemedText style={[styles.sectionHeader, { color: sectionHeaderColor }]}>COACHING</ThemedText>
        <NavItem
          icon="sparkles"
          label="Coach Report"
          description="Daily honest feedback & streak"
          onPress={go('/coach')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavItem
          icon="chart.bar.fill"
          label="Program"
          description="Multi-week personalized training"
          onPress={go('/program')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavItem
          icon="books.vertical.fill"
          label="Exercise Library"
          description="Catalog of exercises with cues"
          onPress={go('/exercise-library')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />

        {/* History */}
        <ThemedText style={[styles.sectionHeader, { color: sectionHeaderColor }]}>HISTORY</ThemedText>
        <NavItem
          icon="clock.fill"
          label="Workout History"
          description="All saved sessions"
          onPress={go('/history')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavItem
          icon="bubble.left.and.bubble.right.fill"
          label="Chat History"
          description="Past AI conversations"
          onPress={go('/chats')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />

        {/* Settings */}
        <ThemedText style={[styles.sectionHeader, { color: sectionHeaderColor }]}>SETTINGS</ThemedText>
        <NavItem
          icon="doc.text.fill"
          label="Templates"
          description="Saved workout templates"
          onPress={go('/settings/templates')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
        <NavItem
          icon="gear"
          label="Settings"
          description="Profile, subscription, notifications"
          onPress={go('/settings')}
          cardBackground={cardBackground}
          iconColor={iconColor}
          placeholder={placeholder}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
  },
  navCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  navText: {
    flex: 1,
  },
  navLabel: {
    fontSize: 16,
  },
  navDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
