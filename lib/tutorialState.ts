import AsyncStorage from '@react-native-async-storage/async-storage';

const TUTORIAL_KEY = 'tutorial_shown_v1';

export async function isTutorialShown(): Promise<boolean> {
  const val = await AsyncStorage.getItem(TUTORIAL_KEY);
  return val === 'true';
}

export async function markTutorialShown(): Promise<void> {
  await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
}

export async function resetTutorial(): Promise<void> {
  await AsyncStorage.removeItem(TUTORIAL_KEY);
}
