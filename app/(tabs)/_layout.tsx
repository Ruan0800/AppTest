import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { SettingsButton } from '@/components/SettingsButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const HEADER_FG = '#FFFFFF';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const headerBg = Colors.light.tint;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: headerBg,
        },
        headerShadowVisible: false,
        headerTintColor: HEADER_FG,
        headerShown: useClientOnlyValue(false, true),
        title: 'Vigintel',
        headerTitleAlign: 'center',
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
          color: HEADER_FG,
        },
        headerLeft: () => <SettingsButton color={HEADER_FG} />,
        headerRight: () => <ThemeToggle color={HEADER_FG} />,
        sceneContainerStyle: {
          backgroundColor: colors.background,
          paddingBottom: 106,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Vigintel',
        }}
      />
      <Tabs.Screen
        name="keywords"
        options={{
          title: 'Vigintel',
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Vigintel',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Vigintel',
        }}
      />
    </Tabs>
  );
}
