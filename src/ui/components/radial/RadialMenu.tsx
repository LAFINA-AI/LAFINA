import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Lock, X } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Fonts, Layout, Shadows } from '../../theme';
import type { RadialLayout } from '../../../utils';
import { MIC_CENTER_FROM_BOTTOM } from '../CustomTabBar';
import type { RadialMenuItem } from './useRadialMenu';

const BUBBLE_SIZE = 56;
const ITEM_WIDTH = 96;
/** Share of the opening animation between one item starting and the next. */
const STAGGER = 0.08;

interface RadialMenuProps {
  visible: boolean;
  items: RadialMenuItem[];
  layout: RadialLayout;
  highlightedIndex: number | null;
  onSelect: (key: string) => void;
  onDismiss: () => void;
}

/**
 * The fan of shortcuts that opens from the Mic button.
 *
 * Drawn over the whole screen rather than inside the tab bar: Android only
 * delivers touches inside a view's bounds, and the items sit well above the
 * bar. Each item flies out from the Mic, and an ✕ takes the Mic's place.
 */
export const RadialMenu: React.FC<RadialMenuProps> = ({
  visible,
  items,
  layout,
  highlightedIndex,
  onSelect,
  onDismiss,
}) => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  if (!mounted) return null;

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setArea((previous) =>
      previous && previous.width === width && previous.height === height ? previous : { width, height }
    );
  };

  const anchorX = area ? area.width / 2 : 0;
  const anchorY = area ? area.height - MIC_CENTER_FROM_BOTTOM : 0;
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} testID="radial-menu">
      <Animated.View style={[StyleSheet.absoluteFill, themed.backdrop, { opacity: backdropOpacity }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityLabel="Close study tools"
          accessibilityRole="button"
        />
      </Animated.View>

      {area &&
        items.map((item, index) => {
          const position = layout.items[index];
          if (!position) return null;
          const start = Math.min(index * STAGGER, 0.4);
          const range = [start, start + 0.6];
          const highlighted = index === highlightedIndex;
          const Icon = item.icon;
          return (
            <Animated.View
              key={item.key}
              style={[
                styles.item,
                {
                  left: anchorX + position.x - ITEM_WIDTH / 2,
                  top: anchorY + position.y - BUBBLE_SIZE / 2,
                  opacity: progress.interpolate({
                    inputRange: range,
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateX: progress.interpolate({
                        inputRange: range,
                        outputRange: [-position.x, 0],
                        extrapolateLeft: 'clamp',
                      }),
                    },
                    {
                      translateY: progress.interpolate({
                        inputRange: range,
                        outputRange: [-position.y, 0],
                        extrapolateLeft: 'clamp',
                      }),
                    },
                    { scale: highlighted ? 1.14 : 1 },
                  ],
                },
              ]}
            >
              <Pressable
                style={styles.itemPress}
                onPress={() => onSelect(item.key)}
                accessibilityRole="button"
                accessibilityLabel={item.locked ? `${item.label}, Student Pro` : item.label}
                accessibilityState={{ selected: highlighted }}
                testID={`radial-item-${item.key}`}
              >
                <View
                  style={[
                    styles.bubble,
                    Shadows.card,
                    themed.bubble,
                    highlighted && themed.bubbleActive,
                  ]}
                >
                  <Icon size={24} color={highlighted ? colors.white : colors.textPrimary} />
                  {item.locked ? (
                    <View style={[styles.lock, themed.lock]}>
                      <Lock size={10} color={colors.white} />
                    </View>
                  ) : null}
                </View>
                <View style={[styles.labelChip, themed.labelChip, highlighted && themed.labelChipActive]}>
                  <Text
                    style={[styles.label, themed.label, highlighted && themed.labelActive]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

      {area && (
        <Animated.View
          style={[
            styles.close,
            Shadows.micButton,
            themed.close,
            {
              left: anchorX - Layout.micButtonSize / 2,
              top: anchorY - Layout.micButtonSize / 2,
              opacity: backdropOpacity,
            },
          ]}
        >
          <Pressable
            style={styles.closePress}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close study tools"
          >
            <X size={26} color={colors.white} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  backdrop: { backgroundColor: colors.overlay },
  bubble: { backgroundColor: colors.cardBg, borderColor: colors.border },
  bubbleActive: { backgroundColor: colors.red, borderColor: colors.red },
  lock: { backgroundColor: colors.textSecondary, borderColor: colors.cardBg },
  labelChip: { backgroundColor: colors.cardBg },
  labelChipActive: { backgroundColor: colors.red },
  label: { color: colors.textPrimary },
  labelActive: { color: colors.white },
  close: { backgroundColor: colors.blue },
});

const styles = StyleSheet.create({
  item: {
    position: 'absolute',
    width: ITEM_WIDTH,
    alignItems: 'center',
  },
  itemPress: {
    alignItems: 'center',
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lock: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelChip: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Layout.borderRadiusPill,
    maxWidth: ITEM_WIDTH,
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.heading,
    fontWeight: 'bold',
  },
  close: {
    position: 'absolute',
    width: Layout.micButtonSize,
    height: Layout.micButtonSize,
    borderRadius: Layout.micButtonSize / 2,
  },
  closePress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
