import { Stack } from 'expo-router';
import { useTheme } from '@/theme/theme';

const SettingsLayout = () => {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
};

export default SettingsLayout;