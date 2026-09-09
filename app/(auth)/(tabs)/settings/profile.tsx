import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, Amber, CyanNeon, Red } from '@/theme/colors';
import { Spacer, FilledButton, OutlinedButton } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import {
  clearProfile,
  getFieldGroups,
  LANGUAGE_OPTIONS,
  loadProfile,
  ProfileOption,
  RESEARCH_DEPTH_OPTIONS,
  RESPONSE_LENGTH_OPTIONS,
  saveProfile,
  TECHNICAL_LEVEL_OPTIONS,
  THEME_OPTIONS,
  TONE_OPTIONS,
  UserProfile,
} from '@/utils/UserProfile';

const s = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: {
    marginTop: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: { fontSize: 13 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  multiselectInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: 6 },
});

const Page = () => {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const currentProfile = useRef<UserProfile | null>(null);

  const groups = useMemo(() => getFieldGroups(), []);

  useEffect(() => {
    loadProfile().then((p) => {
      currentProfile.current = p;
      setProfile(p);
    });
  }, []);

  const isEnglish = lang === 'en';

  const optionLabel = (opt: ProfileOption) => (isEnglish ? opt.labelEn : opt.labelAr);

  const selectOptionsFor = (key: keyof UserProfile): ProfileOption[] => {
    switch (key) {
      case 'preferredLanguage': return LANGUAGE_OPTIONS;
      case 'preferredTone': return TONE_OPTIONS;
      case 'technicalLevel': return TECHNICAL_LEVEL_OPTIONS;
      case 'responseLength': return RESPONSE_LENGTH_OPTIONS;
      case 'researchDepth': return RESEARCH_DEPTH_OPTIONS;
      case 'themePreference': return THEME_OPTIONS;
      default: return [];
    }
  };

  const fieldLabels: Record<string, { ar: string; en: string }> = {
    name: { ar: 'الاسم الكامل', en: 'Full name' },
    preferredName: { ar: 'الاسم المفضل', en: 'Preferred name' },
    education: { ar: 'المؤهل العلمي', en: 'Education' },
    experience: { ar: 'الخبرة', en: 'Experience' },
    preferredLanguage: { ar: 'اللغة المفضلة', en: 'Preferred language' },
    preferredTone: { ar: 'النبرة المفضلة', en: 'Preferred tone' },
    profession: { ar: 'المهنة', en: 'Profession' },
    specialization: { ar: 'التخصص', en: 'Specialization' },
    field: { ar: 'المجال / القطاع', en: 'Field / sector' },
    technicalLevel: { ar: 'المستوى التقني', en: 'Technical level' },
    skillLevel: { ar: 'مستوى المهارة', en: 'Skill level' },
    interests: { ar: 'الاهتمامات', en: 'Interests' },
    preferredTopics: { ar: 'المواضيع المفضلة', en: 'Preferred topics' },
    preferredFileTypes: { ar: 'أنواع الملفات', en: 'File types' },
    preferredDesignStyle: { ar: 'أسلوب التصميم', en: 'Design style' },
    goals: { ar: 'الأهداف', en: 'Goals' },
    learningGoals: { ar: 'أهداف التعلم', en: 'Learning goals' },
    productionGoals: { ar: 'أهداف الإنتاج', en: 'Production goals' },
    responseLength: { ar: 'طول الرد', en: 'Response length' },
    researchDepth: { ar: 'عمق البحث', en: 'Research depth' },
    explanationStyle: { ar: 'أسلوب الشرح', en: 'Explanation style' },
    preferredOutputFormat: { ar: 'صيغة المخرجات', en: 'Output format' },
    themePreference: { ar: 'الثيم المفضل', en: 'Theme preference' },
  };

  const labelOf = (key: string) => {
    const entry = fieldLabels[key];
    if (!entry) return key;
    return isEnglish ? entry.en : entry.ar;
  };

  const readArray = (key: string): string[] => {
    if (!profile) return [];
    const v = currentProfile.current?.[key as keyof UserProfile];
    return Array.isArray(v) ? (v as string[]) : [];
  };

  const readString = (key: string): string => {
    if (!profile) return '';
    const v = currentProfile.current?.[key as keyof UserProfile];
    return typeof v === 'string' ? v : '';
  };

  const setField = (key: keyof UserProfile, value: unknown) => {
    const base = currentProfile.current ?? profile;
    if (!base) return;
    const next = { ...base, [key]: value };
    currentProfile.current = next;
    setProfile(next);
  };

  const commit = async () => {
    const base = currentProfile.current ?? profile;
    if (!base) return;
    await saveProfile(base);
    Alert.alert(t('userProfile.saved'), t('userProfile.savedBody'));
  };

  const doClear = async () => {
    Alert.alert(t('userProfile.clear'), t('userProfile.clearBody'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('userProfile.clear'),
        style: 'destructive',
        onPress: async () => {
          await clearProfile();
          const fresh = await loadProfile();
          currentProfile.current = fresh;
          setProfile(fresh);
          Alert.alert(t('userProfile.clearDone'), t('userProfile.clearDoneBody'));
        },
      },
    ]);
  };

  const addChip = (key: keyof UserProfile, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = readArray(key as string);
    const next = current.includes(trimmed) ? current : [...current, trimmed];
    setField(key, next);
    setDrafts((d) => ({ ...d, [key]: [] }));
  };

  const removeChip = (key: keyof UserProfile, value: string) => {
    const current = readArray(key as string);
    setField(key, current.filter((v) => v !== value));
  };

  const toggleChoice = (key: keyof UserProfile, destructiveValue: string, value: string) => {
    setField(key, value === destructiveValue ? '' : value);
  };

  const textGroupValue = (key: string) => (drafts[key]?.[0] ?? readString(key));

  if (!profile) {
    return (
      <SectionScaffold title={t('userProfile.title')} subtitle={t('userProfile.subtitle')} onBack={() => router.back()}>
        <Spacer h={0} />
        <Text style={{ color: colors.onSurfaceVariant }}>{t('chat.loading.preparing')}</Text>
      </SectionScaffold>
    );
  }

  return (
    <SectionScaffold
      title={t('userProfile.title')}
      subtitle={t('userProfile.subtitle')}
      onBack={() => router.back()}>
      {groups.map((group) => (
        <View key={group.key} style={[s.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}>
          <View style={s.groupTitle}>
            <View style={[s.iconWrap, { backgroundColor: withAlpha(group.color, 0.16) }]}>
              <MaterialIcons name={group.icon as any} size={20} color={group.color} />
            </View>
            <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }} numberOfLines={1}>
              {isEnglish ? group.labelEn : group.labelAr}
            </Text>
          </View>

          {group.fields.map((field) => {
            const key = field.key as keyof UserProfile;
            const opts = selectOptionsFor(key);

            if (field.type === 'select') {
              return (
                <View key={key as string}>
                  <Text style={[s.fieldLabel, { color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }]}>
                    {labelOf(key as string)}
                  </Text>
                  <View style={s.chips}>
                    {opts.map((opt) => {
                      const selected = readString(key as string) === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => toggleChoice(key, readString(key as string), opt.value)}
                          style={[
                            s.chip,
                            {
                              backgroundColor: selected ? withAlpha(CyanNeon, 0.16) : 'transparent',
                              borderColor: selected ? CyanNeon : withAlpha(colors.outline, 0.3),
                            },
                          ]}>
                          <Text style={[s.chipLabel, { color: selected ? CyanNeon : colors.onSurface }]}>{optionLabel(opt)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            }

            if (field.type === 'toggle') {
              const on = readString(key as string) === opts[0]?.value;
              return (
                <View key={key as string}>
                  <View style={[s.fieldLabel, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }}>{labelOf(key as string)}</Text>
                    <Switch
                      value={on}
                      onValueChange={(v) => setField(key, v ? opts[0]?.value : '')}
                      trackColor={{ true: withAlpha(CyanNeon, 0.5), false: withAlpha(colors.outline, 0.3) }}
                      thumbColor={on ? CyanNeon : colors.onSurfaceVariant}
                    />
                  </View>
                </View>
              );
            }

            if (field.type === 'multiselect') {
              const items = readArray(key as string);
              return (
                <View key={key as string}>
                  <Text style={[s.fieldLabel, { color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }]}>
                    {labelOf(key as string)}
                  </Text>
                  <View style={s.chips}>
                    {items.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => removeChip(key, item)}
                        style={[s.chip, { backgroundColor: withAlpha(Amber, 0.14), borderColor: withAlpha(Amber, 0.4) }]}>
                        <Text style={[s.chipLabel, { color: Amber }]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.addRow}>
                    <TextInput
                      style={[s.multiselectInput, { backgroundColor: withAlpha(colors.surfaceVariant, 0.4), borderColor: withAlpha(colors.outline, 0.3), color: colors.onSurface }]}
                      value={drafts[key as string]?.[0] ?? ''}
                      onChangeText={(v) => setDrafts((d) => ({ ...d, [key]: [v] }))}
                      onSubmitEditing={() => addChip(key, drafts[key as string]?.[0] ?? '')}
                      placeholder={isEnglish ? field.placeholderEn : field.placeholderAr}
                      placeholderTextColor={colors.onSurfaceVariant}
                      returnKeyType="done"
                    />
                    {items.length > 0 || (drafts[key as string]?.[0] ?? '').trim() ? (
                      <Pressable
                        onPress={() => addChip(key, drafts[key as string]?.[0] ?? '')}
                        hitSlop={8}
                        style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.6 : 1 }]}>
                        <MaterialIcons name="add-circle-outline" size={24} color={CyanNeon} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            }

            return (
              <View key={key as string}>
                <Text style={[s.fieldLabel, { color: colors.onSurfaceVariant, ...(typography.labelSmall as any) }]}>
                  {labelOf(key as string)}
                </Text>
                <TextInput
                  style={[s.input, { backgroundColor: withAlpha(colors.surfaceVariant, 0.4), borderColor: withAlpha(colors.outline, 0.3), color: colors.onSurface }]}
                  value={textGroupValue(key as string)}
                  onChangeText={(v) => {
                    setDrafts((d) => ({ ...d, [key]: [v] }));
                    setField(key, v);
                  }}
                  multiline={field.type === 'textarea'}
                  placeholder={isEnglish ? field.placeholderEn : field.placeholderAr}
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
            );
          })}
        </View>
      ))}

      <View style={s.saveBar}>
        <FilledButton label={t('userProfile.saved')} icon="check" backgroundColor={withAlpha(Amber, 0.85)} onPress={commit} />
        <OutlinedButton label={t('userProfile.clear')} icon="delete-outline" color={Red} onPress={doClear} />
      </View>
      <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any), textAlign: 'center' }}>
        {t('userProfile.readOnlyNote')}
      </Text>
      <Spacer h={12} />
    </SectionScaffold>
  );
};

export default Page;
