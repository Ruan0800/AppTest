import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  addKeyword,
  listKeywords,
  removeKeyword,
} from '@/src/db/database';
import { normalizeText } from '@/src/services/keywordMatcher';
import type { Keyword } from '@/src/types';

export default function KeywordsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [word, setWord] = useState('');

  const refresh = useCallback(async () => {
    setKeywords(await listKeywords());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onAdd = async () => {
    const trimmed = word.trim();
    if (!trimmed) {
      Alert.alert('Palavra inválida', 'Digite uma palavra-chave.');
      return;
    }

    const normalized = normalizeText(trimmed);
    const exists = keywords.some((k) => normalizeText(k.word) === normalized);
    if (exists) {
      Alert.alert('Duplicada', 'Essa palavra-chave já está cadastrada.');
      return;
    }

    try {
      await addKeyword(trimmed.toLowerCase());
      setWord('');
      await refresh();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar a palavra-chave.');
    }
  };

  const onRemove = (item: Keyword) => {
    Alert.alert('Remover', `Remover "${item.word}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeKeyword(item.id);
          await refresh();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Quando o app ouvir uma destas palavras, um alerta será disparado.
      </Text>

      <View style={styles.form}>
        <TextInput
          value={word}
          onChangeText={setWord}
          placeholder="Ex: socorro"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          onSubmitEditing={onAdd}
          returnKeyType="done"
        />
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.addButtonText}>Adicionar</Text>
        </Pressable>
      </View>

      <FlatList
        data={keywords}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: 'center' }}>
            Nenhuma palavra-chave cadastrada.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <Text style={[styles.word, { color: colors.text }]}>{item.word}</Text>
            <Pressable onPress={() => onRemove(item)}>
              <Text style={{ color: colors.destructive, fontWeight: '600' }}>Remover</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
  form: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  list: { gap: 8, paddingBottom: 24 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  word: { fontSize: 16, fontWeight: '600' },
});
