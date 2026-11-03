package com.lafina

import android.database.sqlite.SQLiteDatabase
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.UUID

/** Dedicated QA gate; production cannot allocate or remove diagnostic databases. */
internal object LafinaQaSqlPolicy {
  fun allowed(buildType: String): Boolean = buildType == "qa"
  fun validName(name: String): Boolean = Regex("lafina-qa-sql-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.sqlite").matches(name)
}

/** Authorizes one synthetic cache file at a time, never the student database path. */
class LafinaQaDiagnosticsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val allocated=mutableSetOf<String>()
  override fun getName()="LafinaQaDiagnostics"
  override fun getConstants(): Map<String,Any> = mapOf("isQaBuild" to LafinaQaSqlPolicy.allowed(BuildConfig.BUILD_TYPE))
  private fun fixture(name: String): File? {
    if(!LafinaQaSqlPolicy.validName(name))return null
    val parent=context.cacheDir.canonicalFile
    return File(parent,name).canonicalFile.takeIf { it.parentFile==parent }
  }
  @ReactMethod fun prepareSqlFixture(promise: Promise) {
    if(!LafinaQaSqlPolicy.allowed(BuildConfig.BUILD_TYPE)) { promise.reject("QA_ONLY","SQL diagnostics are only available in the dedicated QA build.");return }
    try {
      val name=synchronized(allocated) {
        check(allocated.isEmpty())
        val candidate="lafina-qa-sql-${UUID.randomUUID()}.sqlite"
        val file=requireNotNull(fixture(candidate));check(file.createNewFile());allocated.add(candidate);candidate
      }
      promise.resolve(Arguments.createMap().apply { putString("name",name);putString("location",context.cacheDir.canonicalPath) })
    } catch (_: Exception) { promise.reject("QA_SQL_UNAVAILABLE","The isolated QA fixture could not be allocated. Close diagnostics and retry.") }
  }
  @ReactMethod fun releaseSqlFixture(name: String,promise: Promise) {
    if(!LafinaQaSqlPolicy.allowed(BuildConfig.BUILD_TYPE)) { promise.reject("QA_ONLY","SQL diagnostics are only available in the dedicated QA build.");return }
    try {
      val removed=synchronized(allocated) {
        if(!allocated.contains(name))false else {
          val file=fixture(name)
          if(file==null)false else {
            val deleted=SQLiteDatabase.deleteDatabase(file)||!file.exists()
            if(deleted)allocated.remove(name)
            deleted
          }
        }
      }
      promise.resolve(removed)
    } catch (_: Exception) { promise.resolve(false) }
  }
}
