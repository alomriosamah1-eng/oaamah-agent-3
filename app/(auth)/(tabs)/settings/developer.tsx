import React from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha, CyanNeon, Sky, Green } from '@/theme/colors';
import { TAB_BAR_HEIGHT } from '@/components/BottomTabBar';
import { useI18n } from '@/i18n/provider';

const descriptions = {
  ar: `Osamah Agent هو مشروع تقني طوّره أسامة محمد علي سعيد العُمري، مطوّر ومخطط مشاريع مهتم ببناء حلول برمجية عملية تجمع بين الذكاء الاصطناعي، هندسة البرمجيات، الأتمتة، وإدارة المعرفة.

جاءت فكرة Osamah Agent من رؤية تتجاوز مفهوم المساعد التقليدي؛ ليكون الوكيل قادراً على فهم سياق المستخدم، مساعدته في التفكير والبحث والتحليل، وتنظيم المعلومات، والتعامل مع الملفات والمهام المختلفة، مع التركيز على أن تكون التقنية مفيدة، بسيطة، سريعة، وقريبة من احتياجات الإنسان اليومية.

يعتمد أسامة في تطوير مشاريعه على البحث المستمر، وتجربة التقنيات الحديثة، والاستفادة من المشاريع مفتوحة المصدر، ثم إعادة توظيفها ضمن منظومة متكاملة تخدم الهدف النهائي للمشروع. كما يولي اهتماماً خاصاً بالأداء، وخفة التطبيق، وتجربة المستخدم، والخصوصية، وقابلية التطوير مستقبلاً.

ولا ينظر أسامة إلى البرمجة على أنها مجرد كتابة أكواد، بل يعتبرها وسيلة لتحويل الأفكار والمشكلات إلى حلول حقيقية قابلة للاستخدام. لذلك يجمع في عمله بين التخطيط والتحليل والتطوير وتجربة المستخدم والذكاء الاصطناعي.

يمثل Osamah Agent إحدى أهم تجاربه في هذا المجال، وهو مشروع يتم تطويره بصورة مستمرة بهدف الوصول إلى وكيل ذكي أكثر قدرة على الفهم، وأكثر مرونة في تنفيذ المهام، وأكثر قرباً من المستخدم واحتياجاته.`,
  en: `Osamah Agent is a technology project developed by Osamah Mohammed Ali Saeed Al-Omri, a developer and project planner interested in practical software solutions that combine artificial intelligence, software engineering, automation, and knowledge management.

Osamah Agent was conceived as more than a traditional assistant. It is designed to understand user context, support thinking, research, and analysis, organize information, and work with files and tasks while keeping technology useful, simple, fast, and close to everyday needs.

Osamah develops his projects through continuous research, experimentation with modern technologies, and responsible reuse of open-source work within an integrated system. He gives special attention to performance, a lightweight app experience, usability, privacy, and future extensibility.

He sees programming not merely as writing code, but as a way to turn ideas and problems into practical solutions. His work therefore combines planning, analysis, development, user experience, and artificial intelligence.

Osamah Agent is one of his most important projects in this field. It continues to evolve toward an intelligent agent that understands better, performs tasks more flexibly, and stays closer to real user needs.`,
};

export default function DeveloperPage() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingTop: top + 10, paddingBottom: TAB_BAR_HEIGHT + bottom + 26 }}>
      <Pressable onPress={() => router.back()} style={s.back}><MaterialIcons name="arrow-forward" size={22} color={colors.primary} /><Text style={{ color: colors.primary, ...(typography.labelLarge as any) }}>{t('settings.developerPage.back')}</Text></Pressable>
      <View style={s.hero}>
        <Image source={require('@/assets/images/developer-osamah.png')} style={s.photo} />
        <Text style={{ color: colors.onSurface, ...(typography.headlineSmall as any), fontWeight: FontWeights.bold, textAlign: 'center' }}>{t('settings.developerPage.title')}</Text>
        <Text style={{ color: CyanNeon, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>{t('settings.developerPage.name')}</Text>
      </View>
      <View style={[s.card, { backgroundColor: withAlpha(colors.surfaceVariant, 0.45), borderColor: withAlpha(colors.outline, 0.22) }]}><Text style={{ color: colors.onSurface, ...(typography.bodyMedium as any), lineHeight: 25, textAlign: lang === 'ar' ? 'right' : 'left' }}>{descriptions[lang]}</Text></View>
      <Text style={{ color: colors.onSurface, ...(typography.titleMedium as any), fontWeight: FontWeights.bold, textAlign: lang === 'ar' ? 'right' : 'left', marginTop: 18 }}>{t('settings.developerPage.supportTitle')}</Text>
      <Text style={{ color: colors.onSurfaceVariant, ...(typography.bodyMedium as any), textAlign: lang === 'ar' ? 'right' : 'left', lineHeight: 24, marginTop: 6 }}>{t('settings.developerPage.supportText')}</Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        <Pressable onPress={() => open('https://t.me/Kingoffeeling225')} style={[s.contact, { backgroundColor: withAlpha(Sky, 0.14), borderColor: withAlpha(Sky, 0.35) }]}><MaterialIcons name="send" size={20} color={Sky} /><Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold, flex: 1 }}>{t('settings.developerPage.telegram')}</Text><MaterialIcons name="open-in-new" size={18} color={Sky} /></Pressable>
        <Pressable onPress={() => open('https://wa.me/?text=Hello Osamah, I have feedback about Osamah Agent')} style={[s.contact, { backgroundColor: withAlpha(Green, 0.14), borderColor: withAlpha(Green, 0.35) }]}><MaterialIcons name="chat" size={20} color={Green} /><Text style={{ color: colors.onSurface, ...(typography.titleSmall as any), fontWeight: FontWeights.bold, flex: 1 }}>{t('settings.developerPage.whatsapp')}</Text><MaterialIcons name="open-in-new" size={18} color={Green} /></Pressable>
      </View>
      <Text style={{ color: colors.onSurfaceVariant, ...(typography.labelSmall as any), textAlign: 'center', marginTop: 24 }}>{t('settings.developerPage.footer')}</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({ back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }, hero: { alignItems: 'center', gap: 8, paddingVertical: 10 }, photo: { width: 132, height: 132, borderRadius: 66, borderWidth: 3, borderColor: CyanNeon, marginBottom: 4 }, card: { borderRadius: 18, borderWidth: 1, padding: 16 }, contact: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, padding: 14 } });
