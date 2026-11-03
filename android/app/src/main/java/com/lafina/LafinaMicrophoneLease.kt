package com.lafina

import android.content.Context
import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileLock

/** Empty-file OS lease shared by every live recorder. Process death releases it. */
class LafinaMicrophoneLease private constructor(
  private val identity: String,
  private val file: RandomAccessFile,
  private val lock: FileLock,
) : Closeable {
  override fun close(): Unit = synchronized(owners) {
    if (owners[identity] !== this) return@synchronized
    try { if (lock.isValid) lock.release() } catch (_: Exception) { }
    try { file.close() } catch (_: Exception) { }
    owners.remove(identity)
    Unit
  }
  companion object {
    private val owners = mutableMapOf<String, LafinaMicrophoneLease>()
    fun acquire(context: Context): LafinaMicrophoneLease? = acquire(File(context.noBackupFilesDir, "lafina-microphone.lock"))
    /** Explicit path supports isolated native tests without touching a student recorder. */
    fun acquire(path: File): LafinaMicrophoneLease? = synchronized(owners) {
      var file: RandomAccessFile? = null
      try {
        val identity = path.canonicalPath
        // POSIX may release a process's lock when ANY descriptor for that file
        // closes. Never open/close a competing descriptor in this same process.
        if (owners.containsKey(identity)) return@synchronized null
        val opened = RandomAccessFile(identity, "rw")
        file = opened
        val lock = opened.channel.tryLock()
        if (lock == null) { opened.close(); null } else LafinaMicrophoneLease(identity, opened, lock).also { owners[identity] = it }
      } catch (_: Exception) {
        try { file?.close() } catch (_: Exception) { }; null
      }
    }
  }
}
