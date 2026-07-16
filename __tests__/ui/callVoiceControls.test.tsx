import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CallAnsweredView } from '../../src/ui/components/call/CallAnsweredView';

jest.mock('../../src/ui/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: jest.fn(),
    colors: {
      background: '#FAF9F6',
      cardBg: '#FFFFFF',
      inputBg: '#F7F7F7',
      divider: '#EEEEEE',
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#888888',
      border: '#DDDDDD',
      statusBarStyle: 'dark-content',
      red: '#F75A5A',
      blue: '#E6003A',
      yellow: '#C8A800',
      success: '#2ECC71',
      warning: '#F4A100',
      error: '#FF3B30',
      white: '#FFFFFF',
      black: '#000000',
      overlay: 'rgba(0,0,0,0.5)',
      chipActiveText: '#FFFFFF',
      switchTrackOff: '#767577',
      switchThumb: '#FFFFFF',
      placeholder: '#888888',
      iconMuted: '#AAAAAA',
      eventIconBg: '#F0F0FF',
      bannerBg: '#FCE4D6',
    },
  }),
}));

const getTextContent = (content: React.ReactNode): string => (
  React.Children.toArray(content).map(child => (
    typeof child === 'string' || typeof child === 'number' ? String(child) : ''
  )).join('')
);

describe('answered call voice controls', () => {
  it('provides an accessible hold-to-talk microphone', () => {
    const onMicPressIn = jest.fn();
    const onMicPressOut = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <CallAnsweredView
          task="Review algorithms"
          callState="connected"
          onSnooze={jest.fn()}
          onAcknowledge={jest.fn()}
          onDecline={jest.fn()}
          onMicPressIn={onMicPressIn}
          onMicPressOut={onMicPressOut}
          transcript=""
          reply=""
        />,
      );
    });

    const text = renderer.root.findAllByType(Text).map(
      node => getTextContent(node.props.children),
    );
    const microphone = renderer.root.find(
      node => node.props.accessibilityLabel === 'Hold to speak',
    );

    expect(text).toContain('Hold the microphone to respond');
    expect(microphone.props.accessibilityRole).toBe('button');
    expect(microphone.props.accessibilityHint).toContain('Release');

    ReactTestRenderer.act(() => microphone.props.onPressIn());
    ReactTestRenderer.act(() => microphone.props.onPressOut());
    expect(onMicPressIn).toHaveBeenCalledTimes(1);
    expect(onMicPressOut).toHaveBeenCalledTimes(1);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
