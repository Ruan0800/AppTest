import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'vigintel.onboarding.completed';

export async function hasCompletedOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEY);
  return value === '1';
}

export async function markOnboardingCompleted(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}
