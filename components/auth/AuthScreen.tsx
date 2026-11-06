import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/brand';

const BLUE = Brand.blue;

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  loading?: boolean;
  disabled?: boolean;
};

export function AuthButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: ButtonProps) {
  const primary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonOutline,
        (pressed || disabled || loading) && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? '#FFFFFF' : BLUE} />
      ) : (
        <Text style={[styles.buttonLabel, primary ? styles.buttonLabelPrimary : styles.buttonLabelOutline]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type LabeledFieldProps = TextInputProps & {
  label: string;
  secureToggle?: boolean;
};

export function AuthLabeledField({
  label,
  secureToggle,
  secureTextEntry,
  style,
  ...rest
}: LabeledFieldProps) {
  const [hidden, setHidden] = useState(true);
  const isSecure = secureToggle ? hidden : secureTextEntry;

  return (
    <View style={styles.labeled}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.labeledField}>
        <TextInput
          placeholderTextColor={Brand.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={isSecure}
          style={[styles.labeledInput, style]}
          {...rest}
        />
        {secureToggle ? (
          <Pressable
            onPress={() => setHidden((current) => !current)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar senha' : 'Ocultar senha'}>
            <FontAwesome
              name={hidden ? 'eye' : 'eye-slash'}
              size={18}
              color="#8E8E8E"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.headingTitle}>{title}</Text>
      <Text style={styles.headingSubtitle}>{subtitle}</Text>
    </View>
  );
}

export function AuthScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const heroHeight = Math.round(Math.min(340, Math.max(276, height * 0.28)) + 28);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.hero, { height: heroHeight, paddingTop: insets.top + 28 }]}>
        <Image
          source={require('../../assets/images/logo_vigintel_completa.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Vigintel, vigilância inteligente"
        />
      </View>

      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  hero: {
    backgroundColor: Brand.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
  },
  logo: {
    width: 176,
    height: 118,
  },
  sheetWrap: {
    flex: 1,
    marginTop: -28,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 14,
  },
  heading: {
    gap: 6,
    marginBottom: 6,
  },
  headingTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: Brand.ink,
    textAlign: 'center',
  },
  headingSubtitle: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  labeled: {
    gap: 6,
  },
  fieldLabel: {
    color: Brand.muted,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  labeledField: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: Brand.input,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  labeledInput: {
    flex: 1,
    color: Brand.ink,
    fontSize: 15,
    paddingVertical: 12,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonPrimary: {
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BLUE,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  buttonLabelPrimary: {
    color: '#FFFFFF',
  },
  buttonLabelOutline: {
    color: BLUE,
  },
  pressed: {
    opacity: 0.86,
  },
});
