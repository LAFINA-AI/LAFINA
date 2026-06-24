import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const logo = require('../../../assets/lafina_default_logo.png');

export const AuthHeader: React.FC = () => {
  return (
    <View style={styles.header}>
      <Image
        source={logo}
        style={styles.logoText}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: {
    width: 130,
    height: 80,
  },
});
