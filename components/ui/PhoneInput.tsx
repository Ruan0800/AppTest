import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Layout } from '@/constants/Layout';
import {
  DEFAULT_PHONE_COUNTRY,
  findCountryByDialCode,
  formatLocalNumber,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/constants/phoneCountries';

type Props = {
  dialCode: string;
  localNumber: string;
  onDialCodeChange: (dialCode: string) => void;
  onLocalNumberChange: (localNumber: string) => void;
  onCountryChange?: (country: PhoneCountry) => void;
};

export function PhoneInput({
  dialCode,
  localNumber,
  onDialCodeChange,
  onLocalNumberChange,
  onCountryChange,
}: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedCountry = useMemo(() => {
    return findCountryByDialCode(dialCode) ?? DEFAULT_PHONE_COUNTRY;
  }, [dialCode]);

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.iso2.toLowerCase().includes(q)
    );
  }, [search]);

  const selectCountry = (country: PhoneCountry) => {
    onDialCodeChange(country.dialCode);
    onCountryChange?.(country);
    setPickerOpen(false);
    setSearch('');
  };

  const onDialCodeEdit = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    onDialCodeChange(digits);
    const match = findCountryByDialCode(digits);
    if (match) onCountryChange?.(match);
  };

  const onLocalEdit = (value: string) => {
    const max = dialCode === '55' ? 11 : 12;
    onLocalNumberChange(value.replace(/\D/g, '').slice(0, max));
  };

  const localDisplay = formatLocalNumber(localNumber, dialCode);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>Telefone</Text>

      <Pressable
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Selecionar país"
        style={({ pressed }) => [
          styles.countryRow,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <Text style={[styles.countryName, { color: colors.text }]}>
          {selectedCountry.name}
        </Text>
        <FontAwesome name="chevron-down" size={12} color={colors.muted} />
      </Pressable>

      <View style={styles.phoneRow}>
        <View
          style={[
            styles.dialCodeBox,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Text style={[styles.plus, { color: colors.muted }]}>+</Text>
          <TextInput
            value={dialCode}
            onChangeText={onDialCodeEdit}
            keyboardType="phone-pad"
            maxLength={4}
            accessibilityLabel="Código do país"
            style={[styles.dialCodeInput, { color: colors.text }]}
          />
        </View>

        <TextInput
          value={localDisplay}
          onChangeText={onLocalEdit}
          keyboardType="phone-pad"
          placeholder="(85) 99900-6787"
          placeholderTextColor={colors.muted}
          accessibilityLabel="DDD e número de telefone"
          style={[
            styles.localInput,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
        />
      </View>

      <Text style={[styles.hint, { color: colors.muted }]}>
        Escolha o país e digite só o DDD + número. Ex: (85) 99900-6787
      </Text>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Selecione o país
              </Text>
              <Pressable
                onPress={() => setPickerOpen(false)}
                hitSlop={Layout.hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Fechar">
                <FontAwesome name="times" size={18} color={colors.muted} />
              </Pressable>
            </View>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar país ou DDI"
              placeholderTextColor={colors.muted}
              autoFocus
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => `${item.iso2}-${item.dialCode}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected =
                  item.iso2 === selectedCountry.iso2 &&
                  item.dialCode === selectedCountry.dialCode;
                return (
                  <Pressable
                    onPress={() => selectCountry(item)}
                    style={({ pressed }) => [
                      styles.countryItem,
                      {
                        backgroundColor: selected
                          ? colors.accentSoft
                          : 'transparent',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <Text style={[styles.countryItemName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.muted }}>+{item.dialCode}</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.emptySearch, { color: colors.muted }]}>
                  Nenhum país encontrado.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  countryRow: {
    borderWidth: 1,
    borderRadius: Layout.radiusSm,
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryName: {
    fontSize: 16,
    fontWeight: '500',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dialCodeBox: {
    width: 88,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  plus: {
    fontSize: 16,
    fontWeight: '600',
  },
  dialCodeInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  localInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '78%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  countryItem: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countryItemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptySearch: {
    textAlign: 'center',
    paddingVertical: 24,
  },
});
