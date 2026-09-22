package com.lafina

import android.content.Intent
import android.os.Process
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.KeyFactory
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The native half of in-app updates: signature checks, the download, and the
 * restart that puts a downloaded bundle into use. Deciding *whether* to update
 * lives in `src/updates/` on the JS side; see [OtaBundles] for how bundles are
 * kept and started.
 */
class LafinaUpdaterModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val worker = Executors.newSingleThreadExecutor()
  private val downloading = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)

  override fun getName(): String = "LafinaUpdater"

  @ReactMethod
  fun getInfo(promise: Promise) {
    try {
      val info = OtaBundles.info(reactContext)
      val map = Arguments.createMap().apply {
        putInt("nativeVersionCode", BuildConfig.VERSION_CODE)
        putString("nativeVersionName", BuildConfig.VERSION_NAME)
        putBoolean("isDebug", BuildConfig.DEBUG)
        putString("runningVersion", OtaBundles.runningVersion)
        putString("pendingVersion", info.pendingVersion)
        putArray("rejectedVersions", Arguments.fromList(info.rejected))
      }
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("E_INFO", error.message, error)
    }
  }

  /**
   * Checks an ECDSA P-256 / SHA-256 signature over the manifest's bytes with
   * the release public key, and returns those bytes as text only when it holds.
   */
  @ReactMethod
  fun verifyManifest(payloadBase64: String, signatureBase64: String, publicKeyBase64: String, promise: Promise) {
    try {
      val key = KeyFactory.getInstance("EC")
        .generatePublic(X509EncodedKeySpec(Base64.decode(publicKeyBase64, Base64.DEFAULT)))
      if (key !is ECPublicKey || key.params.curve.field.fieldSize != 256) {
        promise.reject("E_KEY", "The update signing key must be an ECDSA P-256 key.")
        return
      }
      val payload = Base64.decode(payloadBase64, Base64.DEFAULT)
      val verifier = Signature.getInstance("SHA256withECDSA")
      verifier.initVerify(key)
      verifier.update(payload)
      if (!verifier.verify(Base64.decode(signatureBase64, Base64.DEFAULT))) {
        promise.reject("E_SIGNATURE", "bad signature")
        return
      }
      promise.resolve(String(payload, Charsets.UTF_8))
    } catch (error: Exception) {
      // A malformed key, payload or signature is refused the same way as a wrong one.
      promise.reject("E_SIGNATURE", "bad signature")
    }
  }

  @ReactMethod
  fun downloadBundle(options: ReadableMap, promise: Promise) {
    if (!downloading.compareAndSet(false, true)) {
      promise.reject("E_BUSY", "An update is already downloading.")
      return
    }
    cancelled.set(false)
    val url = options.getString("url") ?: ""
    val version = options.getString("version") ?: ""
    val nativeVersionCode = options.getInt("nativeVersionCode")
    // JS numbers arrive as doubles; sizes are far below where that loses precision.
    val size = options.getDouble("size").toLong()
    val sha256 = options.getString("sha256") ?: ""

    worker.execute {
      try {
        OtaBundles.download(
          context = reactContext,
          url = url,
          version = version,
          nativeVersionCode = nativeVersionCode,
          size = size,
          sha256 = sha256,
          isCancelled = { cancelled.get() },
          onProgress = { received, total -> emitProgress(received, total) },
        )
        promise.resolve(true)
      } catch (error: OtaBundles.OtaException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject("E_DOWNLOAD", "The update could not be saved. Try again.", error)
      } finally {
        downloading.set(false)
      }
    }
  }

  @ReactMethod
  fun cancelDownload() {
    cancelled.set(true)
  }

  @ReactMethod
  fun markLaunchSuccessful(promise: Promise) {
    try {
      promise.resolve(OtaBundles.markLaunchSuccessful(reactContext))
    } catch (error: Exception) {
      promise.reject("E_CONFIRM", error.message, error)
    }
  }

  /**
   * Restarts the app so the staged bundle starts. A small activity in its own
   * process ends this one and opens LAFINA again, the way ProcessPhoenix does:
   * a process cannot reliably relaunch itself on its way out.
   */
  @ReactMethod
  fun restart(promise: Promise) {
    try {
      val intent = Intent(reactContext, LafinaRestartActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        .putExtra(LafinaRestartActivity.EXTRA_PID, Process.myPid())
      val activity = reactContext.currentActivity
      if (activity != null) activity.startActivity(intent) else reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_RESTART", "LAFINA could not restart itself. Close and reopen the app to finish the update.", error)
    }
  }

  private fun emitProgress(received: Long, total: Long) {
    if (!reactContext.hasActiveReactInstance()) return
    val payload = Arguments.createMap().apply {
      putDouble("received", received.toDouble())
      putDouble("total", total.toDouble())
    }
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_PROGRESS, payload)
  }

  override fun invalidate() {
    cancelled.set(true)
    worker.shutdown()
    super.invalidate()
  }

  companion object {
    const val EVENT_PROGRESS = "LafinaUpdaterProgress"
  }
}
