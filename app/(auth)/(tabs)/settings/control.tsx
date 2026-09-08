import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, Green, Amber, CyanNeon, DarkTextPrimary, DarkTextSecondary } from '@/theme/colors';
import { Spacer } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { storage } from '@/utils/Storage';
import { getZenModels, ZenModelInfo } from '@/utils/OpenCodeAgent';
import { listSkills } from '@/utils/PromptMaker';

type Status = 'checking' | 'connected' | 'missing';

const MODEL_ID_KEY = 'modelID';
const MODEL_PROVIDER_KEY = 'modelProvider';
const SKILLS_CHECK_KEY = 'skillsLastCheck';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [models, setModels] = useState<ZenModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelID, setModelID] = useState('');
  const [skillsUpdating, setSkillsUpdating] = useState(false);
  const [skillsMessage, setSkillsMessage] = useState('');
  const [skillsCount, setSkillsCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const mID = await storage.getString(MODEL_ID_KEY);
      if (active) setModelID(mID ?? '');
    })();
    refresh();
    return () => {
      active = false;
    };
  }, []);

  const refresh = async () => {
    setStatus('checking');
    setLoadingModels(true);
    const list = await getZenModels();
    setModels(list ?? []);
    setStatus(list.length > 0 ? 'connected' : 'missing');
    setLoadingModels(false);
  };

  const selectModel = async (m: ZenModelInfo) => {
    setModelID(m.id);
    await storage.set(MODEL_ID_KEY, m.id);
    await storage.set(MODEL_PROVIDER_KEY, 'opencode');
  };

  const clearModel = async () => {
    setModelID('');
    await storage.delete(MODEL_ID_KEY);
    await storage.delete(MODEL_PROVIDER_KEY);
  };

  // Verifies the agent gateway and refreshes the local skill library metadata.
  const updateSkills = async () => {
    setSkillsUpdating(true);
    setSkillsMessage(t('settings.control.skillsUpdating'));
    try {
      const skills = listSkills();
      setSkillsCount(skills.length);
      const list = await getZenModels();
      setModels(list ?? []);
      setStatus(list.length > 0 ? 'connected' : 'missing');
      await storage.set(SKILLS_CHECK_KEY, String(Date.now()));
      setSkillsMessage(t('settings.control.skillsUpdated'));
    } finally {
      setSkillsUpdating(false);
    }
  };

  const freeModels = models.filter((m) => m.free);
  const otherModels = models.filter((m) => !m.free);

  return (
    <SectionScaffold
      title={t('settings.control.title')}
      subtitle={t('settings.control.subtitle')}
      onBack={() => router.back()}>
      {/* Connection status */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.iconWrap, { backgroundColor: withAlpha(status === 'connected' ? Green : Amber, 0.16) }]}>
            <MaterialIcons name="wifi-tethering" size={20} color={status === 'connected' ? Green : Amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
              {t('settings.control.statusTitle')}
            </Text>
            <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>
              {status === 'connected'
                ? t('settings.control.connected')
                : status === 'checking'
                  ? '…'
                  : t('settings.control.disconnected')}
              {status === 'connected' ? ` · ${models.length}` : ''}
            </Text>
          </View>
          <Pressable onPress={refresh} hitSlop={8} style={s.iconBtn}>
            {loadingModels ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="refresh" size={20} color={colors.primary} />
            )}
          </Pressable>
        </View>
      </View>

      <Spacer h={20} />
      <Text style={s.sectionLabel}>{t('settings.control.modelsTitle')}</Text>
      <Text style={s.sectionHint}>{t('settings.control.modelsHint')}</Text>
      <Spacer h={8} />

      <View style={s.card}>
        <Pressable
          onPress={clearModel}
          style={({ pressed }) => [s.modelRow, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[s.modelDot, { backgroundColor: DarkTextSecondary }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.modelName, { color: colors.onSurface }]}>{t('settings.control.noModel')}</Text>
            <Text style={[s.modelMeta, { color: colors.onSurfaceVariant }]}>{t('appName')}</Text>
          </View>
          <MaterialIcons
            name={!modelID ? 'check-circle' : 'radio-button-unchecked'}
            size={22}
            color={!modelID ? CyanNeon : colors.onSurfaceVariant}
          />
        </Pressable>
        {models.length === 0 && !loadingModels ? (
          <Text style={[s.modelMeta, { color: colors.onSurfaceVariant, padding: 12 }]}>
            {t('settings.control.modelsEmpty')}
          </Text>
        ) : null}

        {freeModels.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => selectModel(m)}
            style={({ pressed }) => [s.modelRow, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[s.modelDot, { backgroundColor: Green }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.modelName, { color: colors.onSurface }]} numberOfLines={1}>{m.id}</Text>
              <Text style={[s.modelMeta, { color: colors.onSurfaceVariant }]}>
                {m.ownedBy ?? t('appName')} · free
              </Text>
            </View>
            <MaterialIcons
              name={modelID === m.id ? 'check-circle' : 'radio-button-unchecked'}
              size={22}
              color={modelID === m.id ? CyanNeon : colors.onSurfaceVariant}
            />
          </Pressable>
        ))}

        {otherModels.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => selectModel(m)}
            style={({ pressed }) => [s.modelRow, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[s.modelDot, { backgroundColor: DarkTextSecondary }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.modelName, { color: colors.onSurface }]} numberOfLines={1}>{m.id}</Text>
              <Text style={[s.modelMeta, { color: colors.onSurfaceVariant }]}>
                {m.ownedBy ?? t('appName')}
              </Text>
            </View>
            <MaterialIcons
              name={modelID === m.id ? 'check-circle' : 'radio-button-unchecked'}
              size={22}
              color={modelID === m.id ? CyanNeon : colors.onSurfaceVariant}
            />
          </Pressable>
        ))}
      </View>

      <Spacer h={20} />
      <Text style={s.sectionLabel}>{t('settings.control.skillsTitle')}</Text>
      <Text style={s.sectionHint}>{t('settings.control.skillsHint')}</Text>
      <Spacer h={8} />

      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.iconWrap, { backgroundColor: withAlpha(Magenta, 0.16) }]}>
            <MaterialIcons name="psychology-alt" size={20} color={Magenta} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold }}>
              {t('settings.control.skillsCountLabel')}: {skillsCount > 0 ? skillsCount : listSkills().length}
            </Text>
            {skillsMessage !== '' ? (
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }} numberOfLines={2}>
                {skillsMessage}
              </Text>
            ) : (
              <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodySmall as any) }}>
                {t('settings.control.skillsHint')}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={updateSkills}
          disabled={skillsUpdating}
          style={({ pressed }) => [
            s.actionBtn,
            { borderColor: withAlpha(Magenta, 0.55), backgroundColor: withAlpha(Magenta, 0.14), opacity: skillsUpdating ? 0.6 : pressed ? 0.75 : 1 },
          ]}>
          {skillsUpdating ? (
            <ActivityIndicator size="small" color={Magenta} />
          ) : (
            <MaterialIcons name="system-update-alt" size={18} color={Magenta} />
          )}
          <Text style={{ color: Magenta, fontSize: 15, fontWeight: '700' as any }}>
            {skillsUpdating ? t('settings.control.skillsUpdating') : t('settings.control.updateSkills')}
          </Text>
        </Pressable>
      </View>

      <Spacer h={14} />
      <Text style={[s.sectionHint, { lineHeight: 18 }]}>{t('settings.control.note')}</Text>
    </SectionScaffold>
  );
};

const Magenta = '#FF0080';

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
  iconBtn: { padding: 6 },
  sectionLabel: { color: DarkTextPrimary, fontSize: 15, fontWeight: '600' as any },
  sectionHint: { color: DarkTextSecondary, fontSize: 12 },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modelDot: { width: 8, height: 8, borderRadius: 4 },
  modelName: { fontSize: 15, fontWeight: '600' as any },
  modelMeta: { fontSize: 12, marginTop: 2 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
});

export default Page;