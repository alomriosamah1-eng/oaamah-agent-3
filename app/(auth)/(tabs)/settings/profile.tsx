import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, Amber } from '@/theme/colors';
import { Spacer, FilledButton } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { storage, NAME_KEY } from '@/utils/Storage';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState('');

  useEffect(() => {
    storage.getString(NAME_KEY).then((value) => setName(value ?? ''));
  }, []);

  const save = async () => {
    await storage.set(NAME_KEY, name.trim());
    Alert.alert(t('settings.profile.saved'), t('settings.profile.savedBody'));
  };

  return (
    <SectionScaffold
      title={t('settings.profile.title')}
      subtitle={t('settings.profile.subtitle')}
      onBack={() => router.back()}>
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.iconWrap, { backgroundColor: withAlpha(Amber, 0.16) }]}>
            <MaterialIcons name="person" size={22} color={Amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
              {t('settings.profile.nameLabel')}
            </Text>
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('settings.profile.nameHint')}</Text>
          </View>
        </View>
        <Spacer h={14} />
        <TextInput
          style={[
            s.field,
            {
              backgroundColor: withAlpha(colors.surfaceVariant, 0.5),
              borderColor: withAlpha(colors.outline, 0.3),
            },
          ]}
          value={name}
          onChangeText={setName}
          placeholder={t('settings.profile.namePlaceholder')}
          placeholderTextColor={colors.onSurfaceVariant}
        />
        <Spacer h={14} />
        <FilledButton label={t('settings.profile.save')} icon="check" backgroundColor={withAlpha(Amber, 0.85)} onPress={save} />
      </View>
    </SectionScaffold>
  );
};

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: 'rgba(31,41,55,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F9FAFB',
    fontSize: 15,
  },
});

export default Page;