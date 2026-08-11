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
import { PhoneInput } from '@/components/ui/PhoneInput';
import { TextField } from '@/components/ui/TextField';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import { MAX_CONTACTS } from '@/constants/limits';
import {
  buildFullPhone,
  DEFAULT_PHONE_COUNTRY,
  formatPhoneDisplay,
} from '@/constants/phoneCountries';
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
  const [dialCode, setDialCode] = useState(DEFAULT_PHONE_COUNTRY.dialCode);
  const [localNumber, setLocalNumber] = useState('');
  const nameRef = useRef<TextInput>(null);
  const atLimit = contacts.length >= MAX_CONTACTS;

  const refresh = useCallback(async () => {
    setContacts(await listContacts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onAdd = async () => {
    if (contacts.length >= MAX_CONTACTS) {
      Alert.alert(
        'Limite atingido',
        `Você pode cadastrar no máximo ${MAX_CONTACTS} contatos de emergência. Remova um para adicionar outro.`
      );
      return;
    }

    const trimmedName = name.trim();
    const fullPhone = buildFullPhone(dialCode, localNumber);

    if (!trimmedName || !localNumber.trim()) {
      Alert.alert('Dados incompletos', 'Informe nome e telefone.');
      return;
    }

    if (!dialCode.trim()) {
      Alert.alert('DDI inválido', 'Selecione um país ou informe o código.');
      return;
    }

    // BR: DDD (2) + número (8 ou 9). Outros: 6–12 dígitos locais.
    const localDigits = localNumber.replace(/\D/g, '');
    if (dialCode === '55') {
      if (!/^\d{10,11}$/.test(localDigits)) {
        Alert.alert(
          'Telefone inválido',
          'No Brasil, digite DDD + número (ex: 11999999999).'
        );
        return;
      }
    } else if (localDigits.length < 6 || localDigits.length > 12) {
      Alert.alert(
        'Telefone inválido',
        'Digite o número local com DDD/área, sem o código do país.'
      );
      return;
    }

    if (fullPhone.length < 8 || fullPhone.length > 15) {
      Alert.alert('Telefone inválido', 'Número completo fora do formato esperado.');
      return;
    }

    try {
      await addContact(trimmedName, fullPhone);
      setName('');
      setLocalNumber('');
      setDialCode(DEFAULT_PHONE_COUNTRY.dialCode);
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
      <View style={styles.hintRow}>
        <Text style={[styles.hint, { color: colors.muted, flex: 1 }]}>
          Contatos de emergência. No alerta, o WhatsApp abre com a mensagem pronta.
        </Text>
        <Text
          style={[
            styles.counter,
            { color: atLimit ? colors.warning : colors.muted },
          ]}>
          {contacts.length}/{MAX_CONTACTS}
        </Text>
      </View>

      <TextField
        ref={nameRef}
        label="Nome"
        value={name}
        onChangeText={setName}
        placeholder="Ex: Maria"
        autoCapitalize="words"
        editable={!atLimit}
      />

      <PhoneInput
        dialCode={dialCode}
        localNumber={localNumber}
        onDialCodeChange={setDialCode}
        onLocalNumberChange={setLocalNumber}
      />

      <Button
        label="Adicionar contato"
        onPress={onAdd}
        disabled={atLimit}
        accessibilityLabel="Adicionar contato de emergência"
      />

      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="Nenhum contato ainda"
            description="Cadastre quem deve receber o alerta pelo WhatsApp."
            actionLabel=""
            onAction={() => nameRef.current?.focus()}
          />
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}>
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={{ color: colors.muted }}>
                {formatPhoneDisplay(item.phone)}
              </Text>
            </View>
            <IconButton
              icon="trash-o"
              tone="destructive"
              accessibilityLabel={`Remover contato ${item.name}`}
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
  list: { gap: 8, paddingBottom: 24, paddingTop: 4, flexGrow: 1 },
  row: {
    borderWidth: 1,
    borderRadius: Layout.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: { fontSize: 16, fontWeight: '600' },
});
