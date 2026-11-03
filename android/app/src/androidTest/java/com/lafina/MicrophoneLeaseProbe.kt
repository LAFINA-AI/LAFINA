package com.lafina

import java.io.File

/** Separate app_process probe; receives only a synthetic empty lock-file path. */
object MicrophoneLeaseProbe {
  @JvmStatic fun main(args: Array<String>) {
    val lease = LafinaMicrophoneLease.acquire(File(args.single()))
    println(if (lease == null) "BUSY" else "ACQUIRED")
    lease?.close()
  }
}
