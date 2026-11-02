package com.lafina

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LafinaReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending=goAsync()
    LafinaDeliveryRuntime.worker.execute {
      try { LafinaDeliveryRuntime.handle(context.applicationContext,intent) }
      catch (_: Exception) { android.util.Log.w("LafinaDelivery","Delivery awaits guarded database startup or recovery.") }
      finally { pending.finish() }
    }
  }
}
