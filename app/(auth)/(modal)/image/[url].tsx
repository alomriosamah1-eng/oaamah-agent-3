import { Ionicons, Octicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadAndSaveImage, shareImage } from '@/utils/Image';
import DropDownMenu from '@/components/DropDownMenu';
import { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/theme';
import { useI18n } from '@/i18n/provider';
import { withAlpha } from '@/theme/colors';

const Page = () => {
  const { url, prompt } = useLocalSearchParams<{ url: string; prompt?: string }>();
  const { bottom } = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [showPrompt, setShowPrompt] = useState(false);
  const imageUrl = useMemo(() => decodeURIComponent(url), [url]);

  const onCopyPrompt = async () => {
    await Clipboard.setStringAsync(prompt ?? '');
    setShowPrompt(false);
    Alert.alert(t('imageViewer.copied'), t('imageViewer.copiedBody'));
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />

      <View
        style={[
          styles.blurContainer,
          { paddingBottom: bottom + 16, backgroundColor: 'rgba(0,0,0,0.55)' },
        ]}>
        <View style={styles.row}>
          <DropDownMenu
            items={[{ key: '1', title: t('imageViewer.viewPrompt'), icon: 'info' }]}
            onSelect={() => setShowPrompt(true)}
          />
          <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => downloadAndSaveImage(imageUrl)}>
            <Octicons name="download" size={24} color="white" />
            <Text style={styles.btnText}>{t('imageViewer.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => shareImage(imageUrl)}>
            <Octicons name="share" size={24} color="white" />
            <Text style={styles.btnText}>{t('imageViewer.share')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={showPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrompt(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPrompt(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.promptCard, { backgroundColor: withAlpha(colors.surfaceContainer, 0.98) }]}
            onPress={() => {}}>
            <View style={styles.promptHeader}>
              <Text style={[styles.promptTitle, { color: colors.onBackground }]}>{t('imageViewer.prompt')}</Text>
              <TouchableOpacity onPress={() => setShowPrompt(false)} hitSlop={10}>
                <Ionicons name="close-outline" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.promptText, { color: colors.onSurface }]}>
              {prompt ?? t('imageViewer.noPrompt')}
            </Text>
            <TouchableOpacity style={[styles.copyBtn, { backgroundColor: colors.primary }]} onPress={onCopyPrompt}>
              <Text style={styles.copyText}>{t('imageViewer.copy')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
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
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    paddingTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  promptCard: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  promptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  promptTitle: {
    fontSize: 18,
    fontWeight: 'bold' as any,
  },
  promptText: {
    fontSize: 15,
    lineHeight: 22,
  },
  copyBtn: {
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 20,
  },
  copyText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '500' as any,
  },
});
export default Page;