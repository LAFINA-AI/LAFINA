const SALT_PREFIX = 'lafina_salt_key_';

/**
 * A self-contained, pure JS implementation of SHA-256.
 * This ensures compatibility offline across all Android environments without needing external packages.
 */
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j; // Used as a counter across the whole file
  let result = '';

  const words: number[] = [];
  const asciiLength = ascii.length * 8;
  
  let hash = (sha256 as any).h = (sha256 as any).h || [];
  const k = (sha256 as any).k = (sha256 as any).k || [];
  let primeCounter = k[lengthProperty];

  const isPrime = (n: number) => {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % factor === 0) return false;
    }
    return true;
  };

  let candidate = 2;
  while (primeCounter < 64) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
    candidate++;
  }

  // Pre-processing
  const asciiBytes: number[] = [];
  for (let c = 0; c < ascii.length; c++) {
    asciiBytes.push(ascii.charCodeAt(c));
  }
  asciiBytes.push(0x80);
  
  while (asciiBytes.length % 64 !== 56) {
    asciiBytes.push(0);
  }

  for (i = 0; i < asciiBytes.length; i += 4) {
    words.push((asciiBytes[i] << 24) | (asciiBytes[i+1] << 16) | (asciiBytes[i+2] << 8) | asciiBytes[i+3]);
  }

  words.push((asciiLength / maxWord) | 0);
  words.push(asciiLength | 0);

  // Initialize hash values for this run
  const h = [...hash];

  for (j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldH = [...h];

    for (i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const s1 = rightRotate(h[4], 6) ^ rightRotate(h[4], 11) ^ rightRotate(h[4], 25);
      const ch = (h[4] & h[5]) ^ (~h[4] & h[6]);
      const temp1 = (h[7] + s1 + ch + k[i] + w[i]) | 0;
      const s0 = rightRotate(h[0], 2) ^ rightRotate(h[0], 13) ^ rightRotate(h[0], 22);
      const maj = (h[0] & h[1]) ^ (h[0] & h[2]) ^ (h[1] & h[2]);
      const temp2 = (s0 + maj) | 0;

      h[7] = h[6];
      h[6] = h[5];
      h[5] = h[4];
      h[4] = (h[3] + temp1) | 0;
      h[3] = h[2];
      h[2] = h[1];
      h[1] = h[0];
      h[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      h[i] = (h[i] + oldH[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    let hex = (h[i] >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    result += hex;
  }

  return result;
}

/**
 * Hashes a password using SHA-256 with a static salt prefix.
 * @param password The plaintext password to hash.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return sha256(SALT_PREFIX + password);
};

/**
 * Verifies a plaintext password against a stored SHA-256 hash.
 * @param password The plaintext password.
 * @param hash The stored hash.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
};
