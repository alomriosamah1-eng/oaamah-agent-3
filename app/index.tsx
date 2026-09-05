import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View, ActivityIndicator } from 'react-native';
import { Image } from 'react-native';
import { useTheme } from '@/theme/theme';
import { withAlpha } from '@/theme/colors';

const Page = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/(auth)/(tabs)');
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.logoContainer, { width: width * 0.45, height: width * 0.45, borderColor: withAlpha(colors.outline, 0.3) }]}>
        <Image
          source={require('../assets/images/logo-white.png')}
          resizeMode="contain"
          style={styles.logo}
        />
      </View>
      <ActivityIndicator color={colors.primary} style={styles.loader} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  loader: {
    marginTop: 24,
  },
});
export default Page;