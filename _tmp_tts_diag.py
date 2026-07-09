"""Diagnose Kokoro TTS vocab/token issues."""
import zipfile
import numpy as np

try:
    import onnxruntime as ort
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "onnxruntime", "-q"])
    import onnxruntime as ort

MODEL = r"android/app/src/main/assets/models/kokoro-v0_19.onnx"
VOICE = r"android/app/src/main/assets/models/af_bella.bin"

# Official Kokoro vocab (from hexgrad config / tokenizer.json)
VOCAB = {
    "$": 0, ";": 1, ":": 2, ",": 3, ".": 4, "!": 5, "?": 6,
    "\u2014": 9, "\u2026": 10, '"': 11, "(": 12, ")": 13,
    "\u201c": 14, "\u201d": 15, " ": 16,
    "a": 43, "b": 44, "c": 45, "d": 46, "e": 47, "f": 48, "h": 50,
    "i": 51, "j": 52, "k": 53, "l": 54, "m": 55, "n": 56, "o": 57,
    "p": 58, "q": 59, "r": 60, "s": 61, "t": 62, "u": 63, "v": 64,
    "w": 65, "x": 66, "y": 67, "z": 68,
    "\u0251": 69, "\u0250": 70, "\u0252": 71, "\u00e6": 72,
    "\u0254": 76, "\u00e7": 78, "\u00f0": 81, "\u02a4": 82,
    "\u0259": 83, "\u025a": 85, "\u025b": 86, "\u025c": 87,
    "\u0261": 92, "\u026a": 102, "\u014b": 112, "\u03b8": 119,
    "\u0153": 120, "\u0279": 123, "\u0283": 131, "\u02a7": 133,
    "\u028a": 135, "\u028c": 138, "\u0292": 147,
    "\u02c8": 156, "\u02cc": 157, "\u02d0": 158,
}

# Broken vocab as currently implemented (simplified)
broken_chars = '_$ .,!?()-\":;abcdefghijklmnopqrstuvwxyz'
BROKEN = {c: i for i, c in enumerate(broken_chars)}
BROKEN[" "] = 2


def load_style():
    with zipfile.ZipFile(VOICE) as z:
        raw = z.read("af_bella.npy")
    major = raw[6]
    header_len = int.from_bytes(raw[8:10], "little")
    data_offset = 10 + header_len
    data = np.frombuffer(raw, dtype=np.float32, offset=data_offset)
    return data.reshape(511, 256)


def tokenize(text, vocab):
    ids = [0]
    for ch in text:
        if ch in vocab:
            ids.append(vocab[ch])
        elif ch == " ":
            ids.append(16 if " " in vocab and vocab[" "] == 16 else vocab.get(" ", 2))
    ids.append(0)
    return ids


def run(session, style_matrix, tokens):
    tokens_np = np.array([tokens], dtype=np.int64)
    n = max(len(tokens) - 2, 0)
    style = style_matrix[min(n, 510) : min(n, 510) + 1]
    speed = np.array([1.0], dtype=np.float32)
    out = session.run(None, {"tokens": tokens_np, "style": style, "speed": speed})[0]
    return out


def main():
    style_matrix = load_style()
    session = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
    print("inputs", [(i.name, i.shape, i.type) for i in session.get_inputs()])

    # Phoneme-ish test for "hello"
    phonemes = "h\u025bl\u028a"  # h ɛ l ʊ
    good = tokenize(phonemes, VOCAB)
    print("good tokens", good)
    gout = run(session, style_matrix, good)
    print(
        "GOOD audio",
        gout.shape,
        "min",
        float(gout.min()),
        "max",
        float(gout.max()),
        "mean_abs",
        float(np.mean(np.abs(gout))),
        "rms",
        float(np.sqrt(np.mean(gout ** 2))),
    )

    # Grapheme pass-through with correct vocab (fallback path)
    grapheme = "hello world"
    g2 = tokenize(grapheme, VOCAB)
    print("grapheme tokens", g2)
    g2out = run(session, style_matrix, g2)
    print(
        "GRAPHEME audio",
        g2out.shape,
        "min",
        float(g2out.min()),
        "max",
        float(g2out.max()),
        "mean_abs",
        float(np.mean(np.abs(g2out))),
        "rms",
        float(np.sqrt(np.mean(g2out ** 2))),
    )

    # Broken current-app tokens
    bad = tokenize(grapheme, BROKEN)
    print("broken tokens", bad)
    bout = run(session, style_matrix, bad)
    print(
        "BROKEN audio",
        bout.shape,
        "min",
        float(bout.min()),
        "max",
        float(bout.max()),
        "mean_abs",
        float(np.mean(np.abs(bout))),
        "rms",
        float(np.sqrt(np.mean(bout ** 2))),
    )

    # Also test style index including pads (current bug)
    tokens_np = np.array([good], dtype=np.int64)
    n_wrong = len(good)  # includes pads
    style_wrong = style_matrix[min(n_wrong, 510) : min(n_wrong, 510) + 1]
    speed = np.array([1.0], dtype=np.float32)
    wout = session.run(None, {"tokens": tokens_np, "style": style_wrong, "speed": speed})[0]
    print(
        "WRONG_STYLE_INDEX audio",
        wout.shape,
        "mean_abs",
        float(np.mean(np.abs(wout))),
        "rms",
        float(np.sqrt(np.mean(wout ** 2))),
    )


if __name__ == "__main__":
    main()
