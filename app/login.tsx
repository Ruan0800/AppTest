import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import {
  AuthButton,
  AuthHeading,
  AuthLabeledField,
  AuthScreen,
} from "@/components/auth/AuthScreen";
import { Brand } from "@/constants/brand";
import { useAuth } from "@/src/auth/AuthContext";

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, linkError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!isEmail(email)) {
      setError("Digite um e-mail válido.");
      return;
    }
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await signIn(email, password);
      if (!result.ok) setError(result.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen>
      <AuthHeading
        title="Acesse sua conta"
        subtitle="Entre com o e-mail e a senha cadastrados."
      />

      <AuthLabeledField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="Informe seu email"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <AuthLabeledField
        label="Senha"
        secureToggle
        value={password}
        onChangeText={setPassword}
        placeholder="Informe sua senha"
        autoComplete="password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={() => {
          void onSubmit();
        }}
      />

      <Pressable
        onPress={() => router.push("/forgot-password" as Href)}
        accessibilityRole="link"
        style={styles.forgotWrap}
      >
        <Text style={styles.forgot}>Esqueci a senha</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {linkError ? <Text style={styles.error}>{linkError}</Text> : null}

      <AuthButton
        label="Entrar"
        onPress={() => void onSubmit()}
        loading={loading}
      />
      <AuthButton
        label="Primeiro acesso"
        variant="outline"
        onPress={() => router.push("/sign-up" as Href)}
        disabled={loading}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: -4,
  },
  forgot: {
    color: Brand.blue,
    fontSize: 13,
    fontWeight: "600",
  },
  error: {
    color: Brand.danger,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
