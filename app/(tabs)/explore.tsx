import { StyleSheet } from 'react-native';

import { Collapsible } from '@/components/ui/collapsible';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

export default function TipsScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText
          type="title"
          style={{
            fontFamily: Fonts.rounded,
          }}>
          Tips
        </ThemedText>
      </ThemedView>
      <ThemedText>Get the most out of Coach Kettle with these tips.</ThemedText>

      <Collapsible title="Quick set logging">
        <ThemedText>
          In <ThemedText type="defaultSemiBold">Fields</ThemedText> mode, the exercise name stays
          filled after you add a set. Just update weight and reps, then tap{' '}
          <ThemedText type="defaultSemiBold">Add</ThemedText> again for your next set.
        </ThemedText>
      </Collapsible>

      <Collapsible title="AI Chat mode">
        <ThemedText>
          Switch to <ThemedText type="defaultSemiBold">AI Chat</ThemedText> and type naturally:{' '}
          <ThemedText type="defaultSemiBold">"bench 185 10"</ThemedText>. Coach Kettle figures out
          the exercise, set number, weight, and reps from your shorthand.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Drop sets">
        <ThemedText>
          Tell the AI about drop sets and it will log them with decimal set numbers (2.1, 2.2) and a{' '}
          <ThemedText type="defaultSemiBold">DS</ThemedText> note.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Super sets">
        <ThemedText>
          Mention a super set and both exercises get stacked together with{' '}
          <ThemedText type="defaultSemiBold">SS</ThemedText> in the notes column.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Warmups">
        <ThemedText>
          Mark a set as a warmup and it gets logged as set{' '}
          <ThemedText type="defaultSemiBold">0</ThemedText> so it doesn't count toward your working
          sets.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Cardio">
        <ThemedText>
          Log cardio with duration in the reps field (e.g.{' '}
          <ThemedText type="defaultSemiBold">15 min</ThemedText>) and intensity in weight. The AI
          handles this automatically.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Deleting a set">
        <ThemedText>
          Long-press any row in the workout table to delete it.
        </ThemedText>
      </Collapsible>

      <Collapsible title="Finishing a workout">
        <ThemedText>
          Tap <ThemedText type="defaultSemiBold">Done</ThemedText> when your session is complete, or
          type <ThemedText type="defaultSemiBold">"done"</ThemedText> in AI Chat mode.
        </ThemedText>
      </Collapsible>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
});
