import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';

interface E1RMInfoTooltipProps {
  style?: any;
}

export function E1RMInfoTooltip({ style }: E1RMInfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const onTint = Colors[colorScheme].tintForeground;

  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={style}>
        <IconSymbol name="info.circle" size={18} color={tint} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <BlurView
          intensity={30}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={styles.blurContainer}
        >
          <Pressable style={styles.overlay} onPress={() => setVisible(false)} />

          <View style={[styles.content, { backgroundColor: Colors[colorScheme].cardBackground }]}>
            <ThemedText type="subtitle" style={styles.title}>
              About E1RM
            </ThemedText>

            <ThemedText style={styles.body}>
              Estimated 1RM uses the proven Epley formula to predict your one-rep max.
              It&apos;s most accurate with moderate rep ranges (5-10 reps).
              {'\n\n'}
              Single-rep maxes are exact, while higher reps (12+) provide useful estimates
              of your strength progression.
            </ThemedText>

            <Pressable
              onPress={() => setVisible(false)}
              style={[styles.button, { backgroundColor: tint }]}
            >
              <ThemedText style={[styles.buttonText, { color: onTint }]}>Got it</ThemedText>
            </Pressable>
          </View>
        </BlurView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  blurContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    margin: 20,
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.85,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
