"""Simulate full Kotlin TTS pipeline including CMU + broken vocab."""
import re
import zipfile
import numpy as np
import onnxruntime as ort

MODEL = r"android/app/src/main/assets/models/kokoro-v0_19.onnx"
VOICE = r"android/app/src/main/assets/models/af_bella.bin"
CMU = r"android/app/src/main/assets/models/cmudict.txt"

# Current Kotlin vocab string (as in code)
vocab_chars = '_$ .,!?()-\":;aáàâäāæbçdðeéèêëēfgħhiíìîïījkklmnoóòôöōœpqrrsštuvwxyzæçðŋœɔʃθʊʌʒ'
vocab_map = {c: i for i, c in enumerate(vocab_chars)}
vocab_map[" "] = 2

CMU_TO_IPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "EH": "ɛ", "ER": "ɚ", "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ",
    "OY": "ɔɪ", "UH": "ʊ", "UW": "u", "B": "b", "CH": "tʃ", "D": "d",
    "DH": "ð", "F": "f", "G": "g", "HH": "h", "JH": "dʒ", "K": "k",
    "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r",
    "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w",
    "Y": "j", "Z": "z", "ZH": "ʒ",
}

# Official vocab for comparison
OFFICIAL = {
    "$": 0, ";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6, " ": 16,
    "a": 43, "b": 44, "c": 45, "d": 46, "e": 47, "f": 48, "h": 50,
    "i": 51, "j": 52, "k": 53, "l": 54, "m": 55, "n": 56, "o": 57,
    "p": 58, "q": 59, "r": 60, "s": 61, "t": 62, "u": 63, "v": 64,
    "w": 65, "x": 66, "y": 67, "z": 68,
    "ɑ": 69, "æ": 72, "ɔ": 76, "ð": 81, "ʤ": 82, "ə": 83, "ɚ": 85,
    "ɛ": 86, "ɡ": 92, "ɪ": 102, "ŋ": 112, "θ": 119, "ɹ": 123, "ʃ": 131,
    "ʧ": 133, "ʊ": 135, "ʌ": 138, "ʒ": 147, "ˈ": 156, "ˌ": 157, "ː": 158,
}

# Better CMU map using single-char IPA that exist in official vocab
CMU_TO_IPA_FIXED = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "EH": "ɛ", "ER": "ɚ", "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ",
    "OY": "ɔɪ", "UH": "ʊ", "UW": "u", "B": "b", "CH": "ʧ", "D": "d",
    "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "ʤ", "K": "k",
    "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "ɹ",
    "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w",
    "Y": "j", "Z": "z", "ZH": "ʒ",
}


def load_cmu():
    d = {}
    with open(CMU, encoding="latin-1") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";;;"):
                continue
            sp = line.find(" ")
            if sp > 0:
                word = line[:sp].strip().lower()
                phones = line[sp + 1 :].strip()
                if word and phones:
                    d[word] = phones
    return d


def map_cmu(cmu, table):
    parts = []
    for phone in cmu.split():
        clean = re.sub(r"\d", "", phone)
        parts.append(table.get(clean, ""))
    return "".join(parts)


def text_to_phonemes(text, cmu, table):
    words = re.sub(r"[^a-zA-Z\s]", "", text.lower()).split()
    out = []
    for w in words:
        if w in cmu:
            out.append(map_cmu(cmu[w], table))
        else:
            out.append(w)
    return " ".join(out)


def text_phonemize(phonemes, vmap):
    cleaned = []
    dropped = 0
    for ch in phonemes:
        if ch in vmap:
            cleaned.append(ch)
        else:
            cleaned.append(" ")
            dropped += 1
    return "".join(cleaned), dropped


def text_to_tokens(text, cmu, table, vmap):
    raw = text_to_phonemes(text, cmu, table)
    cleaned, dropped = text_phonemize(raw, vmap)
    tokens = [0]
    for ch in cleaned:
        tokens.append(vmap.get(ch, 2 if " " not in vmap else vmap[" "]))
    tokens.append(0)
    return tokens, raw, cleaned, dropped


def main():
    cmu = load_cmu()
    print("cmu entries", len(cmu))

    with zipfile.ZipFile(VOICE) as z:
        raw = z.read("af_bella.npy")
    header_len = int.from_bytes(raw[8:10], "little")
    data_offset = 10 + header_len
    style = np.frombuffer(raw, dtype=np.float32, offset=data_offset).reshape(511, 256)
    session = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])

    text = "Lafina TTS is working perfectly fine"

    # Current pipeline
    tokens, raw_ph, cleaned, dropped = text_to_tokens(text, cmu, CMU_TO_IPA, vocab_map)
    print("CURRENT raw phonemes:", repr(raw_ph[:200]))
    print("CURRENT cleaned:", repr(cleaned[:200]))
    print("CURRENT dropped non-vocab chars:", dropped)
    print("CURRENT tokens sample:", tokens[:40], "len", len(tokens))
    # how many are space token (2)
    print("CURRENT space ratio", tokens.count(2) / max(len(tokens), 1))

    n = max(len(tokens) - 2, 0)
    out = session.run(
        None,
        {
            "tokens": np.array([tokens], dtype=np.int64),
            "style": style[min(n, 510) : min(n, 510) + 1],
            "speed": np.array([1.0], dtype=np.float32),
        },
    )[0]
    print(
        "CURRENT audio rms",
        float(np.sqrt(np.mean(out ** 2))),
        "mean_abs",
        float(np.mean(np.abs(out))),
        "len",
        out.shape,
    )

    # Fixed pipeline with official vocab + fixed IPA
    tokens2, raw2, cleaned2, dropped2 = text_to_tokens(
        text, cmu, CMU_TO_IPA_FIXED, OFFICIAL
    )
    print("FIXED raw:", repr(raw2[:200]))
    print("FIXED cleaned:", repr(cleaned2[:200]))
    print("FIXED dropped:", dropped2)
    print("FIXED tokens sample:", tokens2[:40], "len", len(tokens2))
    n2 = max(len(tokens2) - 2, 0)
    out2 = session.run(
        None,
        {
            "tokens": np.array([tokens2], dtype=np.int64),
            "style": style[min(n2, 510) : min(n2, 510) + 1],
            "speed": np.array([1.0], dtype=np.float32),
        },
    )[0]
    print(
        "FIXED audio rms",
        float(np.sqrt(np.mean(out2 ** 2))),
        "mean_abs",
        float(np.mean(np.abs(out2))),
        "len",
        out2.shape,
    )

    # Check which IPA chars missing from current vocab
    missing = set()
    for ch in raw_ph:
        if ch not in vocab_map and ch != " ":
            missing.add(ch)
    print("chars missing from current vocab:", sorted(missing))


if __name__ == "__main__":
    main()
