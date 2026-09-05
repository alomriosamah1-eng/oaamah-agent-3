import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/utils/Database';

const Layout = () => {
  return (
    <SQLiteProvider databaseName="chat.db" onInit={migrateDbIfNeeded}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(modal)/image/[url]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </SQLiteProvider>
  );
};

export default Layout;