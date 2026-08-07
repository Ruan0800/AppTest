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
  addContact,
  listContacts,
  removeContact,
} from '@/src/db/database';
import type { Contact } from '@/src/types';

export default function ContactsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const refresh = useCallback(async () => {
    setContacts(await listContacts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onAdd = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim().replace(/\s+/g, '');

    if (!trimmedName || !trimmedPhone) {
      Alert.alert('Dados incompletos', 'Informe nome e telefone.');
      return;
    }

    if (!/^\+?\d{8,15}$/.test(trimmedPhone)) {
      Alert.alert(
        'Telefone inválido',
        'Use apenas números, com DDI se possível (ex: 5511999999999).'
      );
      return;
    }

    try {
      await addContact(trimmedName, trimmedPhone);
      setName('');
      setPhone('');
      await refresh();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o contato.');
    }
  };

  const onRemove = (item: Contact) => {
    Alert.alert('Remover', `Remover ${item.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeContact(item.id);
          await refresh();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.hint, { color: colors.muted }]}>
        Contatos de emergência. No alerta, o WhatsApp abre com mensagem contendo
        palavra/SOS, horário, localização e este contato. Use DDI+número (ex:
        5511999999999). Você ainda precisa tocar em Enviar no WhatsApp.
      </Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nome"
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Telefone (ex: 5511999999999)"
        placeholderTextColor={colors.muted}
        keyboardType="phone-pad"
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
      />
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Text style={styles.addButtonText}>Adicionar contato</Text>
      </Pressable>

      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={{ color: colors.muted, textAlign: 'center' }}>
            Nenhum contato cadastrado.
          </Text>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={{ color: colors.muted }}>{item.phone}</Text>
            </View>
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
  container: { flex: 1, padding: 16, gap: 10 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  addButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
  list: { gap: 8, paddingBottom: 24, paddingTop: 8 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
});
