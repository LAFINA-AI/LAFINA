package com.lafina

import android.content.Context
import android.os.Bundle
import android.os.SystemClock
import com.facebook.react.bridge.BridgeReactContext
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.PromiseImpl
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

/** Synthetic PCM collection only. No recording, playback, planner or student database access. */
internal object LafinaSttEvaluation {
  private fun digest(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  private fun assetDigest(context: Context, path: String): String {
    val hash = MessageDigest.getInstance("SHA-256")
    context.assets.open(path).use { input ->
      val buffer = ByteArray(65536)
      while (true) { val count=input.read(buffer); if(count<0)break; hash.update(buffer,0,count) }
    }
    return hash.digest().joinToString("") { "%02x".format(it) }
  }

  /** Converts the production Kokoro PCM WAV deterministically; adds one second of trailing silence. */
  internal fun pcm16k(bytes: ByteArray): FloatArray {
    require(bytes.size in 46..2_000_000)
    require(String(bytes,0,4,Charsets.US_ASCII)=="RIFF" && String(bytes,8,4,Charsets.US_ASCII)=="WAVE")
    require(String(bytes,12,4,Charsets.US_ASCII)=="fmt " && String(bytes,36,4,Charsets.US_ASCII)=="data")
    val data=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    require(data.getInt(16)==16 && data.getShort(20).toInt()==1 && data.getShort(22).toInt()==1)
    require(data.getInt(24)==24000 && data.getShort(34).toInt()==16)
    require(data.getInt(40)==bytes.size-44 && (bytes.size-44)%2==0)
    val source=(bytes.size-44)/2;val count=source*2/3
    require(count>0)
    val result=FloatArray(maxOf(16000,count)+16000)
    for(index in 0 until count) {
      val position=index*1.5;val left=position.toInt().coerceAtMost(source-1);val right=minOf(left+1,source-1)
      val a=data.getShort(44+left*2).toFloat()/32768f;val b=data.getShort(44+right*2).toFloat()/32768f
      result[index]=a+(b-a)*(position-left).toFloat()
    }
    require(result.any { it!=0f } && result.all { it.isFinite() })
    return result
  }

  private fun parserChecks() {
    val bytes=ByteArray(44+96)
    val buffer=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    "RIFF".toByteArray().copyInto(bytes,0);"WAVE".toByteArray().copyInto(bytes,8)
    "fmt ".toByteArray().copyInto(bytes,12);"data".toByteArray().copyInto(bytes,36)
    buffer.putInt(16,16);buffer.putShort(20,1);buffer.putShort(22,1);buffer.putInt(24,24000);buffer.putShort(34,16);buffer.putInt(40,96)
    for(index in 44 until bytes.size step 2)buffer.putShort(index,1000)
    check(pcm16k(bytes).size==32000)
    check(runCatching { pcm16k(ByteArray(4)) }.isFailure)
    buffer.putInt(24,16000);check(runCatching { pcm16k(bytes) }.isFailure)
  }

  fun run(target: Context, tests: Context, arguments: Bundle): Bundle {
    check(LafinaQaDiagnosticsModule(BridgeReactContext(target)).getConstants()["isQaBuild"]==true)
    val artifactHash=requireNotNull(arguments.getString("artifactSha256"))
    val corpusHash=requireNotNull(arguments.getString("corpusSha256"))
    require(Regex("[a-f0-9]{64}").matches(artifactHash) && Regex("[a-f0-9]{64}").matches(corpusHash))
    val corpusBytes=tests.assets.open("stt-corpus-v1.json").use { it.readBytes() }
    require(corpusBytes.size<65536 && digest(corpusBytes)==corpusHash)
    val corpus=JSONObject(String(corpusBytes,Charsets.UTF_8))
    require(corpus.getInt("version")==1 && corpus.getString("classification")=="PUBLIC_SYNTHETIC_ENGLISH_TEXT")
    val references=corpus.getJSONArray("samples");require(references.length()==6)
    parserChecks()
    val lease=requireNotNull(LafinaMicrophoneLease.acquire(target)) { "Speech pipeline busy" }
    val tts=LafinaTTSModule(BridgeReactContext(target))
    val samples=linkedMapOf<String,FloatArray>()
    val audioEvidence=JSONArray()
    val results=JSONArray()
    var synthesisPending=false
    try {
      for(index in 0 until references.length()) {
        val row=references.getJSONObject(index);val id=row.getString("id");val text=row.getString("reference")
        require(Regex("[a-z]{1,30}").matches(id) && text.length in 1..200 && !samples.containsKey(id))
        val file=File(target.cacheDir,"lafina-qa-stt-${UUID.randomUUID()}.wav");check(file.createNewFile())
        val done=CountDownLatch(1);val success=AtomicBoolean(false)
        synthesisPending=true
        try {
          tts.synthesize(text,file.absolutePath,PromiseImpl(Callback { args -> success.set(args.firstOrNull()==true);done.countDown() },Callback { done.countDown() }))
          check(done.await(180,TimeUnit.SECONDS) && success.get()) { "Synthetic source failed" }
          synthesisPending=false
          require(file.length() in 46..2_000_000)
          val bytes=file.readBytes();samples[id]=pcm16k(bytes)
          audioEvidence.put(JSONObject().put("caseId",id).put("sha256",digest(bytes)).put("bytes",bytes.size))
        } finally {
          if(done.count==0L)check(file.delete() || !file.exists())
        }
      }
      // Free the synthetic source model before loading Whisper; never start playback.
      tts.resetInitError(PromiseImpl(Callback {},Callback {}))
      val modelHash=assetDigest(target,LafinaWhisperBridge.MODEL_ASSET)
      fun decode(id: String, condition: String, pointer: Long, start: Long) {
        var outcome="RESULT";var transcript=""
        try {
          check(pointer!=0L)
          transcript=LafinaWhisperBridge.transcribe(pointer,requireNotNull(samples[id]),2,false).trim()
          if(transcript.isEmpty())outcome="EMPTY"
        } catch (_: Throwable) { outcome="ERROR";transcript="" }
        results.put(JSONObject().put("caseId",id).put("condition",condition).put("iteration",0)
          .put("outcome",outcome).put("hypothesis",transcript).put("elapsedMs",(SystemClock.elapsedRealtimeNanos()-start)/1_000_000.0))
      }
      for(id in samples.keys) {
        val start=SystemClock.elapsedRealtimeNanos();var pointer=0L
        try {pointer=LafinaWhisperBridge.initContext(target.assets,LafinaWhisperBridge.MODEL_ASSET);decode(id,"cold",pointer,start)}
        finally {if(pointer!=0L)LafinaWhisperBridge.freeContext(pointer)}
      }
      val warm=LafinaWhisperBridge.initContext(target.assets,LafinaWhisperBridge.MODEL_ASSET)
      try {for(id in samples.keys)decode(id,"warm",warm,SystemClock.elapsedRealtimeNanos())}
      finally {if(warm!=0L)LafinaWhisperBridge.freeContext(warm)}
      val cohort=JSONObject().put("version",1).put("corpusSha256",corpusHash).put("artifactSha256",artifactHash)
        .put("provenance","DIRECT_SYNTHETIC_PCM").put("repetitionsPerCondition",1)
        .put("engine",JSONObject().put("name","Whisper.cpp").put("version","bundled-two-threads")
          .put("model","ggml-tiny.en-q5_1.bin").put("modelSha256",modelHash)).put("samples",results)
      return Bundle().apply {
        putString("stream","PASS: twelve direct synthetic PCM observations collected without microphone, playback or scheduling.\n")
        putString("cohort",cohort.toString());putString("syntheticAudio",audioEvidence.toString())
        putBoolean("generatedFilesRemoved",true);putInt("pcmParserChecks",3)
      }
    } finally {
      if(!synthesisPending)tts.resetInitError(PromiseImpl(Callback {},Callback {}))
      lease.close()
    }
  }
}
