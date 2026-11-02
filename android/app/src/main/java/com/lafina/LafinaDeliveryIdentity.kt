package com.lafina

import java.net.URLEncoder

/** Full immutable operation identity, shared with storage/deliveryStore.ts. */
data class LafinaDeliveryIdentity(
  val userId: String, val reminderId: String, val occurrenceKey: String, val generation: Long
) {
  fun key(operation: String): String {
    require(generation >= 1 && operation in setOf("due", "timeout", "open"))
    require(listOf(userId, reminderId, occurrenceKey).all { it.isNotEmpty() && it.length <= 2048 })
    fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
      .replace("+", "%20").replace("*", "%2A").replace("%7E", "~")
    return "lafina-reminder://com.lafina/$operation/${encode(userId)}/${encode(reminderId)}/${encode(occurrenceKey)}/$generation"
  }
}
