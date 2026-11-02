package com.lafina

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Binder
import android.os.Bundle
import android.os.Process
import java.time.Instant
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/** Same-UID transport; callers cannot supply a filename, schema, SQL or arbitrary action. */
class LafinaDeliveryProvider : ContentProvider() {
  override fun onCreate() = true
  override fun call(method: String, arg: String?, extras: Bundle?): Bundle {
    check(Binder.getCallingUid()==Process.myUid()) { "PRIVATE_DELIVERY_PROVIDER" }
    val context=requireNotNull(context)
    return try {
      LafinaDeliveryRuntime.worker.submit<Bundle> {
        val result=Bundle()
        when(method) {
          "reconcile","cancel" -> { LafinaDeliveryRuntime.reconcile(context,extras?.getBoolean("force") ?: false); result.putBoolean("ok",true) }
          "schedule" -> {
            val id=requireNotNull(arg)
            LafinaDeliveryStore(context).use { store ->
              val job=requireNotNull(store.current(id)) { "REMINDER_NOT_FOUND" }
              check(!job.deleted && job.identity.userId==store.activeUser() && job.state=="pending") { "REMINDER_CHANGED" }
              check(Instant.parse(job.triggerAt).toEpochMilli()==extras?.getLong("triggerAtMs")) { "REMINDER_CHANGED" }
            }
            LafinaDeliveryRuntime.reconcile(context)
            result.putBoolean("ok",true)
          }
          "pending","open" -> {
            val value=LafinaDeliveryRuntime.payload(context,if(method=="open") arg ?: "" else null)
            if(value!=null) result.putString("json",value.toString())
          }
          "hold" -> result.putBoolean("ok",LafinaDeliveryRuntime.hold(context,requireNotNull(arg),extras?.getString("deliveryKey") ?: ""))
          "finish" -> { LafinaDeliveryRuntime.finish(context,requireNotNull(arg),extras?.getString("deliveryKey")); result.putBoolean("ok",true) }
          else -> throw IllegalArgumentException("UNSUPPORTED_DELIVERY_OPERATION")
        }
        result
      }.get(10,TimeUnit.SECONDS)
    } catch (_: Exception) { Bundle().apply { putString("error","DELIVERY_NOT_READY") } }
  }
  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
  override fun getType(uri: Uri): String? = null
  override fun insert(uri: Uri, values: ContentValues?): Uri? = null
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
}

/** Native-module bridge to the isolated coordinator; no React code runs in its process. */
object LafinaDeliveryBridge {
  fun request(context: Context, method: String, id: String? = null, extras: Bundle? = null): Bundle {
    val result=requireNotNull(context.contentResolver.call(Uri.parse("content://${context.packageName}.delivery"),method,id,extras))
    check(!result.containsKey("error")) { "Local reminder delivery is not ready. Open LAFINA again to retry." }
    return result
  }
  fun payload(context: Context, intent: android.content.Intent? = null): JSONObject? {
    val method=if(intent?.data?.scheme=="lafina-reminder") "open" else "pending"
    val json=request(context,method,if(method=="open") intent?.data?.toString() else null).getString("json")
      ?: (if(method=="open") request(context,"pending").getString("json") else null) ?: return null
    return JSONObject(json)
  }
}
