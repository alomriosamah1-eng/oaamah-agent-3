import { Ionicons, Octicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { File } from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { removeSavedFile } from '@/utils/savedFiles';
import { useTheme } from '@/theme/theme';
import { useI18n } from '@/i18n/provider';

const Page = () => {
  const { uri, id, preview } = useLocalSearchParams<{ uri: string; id?: string; preview?: string }>();
  const { top, bottom } = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const pdfUri = uri ? decodeURIComponent(uri) : '';
  const previewUri = preview ? decodeURIComponent(preview) : '';

  useEffect(() => {
    let active = true;
    (async () => {
      if (!previewUri) {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
        return;
      }
      try {
        const previewFile = new File(previewUri);
        if (!previewFile.exists) throw new Error('missing preview');
        const content = await previewFile.text();
        if (!active) return;
        setHtml(content || null);
        if (!content) setFailed(true);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  });

  const onShare = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: t('pdfViewer.title'),
        });
      } else {
        Alert.alert(t('pdfViewer.noPreviewHint'));
      }
    } catch {
      Alert.alert(t('pdfViewer.noPreviewHint'));
    }
  };

  const onDelete = () => {
    Alert.alert(t('pdfViewer.deleteTitle'), t('pdfViewer.deleteBody'), [
      { text: t('pdfViewer.cancel'), style: 'cancel' },
      {
        text: t('pdfViewer.delete'),
        style: 'destructive',
        onPress: async () => {
          if (id) await removeSavedFile(id);
          Alert.alert(t('pdfViewer.deleted'));
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: top + 10 }]}
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityLabel={t('pdfViewer.close')}>
        <Ionicons name="close" size={22} color="#fff" />
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.hintText, { color: colors.onSurfaceVariant }]}>
            {t('pdfViewer.loading')}
          </Text>
        </View>
      ) : failed || !html ? (
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.surfaceContainer }]}>
            <Ionicons name="document-text-outline" size={40} color={colors.onSurfaceVariant} />
          </View>
          <Text style={[styles.hintText, { color: colors.onSurface }]}>
            {t('pdfViewer.noPreview')}
          </Text>
          <Text style={[styles.hintText, { color: colors.onSurfaceVariant }]}>
            {t('pdfViewer.noPreviewHint')}
          </Text>
        </View>
      ) : (
        <WebView
          source={{ html }}
          originWhitelist={['*']}
          style={{ flex: 1, backgroundColor: '#FFFFFF' }}
          domStorageEnabled={false}
          javaScriptEnabled={false}
          setBuiltInZoomControls={false}
        />
      )}

      <View
        style={[
          styles.blurContainer,
          { paddingBottom: bottom + 16, backgroundColor: 'rgba(0,0,0,0.55)' },
        ]}>
        <View style={styles.row}>
          <TouchableOpacity style={styles.action} onPress={onShare}>
            <Octicons name="share" size={24} color="white" />
            <Text style={styles.btnText}>{t('pdfViewer.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={onDelete}>
            <Octicons name="trash" size={24} color="white" />
            <Text style={styles.btnText}>{t('pdfViewer.delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  hintText: {
    fontSize: 15,
    textAlign: 'center',
  },
  blurContainer: {
    width: '100%',
    position: 'absolute',
    bottom: 0,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 48,
  },
  action: {
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    paddingTop: 6,
  },
});
export default Page;