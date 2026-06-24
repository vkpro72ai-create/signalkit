import { View, Text, StyleSheet } from 'react-native';
import { REQUIRED_DOCUMENT_TYPES } from '@signalkit/shared';
import { DEFAULT_LOCALE } from '@signalkit/i18n';

/**
 * Session 1 placeholder home. Proves the mobile app boots and consumes the
 * shared contracts. The real companion-app screens (read/review/approve/export)
 * arrive in Session 3 / Session 14.
 */
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SignalKit</Text>
      <Text style={styles.subtitle}>Companion app · locale {DEFAULT_LOCALE}</Text>
      <Text style={styles.body}>Documents per full pack: {REQUIRED_DOCUMENT_TYPES.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8, backgroundColor: '#FBFCFD' },
  title: { fontSize: 32, fontWeight: '700', color: '#1B1F24' },
  subtitle: { fontSize: 14, color: '#5A626E' },
  body: { fontSize: 16, color: '#1B1F24', marginTop: 16 },
});
