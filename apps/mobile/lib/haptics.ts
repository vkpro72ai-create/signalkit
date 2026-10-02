/**
 * Haptic feedback abstraction. Production: install expo-haptics and swap the
 * implementation below.
 * TODO(session-16): expo install expo-haptics → uncomment real impl.
 *
 * import * as Haptics from 'expo-haptics';
 * export const impact = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
 * export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
 * export const error   = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
 */

export const impact = () => Promise.resolve();
export const success = () => Promise.resolve();
export const error = () => Promise.resolve();
