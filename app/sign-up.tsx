import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AuthButton, AuthHeading, AuthLabeledField, AuthScreen } from '@/components/auth/AuthScreen';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/src/auth/AuthContext';

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isEmail(email)) {
      setError('Digite um e-mail válido.');
      setNotice(null);
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      setNotice(null);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      setNotice(null);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await signUp(email, password);
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
      <AuthHeading title="Primeiro acesso" subtitle="Crie seu acesso com e-mail e senha." />

      <AuthLabeledField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="Informe seu email"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <AuthLabeledField
        label="Senha"
        secureToggle
        value={password}
        onChangeText={setPassword}
        placeholder="Informe sua senha"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <AuthLabeledField
        label="Confirmar senha"
        secureToggle
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirme sua senha"
        autoComplete="new-password"
        textContentType="newPassword"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <AuthButton label="Criar conta" onPress={() => void onSubmit()} loading={loading} />
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
