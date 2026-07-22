import { NativeModules, Platform } from 'react-native';

const { AndroidKeystoreModule } = NativeModules;

let memoryKeystoreMock: Record<string, string> = {};

export const secureKeystore = {
  /**
   * Encrypts sensitive string using Android Keystore AES-GCM or test fallback.
   */
  encryptString: async (plainText: string): Promise<string> => {
    if (Platform.OS === 'android' && AndroidKeystoreModule && typeof AndroidKeystoreModule.encryptString === 'function') {
      try {
        return await AndroidKeystoreModule.encryptString(plainText);
      } catch (error) {
        console.warn('Native AndroidKeystoreModule failed, using fallback:', error);
      }
    }
    // Mock / fallback for testing
    const mockEncrypted = `mock_enc_${Buffer.from(plainText).toString('base64')}`;
    memoryKeystoreMock.token = mockEncrypted;
    return mockEncrypted;
  },

  /**
   * Decrypts ciphertext string using Android Keystore AES-GCM or test fallback.
   */
  decryptString: async (cipherText: string): Promise<string> => {
    if (Platform.OS === 'android' && AndroidKeystoreModule && typeof AndroidKeystoreModule.decryptString === 'function') {
      try {
        return await AndroidKeystoreModule.decryptString(cipherText);
      } catch (error) {
        console.warn('Native AndroidKeystoreModule failed, using fallback:', error);
      }
    }
    // Mock / fallback for testing
    if (cipherText.startsWith('mock_enc_')) {
      const b64 = cipherText.replace('mock_enc_', '');
      return Buffer.from(b64, 'base64').toString('utf-8');
    }
    return cipherText;
  }
};
