package com.lafina

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import com.facebook.react.bridge.*

/** Metadata policy shared by inventory, selection and live-voice verification. */
internal object LafinaAndroidSpeechPolicy {
  fun installedEnglish(name: String, language: String, network: Boolean, features: Set<String>): Boolean =
    name.length in 1..512 && language == "en" && !network && !features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
  fun englishSupport(installed: List<String>?, error: Int? = null): String = when {
    error == SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT -> "unknown"
    error != null -> "unavailable"
    installed.orEmpty().any { it.replace('_','-').equals("en-US",ignoreCase=true) } -> "installed"
    else -> "missing"
  }
  fun validCustomization(provider: String?, rate: Double, pitch: Double): Boolean =
    (provider == null || (provider.length in 1..200 && Regex("([a-zA-Z0-9_]+\\.)+[a-zA-Z0-9_]+").matches(provider))) &&
      rate.isFinite() && pitch.isFinite() && rate in 0.5..2.0 && pitch in 0.5..2.0
  fun validOwner(id: String): Boolean = id.length in 1..256 && id.none { it.code < 32 }
}

/** Optional platform speech. Main-thread state, owned requests, no downloads or generic recognizer. */
class LafinaAndroidSpeechModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(AudioManager::class.java)
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
  private var focus: AudioFocusRequest? = null
  private var paused = false
  private var engine: TextToSpeech? = null
  private var ready = false
  private var enginePackage: String? = null
  private var initializationStarted=0L
  private var lastTtsInitializationMs: Double?=null
  private var lastRecognitionSupportMs: Double?=null
  private var lastCaptureReadyMs: Double?=null
  private var lastCaptureDurationMs: Double?=null
  private var lastSpeechStartMs: Double?=null
  private var lastSpeechDurationMs: Double?=null
  private var lastRecognitionState="unknown"
  private var supportSequence=0
  private var initialization = 0
  private var initTimer: Runnable? = null
  private val waiting = mutableListOf<(TextToSpeech?) -> Unit>()
  private data class Capture(val id: String, val promise: Promise, val started: Long, val microphone: LafinaMicrophoneLease,
    var recognizer: SpeechRecognizer? = null, var listening: Boolean = false, var timeout: Runnable? = null)
  private data class Speech(val id: String, val promise: Promise, val started: Long = SystemClock.elapsedRealtime(), var timeout: Runnable? = null)
  private var capture: Capture? = null
  private var speech: Speech? = null
  private var cancelSupportProbe: (() -> Unit)? = null
  private fun englishIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    putExtra(RecognizerIntent.EXTRA_LANGUAGE,"en-US");putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true)
    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,false);putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
  }
  private fun checkEnglish(recognizer: SpeechRecognizer, complete: (String) -> Unit) {
    val started=SystemClock.elapsedRealtime();val ticket=++supportSequence
    fun finish(state: String) { if(ticket==supportSequence){lastRecognitionSupportMs=(SystemClock.elapsedRealtime()-started).toDouble();lastRecognitionState=state};complete(state) }
    if(Build.VERSION.SDK_INT<33) { finish("unknown");return }
    try { recognizer.checkRecognitionSupport(englishIntent(),context.mainExecutor,object : RecognitionSupportCallback {
      override fun onSupportResult(support: RecognitionSupport) { finish(LafinaAndroidSpeechPolicy.englishSupport(support.installedOnDeviceLanguages)) }
      override fun onError(error: Int) { finish(LafinaAndroidSpeechPolicy.englishSupport(null,error)) }
    }) } catch (_: Exception) { finish("unavailable") }
  }
  private fun recognitionReadiness(complete: (String) -> Unit) {
    if(!available()||!foreground()) { complete("unavailable");return }
    if(capture!=null||speech!=null||cancelSupportProbe!=null) { complete("busy");return }
    if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED) { complete("permission_required");return }
    if(Build.VERSION.SDK_INT<33) { complete("unknown");return }
    var probe: SpeechRecognizer?=null;var timer: Runnable?=null;var done=false
    fun finish(state: String) { if(done)return;done=true;timer?.let(handler::removeCallbacks);try { probe?.destroy() } catch (_: Exception) { };cancelSupportProbe=null;complete(state) }
    cancelSupportProbe={ finish("unavailable") }
    timer=Runnable { finish("unavailable") }.also { handler.postDelayed(it,4000) }
    try { probe=SpeechRecognizer.createOnDeviceSpeechRecognizer(context);checkEnglish(probe!!) { finish(it) } } catch (_: Exception) { finish("unavailable") }
  }

  init { context.addLifecycleEventListener(this) }
  override fun getName() = "LafinaAndroidSpeech"
  private fun foreground() = !paused && context.currentActivity?.isFinishing == false
  private fun available(): Boolean = try { Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context) } catch (_: Exception) { false }
  private fun safe(voice: Voice): Boolean = LafinaAndroidSpeechPolicy.installedEnglish(voice.name, voice.locale.language, voice.isNetworkConnectionRequired, voice.features.orEmpty())
  private fun onMain(promise: Promise, work: () -> Unit) { handler.post { try { work() } catch (_: Exception) { promise.reject("ANDROID_SPEECH_UNAVAILABLE", "Selected offline Android speech is unavailable. Use text or change engines in Profile.") } } }
  private fun acquireFocus(): Boolean {
    if (audio.mode != AudioManager.MODE_NORMAL) return false
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
      .setAudioAttributes(attributes).setAcceptsDelayedFocusGain(false).setWillPauseWhenDucked(true)
      .setOnAudioFocusChangeListener({ change -> if (change != AudioManager.AUDIOFOCUS_GAIN) {
        capture?.let { finishCapture(it, "", true) }; speech?.let { finishSpeech(it, false) }
      } }, handler).build()
    if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false
    focus = request; return true
  }
  private fun releaseFocus() { focus?.let { try { audio.abandonAudioFocusRequest(it) } catch (_: Exception) { } }; focus = null }
  private fun finishCapture(run: Capture, text: String, cancelled: Boolean, error: Boolean = false) {
    if (capture !== run) return
    lastCaptureDurationMs=(SystemClock.elapsedRealtime()-run.started).toDouble()
    capture = null; run.timeout?.let(handler::removeCallbacks)
    var stopped=run.recognizer==null
    try { run.recognizer?.cancel();stopped=true } catch (_: Exception) { }
    try { run.recognizer?.destroy();stopped=true } catch (_: Exception) { }
    // If both platform stop operations fail, retain exclusion until process death.
    if(stopped)run.microphone.close()
    releaseFocus()
    if (error) run.promise.reject("ANDROID_ENGLISH_RECOGNITION_UNAVAILABLE", "On-device English recognition could not finish. Type your command or check Speech engines in Profile.")
    else run.promise.resolve(Arguments.createMap().apply {
      putString("captureId", run.id); putString("transcript", text); putBoolean("speechDetected", text.isNotBlank())
      putBoolean("cancelled", cancelled); putDouble("captureDurationMs", (SystemClock.elapsedRealtime() - run.started).toDouble())
      putDouble("inferenceDurationMs", 0.0) // Platform provides no separate inference duration.
    })
  }
  @ReactMethod fun startListening(options: ReadableMap, promise: Promise) = onMain(promise) {
    val id = options.getString("captureId") ?: ""
    check(LafinaAndroidSpeechPolicy.validOwner(id) && foreground() && available())
    check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    check(capture == null && speech == null)
    cancelSupportProbe?.invoke()
    val microphone = LafinaMicrophoneLease.acquire(context)
    if (microphone == null) { promise.reject("CAPTURE_BUSY", "The microphone is in use. Stop the other recording first."); return@onMain }
    try { check(acquireFocus()) } catch (error: Exception) { microphone.close(); throw error }
    lastCaptureReadyMs=null;lastCaptureDurationMs=null
    val run = Capture(id, promise, SystemClock.elapsedRealtime(), microphone); capture = run
    try {
      if (Build.VERSION.SDK_INT < 31) error("Unsupported")
      val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context); run.recognizer = recognizer
      recognizer.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { if(capture===run)lastCaptureReadyMs=(SystemClock.elapsedRealtime()-run.started).toDouble();if (!foreground()) finishCapture(run, "", true) }
        override fun onBeginningOfSpeech() { }
        override fun onRmsChanged(rms: Float) { }
        override fun onBufferReceived(buffer: ByteArray?) { }
        override fun onEndOfSpeech() { }
        override fun onPartialResults(results: Bundle?) { }
        override fun onEvent(type: Int, params: Bundle?) { }
        override fun onError(code: Int) { finishCapture(run, "", false, true) }
        override fun onResults(results: Bundle?) {
          val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
          if (!foreground() || text.length > 2000 || text.any { it.code < 32 && it != '\n' && it != '\t' }) finishCapture(run, "", true)
          else finishCapture(run, text, false)
        }
      })
      run.timeout = Runnable { finishCapture(run,"",false,true) }.also { handler.postDelayed(it,4000) }
      checkEnglish(recognizer) { state ->
        if(capture!==run||run.listening)return@checkEnglish
        if(state!="installed"&&state!="unknown") { finishCapture(run,"",false,true);return@checkEnglish }
        try { check(foreground()&&context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)
          run.timeout?.let(handler::removeCallbacks);run.timeout=Runnable { finishCapture(run,"",false,true) }.also { handler.postDelayed(it,60000) }
          run.listening=true;recognizer.startListening(englishIntent())
        } catch (_: Exception) { finishCapture(run,"",false,true) }
      }

    } catch (_: Exception) { finishCapture(run, "", false, true) }
  }
  @ReactMethod fun stopListening(id: String, promise: Promise) = onMain(promise) {
    val run = capture?.takeIf { it.id == id }
    if (run == null) promise.resolve(false) else {
      if(!run.listening) { finishCapture(run,"",true);promise.resolve(true);return@onMain }
      try { run.recognizer?.stopListening(); run.timeout?.let(handler::removeCallbacks)
        run.timeout = Runnable { finishCapture(run, "", false, true) }.also { handler.postDelayed(it, 15000) }; promise.resolve(true)
      } catch (_: Exception) { finishCapture(run, "", false, true); promise.resolve(false) }
    }
  }
  @ReactMethod fun cancelListening(id: String, promise: Promise) = onMain(promise) {
    val run = capture?.takeIf { it.id == id }; if (run != null) finishCapture(run, "", true); promise.resolve(run != null)
  }
  private fun finishInitialization(value: TextToSpeech?) {
    if(initializationStarted>0)lastTtsInitializationMs=(SystemClock.elapsedRealtime()-initializationStarted).toDouble();initializationStarted=0
    initTimer?.let(handler::removeCallbacks); initTimer = null
    val callbacks = waiting.toList(); waiting.clear(); callbacks.forEach { it(value) }
  }
  @Suppress("DEPRECATION")
  private fun installedProviders(): List<Pair<String,String>> = context.packageManager.queryIntentServices(Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE),0)
    .mapNotNull { info -> info.serviceInfo?.takeIf { it.enabled && it.applicationInfo.enabled && LafinaAndroidSpeechPolicy.validCustomization(it.packageName,1.0,1.0) }?.let { it.packageName to info.loadLabel(context.packageManager).toString().take(200) } }
    .distinctBy { it.first }.sortedBy { it.first }.take(32)
  private fun withEngine(requestedPackage: String?, complete: (TextToSpeech?) -> Unit) {
    try { prepareEngine(requestedPackage,complete) } catch (_: Exception) { complete(null) }
  }
  private fun prepareEngine(requestedPackage: String?, complete: (TextToSpeech?) -> Unit) {
    val wanted = requestedPackage ?: Settings.Secure.getString(context.contentResolver,Settings.Secure.TTS_DEFAULT_SYNTH)
    if(wanted != null && installedProviders().none { it.first == wanted }) { complete(null); return }
    if (ready && enginePackage == wanted) { complete(engine); return }
    if(waiting.isNotEmpty() && enginePackage != wanted) { complete(null); return }
    if(ready) { try { engine?.shutdown() } catch (_: Exception) { }; engine=null; ready=false }
    enginePackage=wanted
    if (waiting.size >= 8 || !foreground()) { complete(null); return }
    waiting.add(complete); if (waiting.size > 1) return
    val ticket = ++initialization
    initializationStarted=SystemClock.elapsedRealtime()
    initTimer = Runnable { if (ticket == initialization) { ++initialization; try { engine?.shutdown() } catch (_: Exception) { }; engine = null; ready = false; finishInitialization(null) } }.also { handler.postDelayed(it, 10000) }
    try { engine = TextToSpeech(context, { status -> handler.post {
      if (ticket != initialization) return@post
      ready = status == TextToSpeech.SUCCESS && foreground()
      try { if (ready) {
        engine?.setAudioAttributes(attributes)
        engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String?) { handler.post { speech?.takeIf { it.id==id }?.let { lastSpeechStartMs=(SystemClock.elapsedRealtime()-it.started).toDouble() } } }
          override fun onDone(id: String?) { handler.post { speech?.takeIf { it.id == id }?.let { finishSpeech(it, true) } } }
          @Deprecated("Legacy platform callback") override fun onError(id: String?) { handler.post { speech?.takeIf { it.id == id }?.let { finishSpeech(it, false) } } }
          override fun onError(id: String?, code: Int) { onError(id) }
          override fun onStop(id: String?, interrupted: Boolean) { handler.post { speech?.takeIf { it.id == id }?.let { finishSpeech(it, false) } } }
        })
      } else { try { engine?.shutdown() } catch (_: Exception) { }; engine = null }
      } catch (_: Exception) { ready = false; try { engine?.shutdown() } catch (_: Exception) { }; engine = null }
      finishInitialization(if (ready) engine else null)
    } },wanted) } catch (_: Exception) { engine = null; ready = false; ++initialization; finishInitialization(null) }
  }
  @ReactMethod fun getCapabilities(requestedPackage: String?, promise: Promise) = onMain(promise) {
    val recognition = available()
    check(LafinaAndroidSpeechPolicy.validCustomization(requestedPackage,1.0,1.0))
    val response=Arguments.createMap();response.putBoolean("onDeviceRecognition",recognition)
    val providers=Arguments.createArray();installedProviders().forEach { (name,label) -> providers.pushMap(Arguments.createMap().apply { putString("packageName",name);putString("label",label) }) };response.putArray("providers",providers)
    if(speech!=null||capture!=null) { response.putBoolean("busy",true);response.putString("recognitionState","busy");response.putArray("voices",Arguments.createArray());response.putString("providerPackage",requestedPackage);promise.resolve(response);return@onMain }
    var speechReady=false;var recognitionReady=false
    fun publish() { if(speechReady&&recognitionReady)promise.resolve(response) }
    recognitionReadiness { state -> response.putString("recognitionState",state);response.putBoolean("busy",state=="busy");recognitionReady=true;publish() }
    withEngine(requestedPackage) { service ->
      val voices=Arguments.createArray()
      try { service?.voices.orEmpty().filter(::safe).sortedBy { it.name }.take(200).forEach { voice -> voices.pushMap(Arguments.createMap().apply { putString("name",voice.name);putString("locale",voice.locale.toLanguageTag());putBoolean("networkRequired",false);putBoolean("installed",true) }) } } catch (_: Exception) { }
      response.putArray("voices",voices);response.putString("providerPackage",enginePackage?:service?.defaultEngine);speechReady=true;publish()
    }
  }

  private fun finishSpeech(run: Speech, success: Boolean) {
    if (speech !== run) return
    lastSpeechDurationMs=(SystemClock.elapsedRealtime()-run.started).toDouble()
    speech = null; run.timeout?.let(handler::removeCallbacks)
    try { engine?.stop() } catch (_: Exception) { }; releaseFocus(); run.promise.resolve(success)
  }
  @ReactMethod fun speak(request: ReadableMap, promise: Promise) = onMain(promise) {
    val id = request.getString("requestId") ?: ""; val text = request.getString("text") ?: ""; val name = request.getString("voiceName") ?: ""
    check(LafinaAndroidSpeechPolicy.validOwner(id) && text.isNotBlank() && text.length <= 2000 && foreground())
    check(speech == null && capture == null)
    val requestedPackage=if(request.hasKey("providerPackage")&&!request.isNull("providerPackage"))request.getString("providerPackage") else null
    val rate=if(request.hasKey("rate"))request.getDouble("rate") else 1.0
    val pitch=if(request.hasKey("pitch"))request.getDouble("pitch") else 1.0
    check(LafinaAndroidSpeechPolicy.validCustomization(requestedPackage,rate,pitch))
    lastSpeechStartMs=null;lastSpeechDurationMs=null
    val run = Speech(id, promise); speech = run
    run.timeout = Runnable { finishSpeech(run, false) }.also { handler.postDelayed(it, 70000) }
    withEngine(requestedPackage) { service ->
      if (speech !== run) return@withEngine
      try {
        check(service != null && foreground())
        val voice = service.voices?.firstOrNull { it.name == name && safe(it) }; check(voice != null)
        check(service.setVoice(voice) == TextToSpeech.SUCCESS && service.voice?.let { it.name == name && safe(it) } == true)
        check(service.setSpeechRate(rate.toFloat()) == TextToSpeech.SUCCESS && service.setPitch(pitch.toFloat()) == TextToSpeech.SUCCESS)
        check(acquireFocus())
        check(service.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), id) == TextToSpeech.SUCCESS)
        run.timeout?.let(handler::removeCallbacks); run.timeout = Runnable { finishSpeech(run, false) }.also { handler.postDelayed(it, 60000) }
      } catch (_: Exception) { finishSpeech(run, false) }
    }
  }
  @ReactMethod fun stopSpeaking(id: String, promise: Promise) = onMain(promise) {
    val run = speech?.takeIf { it.id == id }; if (run != null) finishSpeech(run, false); promise.resolve(run != null)
  }
  @ReactMethod fun getDiagnostics(promise: Promise) = onMain(promise) {
    val metrics=Arguments.createMap()
    for((key,value) in listOf("ttsInitializationMs" to lastTtsInitializationMs,"recognitionSupportMs" to lastRecognitionSupportMs,"captureReadyMs" to lastCaptureReadyMs,"captureDurationMs" to lastCaptureDurationMs,"speechStartMs" to lastSpeechStartMs,"speechDurationMs" to lastSpeechDurationMs)) {
      if(value==null)metrics.putNull(key) else metrics.putDouble(key,value)
    }
    promise.resolve(Arguments.createMap().apply { putInt("sdk",Build.VERSION.SDK_INT);putBoolean("onDeviceRecognition",available());putString("recognitionState",lastRecognitionState);putBoolean("captureActive",capture!=null);putBoolean("speechActive",speech!=null);putMap("metrics",metrics) })
  }
  private fun release() {
    ++supportSequence
    cancelSupportProbe?.invoke()
    capture?.let { finishCapture(it, "", true) }; speech?.let { finishSpeech(it, false) }
    ++initialization; ready = false; try { engine?.shutdown() } catch (_: Exception) { }; engine = null; finishInitialization(null); releaseFocus()
  }
  override fun onHostResume() { paused = false }
  override fun onHostPause() { paused = true; handler.post { release() } }
  override fun onHostDestroy() { paused = true; handler.post { release() } }
  override fun invalidate() { context.removeLifecycleEventListener(this); handler.post { release() }; super.invalidate() }
}
