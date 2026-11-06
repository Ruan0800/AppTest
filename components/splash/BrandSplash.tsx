import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/brand';

export function BrandSplash() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image
        source={require('../../assets/images/logo_vigintel_completa.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Vigintel, vigilância inteligente"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Brand.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 180,
  },
});
