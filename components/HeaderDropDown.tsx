import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/theme';
import { typography, FontWeights } from '@/theme/typography';
import { withAlpha } from '@/theme/colors';

export type Props = {
  title: string;
  items: Array<{
    key: string;
    title: string;
    icon: string;
    include?: boolean;
  }>;
  selected?: string;
  onSelect: (key: string) => void;
};

const HeaderDropDown = ({ title, selected, items, onSelect }: Props) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={8}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.onBackground, ...(typography.titleMedium as any), fontWeight: FontWeights.bold }}>
            {title}
          </Text>
          {selected && (
            <Text style={{ marginLeft: 10, fontSize: 16, fontWeight: '600' as any, color: colors.primary }}>
              {selected} &gt;
            </Text>
          )}
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.6)' }]} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { backgroundColor: withAlpha(colors.surfaceContainer, 0.98) }]}>
            {items.map((item) => {
              const isSelected = item.key === selected;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={styles.row}
                  onPress={() => {
                    setOpen(false);
                    onSelect(item.key);
                  }}>
                  <Ionicons name={item.icon as any} size={18} color={isSelected ? colors.primary : colors.onSurfaceVariant} />
                  <Text style={[styles.rowText, { color: colors.onSurface }, isSelected && { color: colors.primary }]}>
                    {item.title}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
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
export default HeaderDropDown;