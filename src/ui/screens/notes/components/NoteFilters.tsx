import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';
import { Colors } from '../../../theme';
import { FilterType } from '../types';

interface NoteFiltersProps {
  selectedFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

const allFilters: FilterType[] = ['All', 'AI Transcribed', 'Personal', 'Work', 'Pinned'];

export const NoteFilters: React.FC<NoteFiltersProps> = ({ selectedFilter, onFilterChange }) => {
  const { colors } = useTheme();

  return (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroller}>
        {allFilters.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              { backgroundColor: colors.inputBg },
              selectedFilter === filter && { backgroundColor: Colors.red },
            ]}
            onPress={() => onFilterChange(filter)}
          >
            <Text style={[
              styles.filterChipText,
              { color: colors.textSecondary },
              selectedFilter === filter && { color: colors.white, fontWeight: 'bold' },
            ]}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  filterContainer: { marginBottom: 12 },
  filterScroller: { paddingRight: 16 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, marginRight: 6 },
  filterChipText: { fontFamily: 'sans-serif', fontSize: 12 },
});
