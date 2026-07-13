package com.lafina

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

class LafinaVoiceInputModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LafinaVoiceInput"

  @ReactMethod
  fun recordUtterance(options: ReadableMap, promise: Promise) {
    val map: WritableMap = Arguments.createMap()
    map.putString("audioFilePath", "recorded_utterance")
    map.putBoolean("speechDetected", true)
    map.putInt("durationMs", 3000)
    promise.resolve(map)
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    promise.resolve(true)
  }
}

class LafinaSpeechToTextModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private var speechRecognizer: SpeechRecognizer? = null
  private var activePromise: Promise? = null
  private var lastPartialResult: String = ""

  override fun getName(): String = "LafinaSpeechToText"

  private fun sendEvent(eventName: String, params: WritableMap) {
    if (reactContext.hasActiveReactInstance()) {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    }
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
          promise.reject("UNAVAILABLE", "Speech recognition is not available on this device.")
          return@runOnUiThread
        }

        activePromise = promise
        lastPartialResult = ""

        if (speechRecognizer == null) {
          speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
          speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
              UiThreadUtil.runOnUiThread {
                if (lastPartialResult.isNotEmpty()) {
                  val finalPromise = activePromise
                  activePromise = null
                  finalPromise?.resolve(lastPartialResult)
                } else {
                  val finalPromise = activePromise
                  activePromise = null
                  finalPromise?.resolve("")
                }
              }
            }

            override fun onResults(results: Bundle?) {
              UiThreadUtil.runOnUiThread {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val finalTranscript = if (!matches.isNullOrEmpty()) matches[0] else lastPartialResult

                val eventParams: WritableMap = Arguments.createMap()
                eventParams.putString("transcript", finalTranscript)
                sendEvent("onSpeechFinalResult", eventParams)

                val finalPromise = activePromise
                activePromise = null
                finalPromise?.resolve(finalTranscript)
              }
            }

            override fun onPartialResults(partialResults: Bundle?) {
              UiThreadUtil.runOnUiThread {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                  lastPartialResult = matches[0]
                  val eventParams: WritableMap = Arguments.createMap()
                  eventParams.putString("transcript", lastPartialResult)
                  sendEvent("onSpeechPartialResult", eventParams)
                }
              }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
          })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
          putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
          putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 10000L)
          putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L)
          putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
        }

        speechRecognizer?.startListening(intent)
      } catch (e: Exception) {
        activePromise = null
        promise.reject("START_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        speechRecognizer?.stopListening()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("STOP_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun transcribe(options: ReadableMap, promise: Promise) {
    startListening(promise)
  }
}

class LafinaIntentExtractorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LafinaIntentExtractor"

  private fun normalizeSpeechText(text: String): String {
    return text
      .replace(Regex("\\bp\\.?m\\.?\\b", RegexOption.IGNORE_CASE), "pm")
      .replace(Regex("\\ba\\.?m\\.?\\b", RegexOption.IGNORE_CASE), "am")
      .trim()
  }

  private fun parseTimeFromText(text: String): String? {
    val norm = normalizeSpeechText(text)
    val regex = Regex("(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)", RegexOption.IGNORE_CASE)
    val match = regex.find(norm)
    if (match != null) {
      var hours = match.groupValues[1].toIntOrNull() ?: return null
      val minutes = if (match.groupValues[2].isNotEmpty()) match.groupValues[2].toIntOrNull() ?: 0 else 0
      val meridiem = match.groupValues[3].lowercase()

      if (hours < 1 || hours > 24 || minutes < 0 || minutes > 59) return null

      if (meridiem == "pm" && hours < 12) {
        hours += 12
      } else if (meridiem == "am" && hours == 12) {
        hours = 0
      }

      return String.format("%02d:%02d", hours, minutes)
    }

    val regex24 = Regex("\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b")
    val match24 = regex24.find(norm)
    if (match24 != null) {
      val hours = match24.groupValues[1].toIntOrNull() ?: return null
      val minutes = match24.groupValues[2].toIntOrNull() ?: return null
      return String.format("%02d:%02d", hours, minutes)
    }

    return null
  }

  @ReactMethod
  fun extractIntentJson(options: ReadableMap, promise: Promise) {
    try {
      val transcript = if (options.hasKey("transcript")) options.getString("transcript") ?: "" else ""
      val trimmed = transcript.trim()
      val lower = trimmed.lowercase()

      if (trimmed.isEmpty()) {
        val emptyResponse = """
        {
          "intent": "out_of_scope",
          "task": null,
          "date": null,
          "time": null,
          "duration_minutes": null,
          "status": "rejected",
          "reply": "No speech detected."
        }
        """.trimIndent()
        promise.resolve(emptyResponse)
        return
      }

      // Greetings & Conversational Chat
      if (lower.matches(Regex("^(hey|hi|hello|greetings|good morning|good afternoon|good evening|sup|howdy|what'?s up)\\b.*"))) {
        val greetingResponse = """
        {
          "intent": "acknowledge",
          "task": null,
          "date": null,
          "time": null,
          "duration_minutes": null,
          "status": "success",
          "reply": "Hey there! 👋 I'm LAFINA, your offline AI scheduling assistant. How can I help you organize your day?"
        }
        """.trimIndent()
        promise.resolve(greetingResponse)
        return
      }

      if (lower.contains("who are you") || lower.contains("what can you do") || lower == "help" || lower.contains("how are you")) {
        val infoResponse = """
        {
          "intent": "acknowledge",
          "task": null,
          "date": null,
          "time": null,
          "duration_minutes": null,
          "status": "success",
          "reply": "I'm LAFINA, your voice-first offline AI academic scheduler! You can chat with me, ask me to add tasks, block study time, save notes, or check your schedule."
        }
        """.trimIndent()
        promise.resolve(infoResponse)
        return
      }

      // Explicit scheduling actions
      val isExplicitSchedule = lower.startsWith("set") || lower.startsWith("schedule") ||
                               lower.startsWith("add") || lower.startsWith("create") ||
                               lower.startsWith("remind") || lower.startsWith("block") ||
                               lower.contains("time block") || lower.contains("remind me to")

      if (isExplicitSchedule) {
        val normalizedText = normalizeSpeechText(trimmed)
        val parsedTime = parseTimeFromText(normalizedText)
        
        var cleanTask = normalizedText
          .replace(
            Regex(
              "^(schedule|set(?:\\s+up)?|add|create|remind(?:\\s+me(?:\\s+to)?)?)\\s*(a|an|the)?\\s*",
              RegexOption.IGNORE_CASE
            ),
            ""
          )
          .replace(Regex("^(task|meeting|time\\s*block|block|event)\\s*", RegexOption.IGNORE_CASE), "")
          .replace(
            Regex(
              "(?:\\b(?:at|by|from)\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)\\b",
              RegexOption.IGNORE_CASE
            ),
            ""
          )
          .replace(
            Regex(
              "(?:\\b(?:at|by|from)\\s+)?(?:[01]?\\d|2[0-3]):[0-5]\\d\\b",
              RegexOption.IGNORE_CASE
            ),
            ""
          )
          .replace(Regex("\\b(today|tomorrow)\\b", RegexOption.IGNORE_CASE), "")
          .replace(Regex("\\bthe\\b", RegexOption.IGNORE_CASE), "")
          .replace(
            Regex("^[\\s,:-]*(?:(?:on|at|by|for|starting)\\b[\\s,:-]*)+", RegexOption.IGNORE_CASE),
            ""
          )
          .replace(
            Regex("(?:[\\s,:-]*(?:on|at|by|for|starting)\\b)+[\\s,:-]*$", RegexOption.IGNORE_CASE),
            ""
          )
          .replace(Regex("\\s+"), " ")
          .trim(' ', '.', ',', ':', '-')

        if (cleanTask.isEmpty()) {
          cleanTask = if (lower.contains("meeting")) "meeting" else if (lower.contains("class")) "class" else "Scheduled Event"
        }

        val replyText = if (parsedTime != null) {
          "Task '$cleanTask' added for $parsedTime."
        } else {
          "Added task '$cleanTask'."
        }

        val intentJson = JSONObject().apply {
          put("intent", "schedule")
          put("task", cleanTask)
          put("date", JSONObject.NULL)
          put("time", parsedTime ?: JSONObject.NULL)
          put("duration_minutes", JSONObject.NULL)
          put("status", "success")
          put("reply", replyText)
        }.toString()
        promise.resolve(intentJson)
        return
      }

      // Conversational Chatbot Fallback
      val defaultResponse = """
      {
        "intent": "out_of_scope",
        "task": null,
        "date": null,
        "time": null,
        "duration_minutes": null,
        "status": "rejected",
        "reply": "I'm here to chat or help organize your schedule! To add an event, tell me explicitly like 'schedule a meeting 10 p.m. today' or 'schedule a meeting for 10 - 12pm today'."
      }
      """.trimIndent()
      promise.resolve(defaultResponse)

    } catch (e: Exception) {
      promise.reject("NLU_ERROR", e.message, e)
    }
  }
}
