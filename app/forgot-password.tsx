import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AuthButton, AuthHeading, AuthLabeledField, AuthScreen } from '@/components/auth/AuthScreen';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/src/auth/AuthContext';

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isEmail(email)) {
      setError('Digite um e-mail válido.');
      setNotice(null);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await resetPassword(email);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.notice) setNotice(result.notice);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
        <Text style={styles.backLabel}>Voltar</Text>
      </Pressable>
      <AuthHeading
        title="Esqueci minha senha"
        subtitle="Enviaremos um link. Abra o e-mail neste celular para escolher a nova senha."
      />

      <AuthLabeledField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="Informe seu email"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="done"
        onSubmitEditing={() => {
          void onSubmit();
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <AuthButton label="Enviar link" onPress={() => void onSubmit()} loading={loading} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    color: Brand.blue,
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: Brand.danger,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  notice: {
    color: Brand.success,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});