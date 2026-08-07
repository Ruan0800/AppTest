import { Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/FloatingTabBar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <ThemeToggle />,
        sceneContainerStyle: {
          backgroundColor: colors.background,
          paddingBottom: 106,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
        }}
      />
      <Tabs.Screen
        name="keywords"
        options={{
          title: 'Palavras',
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contatos',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
        }}
      />
    </Tabs>
  );
}
