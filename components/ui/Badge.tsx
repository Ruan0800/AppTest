import { StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

export function Badge({ label, backgroundColor, textColor }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
