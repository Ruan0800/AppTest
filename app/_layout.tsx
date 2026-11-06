import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { BrandSplash } from '@/components/splash/BrandSplash';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { AuthProvider, useAuth } from '@/src/auth/AuthContext';
import { OnboardingProvider, useOnboarding } from '@/src/onboarding/OnboardingContext';
import { syncRemoteCatalog } from '@/src/data/repositories';
import {
  dismissAlertNotifications,
  registerForegroundService,
} from '@/src/device/foregroundService';
import { reconcileListener } from '@/src/device/listeningService';
import { loadAppSettings } from '@/src/settings/appSettings';
import { AppThemeProvider } from '@/src/theme/ThemeContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();
registerForegroundService();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <OnboardingProvider>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </OnboardingProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const { session, initializing, passwordRecovery } = useAuth();
  const { completed } = useOnboarding();
  const [splashDone, setSplashDone] = useState(false);
  const bootReady = !initializing && completed !== null;

  useEffect(() => {
    if (initializing) return;
    void (async () => {
      try {
        await loadAppSettings();
        await dismissAlertNotifications();
        await syncRemoteCatalog();
      } catch {
        // A home mostra o erro de carregamento.
      }
      try {
        await reconcileListener();
      } catch {
        // A escuta tenta de novo quando o usuário ligar a proteção.
      }
    })();
  }, [initializing]);

  useEffect(() => {
    if (!bootReady) return;
    const timer = setTimeout(() => setSplashDone(true), 1500);
    SplashScreen.hideAsync().catch(() => undefined);
    return () => clearTimeout(timer);
  }, [bootReady]);

  if (!bootReady || !splashDone || completed === null) {
    return <BrandSplash />;
  }

  const showOnboarding = session == null && !completed;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={showOnboarding ? 'dark' : 'light'} />
      <Stack>
        <Stack.Protected guard={passwordRecovery}>
          <Stack.Screen name="update-password" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={session != null && !passwordRecovery}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="settings"
            options={{
              title: 'Configurações',
              headerStyle: { backgroundColor: Colors.light.tint },
              headerShadowVisible: false,
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '700', color: '#FFFFFF' },
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="vosk-poc"
            options={{
              title: 'Prova de voz',
              headerStyle: { backgroundColor: Colors.light.tint },
              headerShadowVisible: false,
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '700', color: '#FFFFFF' },
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={showOnboarding && !passwordRecovery}>
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, animation: 'fade' }}
          />
        </Stack.Protected>
        <Stack.Protected guard={session == null && completed && !passwordRecovery}>
          <Stack.Screen
            name="login"
            options={{ headerShown: false, animation: 'fade' }}
          />
          <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          <Stack.Screen
            name="forgot-password"
            options={{ headerShown: false }}
          />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
