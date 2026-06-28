/**
 * Tab bar layout — 5 tabs: Home · Opportunities · Packs · Exports · Settings
 */
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { tk } from '../../components/brand';

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.45 }}>{icon}</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tk.color.surface,
          borderTopColor: tk.color.line,
          borderTopWidth: 1,
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: tk.color.brand,
        tabBarInactiveTintColor: tk.color.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon icon="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="opportunities"
        options={{
          title: 'Opportunities',
          tabBarIcon: ({ focused }) => <TabIcon icon="◎" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="packs"
        options={{
          title: 'Packs',
          tabBarIcon: ({ focused }) => <TabIcon icon="⊡" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="exports"
        options={{
          title: 'Exports',
          tabBarIcon: ({ focused }) => <TabIcon icon="↓" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon icon="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
