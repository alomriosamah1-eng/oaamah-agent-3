import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, ElectricBlue, CyanNeon } from '@/theme/colors';
import { Spacer } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { SPEAK_OUTPUT_KEY, storage } from '@/utils/Storage';
import { VoiceGender, loadVoiceConfig, saveVoiceConfig } from '@/utils/voice/config';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const [speak, setSpeak] = useState(false);
  const [gender, setGender] = useState<VoiceGender>('female');

  useEffect(() => {
    (async () => {
      const so = await storage.getString(SPEAK_OUTPUT_KEY);
      setSpeak(so === 'true' || so === '1');
      const cfg = await loadVoiceConfig();
      setGender(cfg.gender);
    })();
  }, []);

  const pickGender = async (g: VoiceGender) => {
    setGender(g);
    const cfg = await loadVoiceConfig();
    await saveVoiceConfig({ ...cfg, gender: g });
  };

  const genders: { key: VoiceGender; label: string }[] = [
    { key: 'male', label: t('voice.voiceMale') },
    { key: 'female', label: t('voice.voiceFemale') },
  ];

  return (
    <SectionScaffold
      title={t('settings.chatSettings.title')}
      subtitle={t('settings.chatSettings.subtitle')}
      onBack={() => router.back()}>
      <View style={[s.tile, { borderColor: withAlpha(ElectricBlue, 0.35) }]}>
        <View style={[s.iconWrap, { backgroundColor: withAlpha(ElectricBlue, 0.16) }]}>
          <MaterialIcons name="record-voice-over" size={22} color={ElectricBlue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
            {t('settings.chatSettings.speakLabel')}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>{t('settings.chatSettings.speakHint')}</Text>
        </View>
        <Switch
          value={speak}
          onValueChange={(v) => {
            setSpeak(v);
            storage.set(SPEAK_OUTPUT_KEY, v ? '1' : '0');
          }}
          trackColor={{ true: colors.primary }}
          thumbColor={'#fff'}
        />
      </View>

      <Spacer h={12} />

      <Text style={[s.hint, { lineHeight: 18 }]}>
        {t('settings.chatSettings.voiceLabel')}
      </Text>
      <View style={[s.tile, { borderColor: withAlpha(CyanNeon, 0.25) }]}>
        <View style={[s.iconWrap, { backgroundColor: withAlpha(CyanNeon, 0.16) }]}>
          <MaterialIcons name="hearing" size={22} color={CyanNeon} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {genders.map((g) => {
            const focused = gender === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => pickGender(g.key)}
                style={[
                  s.row,
                  { borderColor: focused ? withAlpha(CyanNeon, 0.7) : withAlpha(colors.outline, 0.25) },
                  focused && { backgroundColor: withAlpha(CyanNeon, 0.12) },
                ]}>
                <MaterialIcons
                  name={focused ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={18}
                  color={focused ? CyanNeon : colors.onSurfaceVariant}
                />
                <Text
                  style={{ color: focused ? CyanNeon : colors.onSurface, ...(typography.bodyMedium as any), fontWeight: FontWeights.semiBold }}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Spacer h={12} />
      <Text style={[s.hint, { lineHeight: 18 }]}>
        {t('appName')} — {t('appSubtitle')}
      </Text>
    </SectionScaffold>
  );
};

const s = StyleSheet.create({
  hint: { color: '#9CA3AF', fontSize: 12 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(31,41,55,0.5)',
    borderWidth: 1,
    padding: 14,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

export default Page;