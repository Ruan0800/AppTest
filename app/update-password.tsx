import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthButton, AuthHeading, AuthLabeledField, AuthScreen } from '@/components/auth/AuthScreen';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/src/auth/AuthContext';

export default function UpdatePasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await updatePassword(password);
      if (!result.ok) setError(result.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <AuthHeading
        title="Nova senha"
        subtitle="Escolha uma senha nova para entrar no Vigintel."
      />

      <AuthLabeledField
        label="Nova senha"
        secureToggle
        value={password}
        onChangeText={setPassword}
        placeholder="Informe a nova senha"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <AuthLabeledField
        label="Confirmar senha"
        secureToggle
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirme a nova senha"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => {
          void onSubmit();
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AuthButton label="Salvar senha" onPress={() => void onSubmit()} loading={loading} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: Brand.danger,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
