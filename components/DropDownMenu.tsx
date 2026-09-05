import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';

export type Props = {
  items: Array<{
    key: string;
    title: string;
    icon: string;
  }>;
  onSelect: (key: string) => void;
};

const DropDownMenu = ({ items, onSelect }: Props) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={24} color={colors.onBackground} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { backgroundColor: withAlpha(colors.surfaceContainer, 0.98) }]}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.row}
                onPress={() => {
                  setOpen(false);
                  onSelect(item.key);
                }}>
                <Ionicons name={item.icon as any} size={18} color={colors.onSurfaceVariant} />
                <Text style={[styles.rowText, { color: colors.onSurface }]}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  menu: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rowText: {
    fontSize: 16,
    fontWeight: '500' as any,
    flex: 1,
  },
});
export default DropDownMenu;