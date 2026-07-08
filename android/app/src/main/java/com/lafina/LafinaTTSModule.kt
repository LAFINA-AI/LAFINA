package com.lafina

import android.content.Context
import android.media.MediaPlayer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.BufferedReader
import java.io.InputStreamReader

class LafinaTTSModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var ortEnv: OrtEnvironment? = null
  private var ortSession: OrtSession? = null
  private var styleVector: FloatArray? = null
  private val vocabMap = mutableMapOf<Char, Int>()
  private val cmuDict = mutableMapOf<String, String>()

  override fun getName(): String = "LafinaTTS"

  init {
    initializeVocab()
  }

  private fun initializeVocab() {
    // Basic Kokoro character vocabulary map
    val vocabChars = "_$ .,!?()-\":;aáàâäāæbçdðeéèêëēfgħhiíìîïījkklmnoóòôöōœpqrrsštuvwxyzæçðŋœɔʃθʊʌʒ"
    for (i in vocabChars.indices) {
      vocabMap[vocabChars[i]] = i
    }
    // Fallbacks/special tokens
    vocabMap[' '] = 2
  }

  private var initError: Exception? = null

  private fun loadResourcesIfNeeded() {
    if (ortSession != null && styleVector != null) return

    synchronized(this) {
      if (ortSession != null && styleVector != null) return

      // If a previous init attempt failed, throw the stored error so the
      // caller gets a meaningful message instead of "Session not initialized".
      initError?.let { throw it }

      try {
        ortEnv = OrtEnvironment.getEnvironment()
        
        // Ensure assets are in cache for native reading
        val cacheDir = reactContext.cacheDir
        val modelFile = File(cacheDir, "kokoro-v0_19.onnx")
        val styleFile = File(cacheDir, "af_bella.bin")
        val dictFile = File(cacheDir, "cmudict.txt")

        copyAssetToFile("models/kokoro-v0_19.onnx", modelFile)
        copyAssetToFile("models/af_bella.bin", styleFile)
        copyAssetToFile("models/cmudict.txt", dictFile)

        // Load ONNX Session
        ortSession = ortEnv?.createSession(modelFile.absolutePath, OrtSession.SessionOptions())

        // Load style vector from af_bella.bin
        styleVector = loadStyleVector(styleFile)

        // Load CMU Dictionary
        loadCmuDict(dictFile)

      } catch (e: Exception) {
        // Clean up partial state so a future retry can start fresh
        ortSession = null
        styleVector = null
        initError = e
        e.printStackTrace()
        throw e
      }
    }
  }

  /**
   * Resets the init error flag so the next call to loadResourcesIfNeeded() will
   * retry from scratch. Call this from JS when retrying after a transient failure.
   */
  @ReactMethod
  fun resetInitError(promise: Promise) {
    synchronized(this) {
      initError = null
      ortSession = null
      styleVector = null
    }
    promise.resolve(true)
  }

  private fun copyAssetToFile(assetPath: String, outFile: File) {
    // Validate existing file against expected asset size to catch partial copies
    if (outFile.exists() && outFile.length() > 0) {
      val expectedSize = reactContext.assets.open(assetPath).use { it.available().toLong() }
      if (outFile.length() >= expectedSize) return
      // File is smaller than asset — delete corrupt copy and re-extract
      outFile.delete()
    }
    reactContext.assets.open(assetPath).use { input ->
      FileOutputStream(outFile).use { output ->
        input.copyTo(output)
      }
    }
  }

  private fun loadStyleVector(file: File): FloatArray {
    val bytes = file.readBytes()
    val floatBuf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
    val floats = FloatArray(256)
    floatBuf.get(floats)
    return floats
  }

  private fun loadCmuDict(file: File) {
    file.inputStream().bufferedReader().useLines { lines ->
      lines.forEach { line ->
        if (!line.startsWith(";;;")) {
          val parts = line.split("  ")
          if (parts.size >= 2) {
            cmuDict[parts[0].lowercase()] = parts[1]
          }
        }
      }
    }
  }

  private fun textToPhonemes(text: String): String {
    val words = text.lowercase().replace(Regex("[^a-zA-Z\\s]"), "").split("\\s+".toRegex())
    val phonemeBuilder = StringBuilder()

    for (word in words) {
      if (word.isEmpty()) continue
      val cmuPhones = cmuDict[word]
      if (cmuPhones != null) {
        // Map CMU ARPAbet to basic Kokoro approximate IPA/characters
        val ipa = mapCmuToIpa(cmuPhones)
        phonemeBuilder.append(ipa).append(" ")
      } else {
        // Fallback to spelling it out or direct representation
        phonemeBuilder.append(word).append(" ")
      }
    }
    return phonemeBuilder.toString().trim()
  }

  private fun mapCmuToIpa(cmu: String): String {
    // Very simple CMU to Kokoro approximate IPA phonemes mapping
    return cmu.split(" ")
      .map { phone ->
        val cleanPhone = phone.replace(Regex("\\d"), "") // remove stress numbers
        when (cleanPhone) {
          "AA" -> "ɑ"
          "AE" -> "æ"
          "AH" -> "ʌ"
          "AO" -> "ɔ"
          "AW" -> "aʊ"
          "AY" -> "aɪ"
          "EH" -> "ɛ"
          "ER" -> "ɚ"
          "EY" -> "eɪ"
          "IH" -> "ɪ"
          "IY" -> "i"
          "OW" -> "oʊ"
          "OY" -> "ɔɪ"
          "UH" -> "ʊ"
          "UW" -> "u"
          "B" -> "b"
          "CH" -> "tʃ"
          "D" -> "d"
          "DH" -> "ð"
          "F" -> "f"
          "G" -> "g"
          "HH" -> "h"
          "JH" -> "dʒ"
          "K" -> "k"
          "L" -> "l"
          "M" -> "m"
          "N" -> "n"
          "NG" -> "ŋ"
          "P" -> "p"
          "R" -> "r"
          "S" -> "s"
          "SH" -> "ʃ"
          "T" -> "t"
          "TH" -> "θ"
          "V" -> "v"
          "W" -> "w"
          "Y" -> "j"
          "Z" -> "z"
          "ZH" -> "ʒ"
          else -> ""
        }
      }
      .joinToString("")
  }

  private fun textToTokens(text: String): LongArray {
    val phonemes = textPhonemize(text)
    val tokens = mutableListOf<Long>()
    
    // Kokoro expects starting token
    tokens.add(0L)
    
    for (char in phonemes) {
      val token = vocabMap[char]?.toLong() ?: 2L // default to space if unknown
      tokens.add(token)
    }

    // Kokoro expects ending token
    tokens.add(0L)

    return tokens.toLongArray()
  }

  private fun textPhonemize(text: String): String {
    // Direct phoneme mapping or basic clean text representation
    val rawPhonemes = textToPhonemes(text)
    val cleaned = StringBuilder()
    for (char in rawPhonemes) {
      if (vocabMap.containsKey(char)) {
        cleaned.append(char)
      } else {
        cleaned.append(' ')
      }
    }
    return cleaned.toString()
  }

  @ReactMethod
  fun synthesize(text: String, outputPath: String, promise: Promise) {
    Thread {
      try {
        loadResourcesIfNeeded()

        val env = ortEnv ?: throw Exception("ONNX Runtime Environment not initialized.")
        val session = ortSession ?: throw Exception("ONNX Session not initialized.")
        val style = styleVector ?: throw Exception("Style vector not loaded.")

        val tokens = textToTokens(text)
        if (tokens.isEmpty()) {
          promise.resolve(false)
          return@Thread
        }

        // Reshape style to [1, 256]
        val reshapedStyle = Array(1) { FloatArray(256) }
        System.arraycopy(style, 0, reshapedStyle[0], 0, 256)

        // Reshape tokens to [1, sequence_length]
        val reshapedTokens = Array(1) { LongArray(tokens.size) }
        System.arraycopy(tokens, 0, reshapedTokens[0], 0, tokens.size)

        // Speed tensor [1]
        val speed = floatArrayOf(1.0f)

        // Run ONNX Session
        val tokenTensor = OnnxTensor.createTensor(env, reshapedTokens)
        val styleTensor = OnnxTensor.createTensor(env, reshapedStyle)
        val speedTensor = OnnxTensor.createTensor(env, speed)

        val inputs = mapOf(
          "tokens" to tokenTensor,
          "style" to styleTensor,
          "speed" to speedTensor
        )

        session.run(inputs).use { results ->
          val outputTensor = results[0] as OnnxTensor
          val outputBuffer = outputTensor.floatBuffer
          val shape = outputTensor.info.shape
          val outputLength = if (shape.size > 1) shape[1].toInt() else shape[0].toInt()

          val audioData = FloatArray(outputLength)
          outputBuffer.get(audioData)

          // Convert Float to 16-bit PCM and write WAV
          writeWavFile(audioData, outputPath)
          promise.resolve(true)
        }

      } catch (e: Exception) {
        e.printStackTrace()
        promise.reject("TTS_SYNTH_ERROR", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun playAudio(filePath: String, promise: Promise) {
    try {
      val mediaPlayer = MediaPlayer().apply {
        setDataSource(filePath)
        prepare()
        start()
        setOnCompletionListener {
          release()
          promise.resolve(true)
        }
        setOnErrorListener { mp, what, extra ->
          release()
          promise.reject("PLAY_ERROR", "MediaPlayer error: what=$what, extra=$extra")
          true
        }
      }
    } catch (e: Exception) {
      promise.reject("PLAY_ERROR", e.message, e)
    }
  }

  private fun writeWavFile(audioData: FloatArray, path: String) {
    val file = File(path)
    if (file.exists()) file.delete()

    val sampleRate = 24000
    val channels = 1
    val bitsPerSample = 16

    val pcmData = ShortArray(audioData.size)
    for (i in audioData.indices) {
      // Clamp float between -1.0 and 1.0 and convert to short
      val clamped = Math.max(-1.0f, Math.min(1.0f, audioData[i]))
      pcmData[i] = (clamped * Short.MAX_VALUE).toInt().toShort()
    }

    FileOutputStream(file).use { out ->
      // Write WAV Header
      val header = ByteArray(44)
      val totalDataLen = pcmData.size * 2
      val totalAudioLen = totalDataLen + 36

      header[0] = 'R'.code.toByte()
      header[1] = 'I'.code.toByte()
      header[2] = 'F'.code.toByte()
      header[3] = 'F'.code.toByte()
      header[4] = (totalAudioLen and 0xff).toByte()
      header[5] = ((totalAudioLen shr 8) and 0xff).toByte()
      header[6] = ((totalAudioLen shr 16) and 0xff).toByte()
      header[7] = ((totalAudioLen shr 24) and 0xff).toByte()
      header[8] = 'W'.code.toByte()
      header[9] = 'A'.code.toByte()
      header[10] = 'V'.code.toByte()
      header[11] = 'E'.code.toByte()
      header[12] = 'f'.code.toByte() // 'fmt ' chunk
      header[13] = 'm'.code.toByte()
      header[14] = 't'.code.toByte()
      header[15] = ' '.code.toByte()
      header[16] = 16 // 4 bytes: size of 'fmt ' chunk
      header[17] = 0
      header[18] = 0
      header[19] = 0
      header[20] = 1 // format = 1 (PCM)
      header[21] = 0
      header[22] = channels.toByte()
      header[23] = 0
      header[24] = (sampleRate and 0xff).toByte()
      header[25] = ((sampleRate shr 8) and 0xff).toByte()
      header[26] = ((sampleRate shr 16) and 0xff).toByte()
      header[27] = ((sampleRate shr 24) and 0xff).toByte()
      header[28] = ((sampleRate * channels * 2) and 0xff).toByte() // byte rate
      header[29] = (((sampleRate * channels * 2) shr 8) and 0xff).toByte()
      header[30] = (((sampleRate * channels * 2) shr 16) and 0xff).toByte()
      header[31] = (((sampleRate * channels * 2) shr 24) and 0xff).toByte()
      header[32] = (channels * 2).toByte() // block align
      header[33] = 0
      header[34] = bitsPerSample.toByte() // bits per sample
      header[35] = 0
      header[36] = 'd'.code.toByte()
      header[37] = 'a'.code.toByte()
      header[38] = 't'.code.toByte()
      header[39] = 'a'.code.toByte()
      header[40] = (totalDataLen and 0xff).toByte()
      header[41] = ((totalDataLen shr 8) and 0xff).toByte()
      header[42] = ((totalDataLen shr 16) and 0xff).toByte()
      header[43] = ((totalDataLen shr 24) and 0xff).toByte()

      out.write(header)

      // Write PCM data
      val byteBuffer = ByteBuffer.allocate(totalDataLen).order(ByteOrder.LITTLE_ENDIAN)
      for (sample in pcmData) {
        byteBuffer.putShort(sample)
      }
      out.write(byteBuffer.array())
    }
  }
}
