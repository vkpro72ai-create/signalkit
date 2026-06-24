import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      {/* Flat 2D: solid header, no gradients. */}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FBFCFD' },
          headerTintColor: '#1B1F24',
          contentStyle: { backgroundColor: '#FBFCFD' },
        }}
      />
    </>
  );
}
