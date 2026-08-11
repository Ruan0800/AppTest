import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import { MAX_KEYWORDS } from '@/constants/limits';
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
  const inputRef = useRef<TextInput>(null);
  const atLimit = keywords.length >= MAX_KEYWORDS;

  const refresh = useCallback(async () => {
    setKeywords(await listKeywords());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onAdd = async () => {
    if (keywords.length >= MAX_KEYWORDS) {
      Alert.alert(
        'Limite atingido',
        `Você pode cadastrar no máximo ${MAX_KEYWORDS} palavras-chave. Remova uma para adicionar outra.`
      );
      return;
    }

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
      <View style={styles.hintRow}>
        <Text style={[styles.hint, { color: colors.muted, flex: 1 }]}>
          Quando o app ouvir uma destas palavras, um alerta será disparado.
        </Text>
        <Text
          style={[
            styles.counter,
            { color: atLimit ? colors.warning : colors.muted },
          ]}>
          {keywords.length}/{MAX_KEYWORDS}
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGrow}>
          <TextField
            ref={inputRef}
            label="Palavra-chave"
            value={word}
            onChangeText={setWord}
            placeholder="Ex: socorro"
            autoCapitalize="none"
            onSubmitEditing={onAdd}
            returnKeyType="done"
            editable={!atLimit}
          />
        </View>
        <Button
          label="Adicionar"
          onPress={onAdd}
          disabled={atLimit}
          style={styles.addButton}
          accessibilityLabel="Adicionar palavra-chave"
        />
      </View>

      <FlatList
        data={keywords}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="microphone"
            title="Nenhuma palavra ainda"
            description="Cadastre palavras que, ao serem ouvidas, disparam o alerta."
            actionLabel=""
            onAction={() => inputRef.current?.focus()}
          />
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <Text style={[styles.word, { color: colors.text }]}>{item.word}</Text>
            <IconButton
              icon="trash-o"
              tone="destructive"
              accessibilityLabel={`Remover palavra ${item.word}`}
              onPress={() => onRemove(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Layout.screenPadding,
    gap: Layout.gap,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  hint: { fontSize: 13, lineHeight: 18 },
  counter: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  form: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputGrow: {
    flex: 1,
  },
  addButton: {
    paddingHorizontal: 14,
    minWidth: 110,
  },
  list: { gap: 8, paddingBottom: 24, flexGrow: 1 },
  row: {
    borderWidth: 1,
    borderRadius: Layout.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  word: { fontSize: 16, fontWeight: '600', flex: 1 },
});
