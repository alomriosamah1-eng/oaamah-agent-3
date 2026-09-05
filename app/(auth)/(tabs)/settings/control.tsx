import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, Green, Amber, CyanNeon } from '@/theme/colors';
import { Spacer } from '@/theme/primitives';
import { SectionScaffold } from '@/components/SectionScaffold';
import { useI18n } from '@/i18n/provider';
import { storage } from '@/utils/Storage';
import { getZenModels, ZenModelInfo } from '@/utils/OpenCodeAgent';
import { Chip } from '@/theme/primitives';

type Status = 'checking' | 'connected' | 'missing';

const MODEL_ID_KEY = 'modelID';
const MODEL_PROVIDER_KEY = 'modelProvider';

const Page = () => {
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [models, setModels] = useState<ZenModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelID, setModelID] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const mID = await storage.getString(MODEL_ID_KEY);
      if (active) {
        setModelID(mID ?? '');
      }
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

  const selectedModel = modelID ? `opencode/${modelID}` : '';

  return (
    <SectionScaffold
      title={t('settings.control.title')}
      subtitle={t('settings.control.subtitle')}
      onBack={() => router.back()}>
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={[s.iconWrap, { backgroundColor: withAlpha(Green, 0.16) }]}>
            <MaterialIcons name="wifi-tethering" size={20} color={Green} />
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
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: status === 'connected' ? Green : Amber,
            }}
          />
        </View>
      </View>

      <Spacer h={18} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{t('settings.control.modelsTitle')}</Text>
          <Text style={s.hint}>{t('settings.control.modelsHint')}</Text>
        </View>
        <Chip label={t('settings.control.modelsRefresh')} icon="refresh" selected={false} onPress={refresh} />
      </View>
      <Spacer h={8} />

      {loadingModels ? (
        <View style={{ alignItems: 'center', paddingVertical: 18 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : models.length === 0 ? (
        <Text style={[s.hint, { lineHeight: 18 }]}>{t('settings.control.modelsEmpty')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip
            label={t('settings.control.noModel')}
            accent={CyanNeon}
            selected={!modelID}
            onPress={clearModel}
          />
          {models.map((m) => {
            const freeSuffix = m.free ? ' ●' : '';
            const label = `${m.id}${freeSuffix}`;
            return (
              <Chip
                key={m.id}
                label={label}
                accent={m.free ? Green : undefined}
                selected={modelID === m.id}
                onPress={() => selectModel(m)}
              />
            );
          })}
        </View>
      )}

      {selectedModel ? (
        <>
          <Spacer h={10} />
          <Text style={[s.hint, { lineHeight: 18 }]}>
            {selectedModel}
          </Text>
        </>
      ) : null}

      <Spacer h={14} />
      <Text style={[s.hint, { lineHeight: 18 }]}>{t('settings.control.note')}</Text>
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
  label: { color: '#F9FAFB', fontSize: 15, fontWeight: '600' as any },
  hint: { color: '#9CA3AF', fontSize: 12 },
});

export default Page;