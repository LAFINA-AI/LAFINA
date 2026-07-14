#include <jni.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <android/log.h>
#include <algorithm>
#include <string>
#include <thread>
#include "whisper.h"

namespace {
constexpr const char *kTag = "LafinaWhisper";

size_t assetRead(void *context, void *output, size_t size) {
  return static_cast<size_t>(AAsset_read(static_cast<AAsset *>(context), output, size));
}

bool assetEof(void *context) {
  return AAsset_getRemainingLength64(static_cast<AAsset *>(context)) <= 0;
}

void assetClose(void *context) {
  AAsset_close(static_cast<AAsset *>(context));
}

std::string trim(const std::string &value) {
  const auto first = value.find_first_not_of(" \\n\\r\\t");
  if (first == std::string::npos) return "";
  const auto last = value.find_last_not_of(" \\n\\r\\t");
  return value.substr(first, last - first + 1);
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_lafina_LafinaWhisperBridge_initContext(
    JNIEnv *env, jobject, jobject assetManager, jstring assetPath) {
  const char *path = env->GetStringUTFChars(assetPath, nullptr);
  AAssetManager *manager = AAssetManager_fromJava(env, assetManager);
  AAsset *asset = AAssetManager_open(manager, path, AASSET_MODE_STREAMING);
  env->ReleaseStringUTFChars(assetPath, path);
  if (asset == nullptr) {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "Unable to open Whisper model asset");
    return 0;
  }
  whisper_model_loader loader{};
  loader.context = asset;
  loader.read = assetRead;
  loader.eof = assetEof;
  loader.close = assetClose;
  whisper_context_params contextParams = whisper_context_default_params();
  contextParams.use_gpu = false;
  whisper_context *context = whisper_init_with_params(&loader, contextParams);
  return reinterpret_cast<jlong>(context);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_lafina_LafinaWhisperBridge_transcribe(
    JNIEnv *env, jobject, jlong contextPointer, jfloatArray samples, jint requestedThreads) {
  auto *context = reinterpret_cast<whisper_context *>(contextPointer);
  if (context == nullptr) return env->NewStringUTF("");
  const jsize sampleCount = env->GetArrayLength(samples);
  jfloat *audio = env->GetFloatArrayElements(samples, nullptr);
  whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  params.language = "en";
  params.translate = false;
  params.no_context = true;
  params.single_segment = true;
  params.print_progress = false;
  params.print_realtime = false;
  params.print_timestamps = false;
  params.suppress_blank = true;
  params.temperature = 0.0f;
  params.n_threads = std::clamp(static_cast<int>(requestedThreads), 1, 4);
  std::string transcript;
  const int result = whisper_full(context, params, audio, sampleCount);
  env->ReleaseFloatArrayElements(samples, audio, JNI_ABORT);
  if (result == 0) {
    const int segmentCount = whisper_full_n_segments(context);
    for (int index = 0; index < segmentCount; ++index) {
      transcript += whisper_full_get_segment_text(context, index);
    }
  } else {
    __android_log_print(ANDROID_LOG_ERROR, kTag, "whisper_full failed: %d", result);
  }
  transcript = trim(transcript);
  return env->NewStringUTF(transcript.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_lafina_LafinaWhisperBridge_freeContext(JNIEnv *, jobject, jlong contextPointer) {
  auto *context = reinterpret_cast<whisper_context *>(contextPointer);
  if (context != nullptr) whisper_free(context);
}
