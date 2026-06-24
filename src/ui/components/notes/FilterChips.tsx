import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Colors, Fonts, Layout } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';

export type FilterType = 'All' | 'AI Transcribed' | 'Personal' | 'Work' | 'Pinned';

interface FilterChipsProps {
  selectedFilter: FilterType;
  onSelectFilter: (filter: FilterType) => void;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  selectedFilter,
  onSelectFilter,
}) => {
  const themed = useThemedStyles();

  const filters: FilterType[] = ['All', 'AI Transcribed', 'Personal', 'Work', 'Pinned'];

  return (
    <View style={styles.filterContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroller}
      >
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              themed.filterChip,
              selectedFilter === filter && styles.filterChipActive,
            ]}
            onPress={() => onSelectFilter(filter)}
          >
            <Text
              style={[
                styles.filterChipText,
                themed.filterChipText,
                selectedFilter === filter && styles.filterChipTextActive,
              ]}
            >
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  filterContainer: {
    marginBottom: 12,
  },
  filterScroller: {
    paddingRight: 16,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Layout.borderRadiusPill,
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: Colors.red,
  },
  filterChipText: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});

function useThemedStyles() {
  const { colors } = useTheme();
  return {
    filterChip: {
      backgroundColor: colors.inputBg,
    },
    filterChipText: {
      color: colors.textSecondary,
    },
  };
}
