import { DeviceEventEmitter, NativeModules } from 'react-native';

/** What the installed APK knows about updates. */
export interface UpdaterInfo {
  /** `versionCode` of the installed APK; a bundle runs only on the build it was made for. */
  nativeVersionCode: number;
  nativeVersionName: string;
  /** Development builds load JavaScript from Metro, so a downloaded bundle never starts. */
  isDebug: boolean;
  /** The downloaded version this launch is running, or null for the APK's own bundle. */
  runningVersion: string | null;
  /** Downloaded and waiting for the next start. */
  pendingVersion: string | null;
  /** Versions rolled back after they failed to start; never offered again. */
  rejectedVersions: string[];
}

export interface DownloadRequest {
  url: string;
  version: string;
  nativeVersionCode: number;
  size: number;
  sha256: string;
}

export interface DownloadProgress {
  received: number;
  total: number;
}

export interface NativeUpdater {
  getInfo: () => Promise<UpdaterInfo>;
  /** Resolves with the payload's text only when the signature holds; rejects otherwise. */
  verifyManifest: (payload: string, signature: string, publicKey: string) => Promise<string>;
  downloadBundle: (request: DownloadRequest) => Promise<boolean>;
  cancelDownload: () => void;
  markLaunchSuccessful: () => Promise<boolean>;
  restart: () => Promise<boolean>;
  onProgress: (listener: (progress: DownloadProgress) => void) => { remove: () => void };
}

type LafinaUpdaterNativeModule = Omit<NativeUpdater, 'onProgress'>;

const PROGRESS_EVENT = 'LafinaUpdaterProgress';

/** The native updater, or null in a build without it (tests, an older APK). */
export const getNativeUpdater = (): NativeUpdater | null => {
  const module = NativeModules.LafinaUpdater as LafinaUpdaterNativeModule | undefined;
  if (!module?.verifyManifest || !module.downloadBundle) return null;
  return {
    getInfo: () => module.getInfo(),
    verifyManifest: (payload, signature, publicKey) => module.verifyManifest(payload, signature, publicKey),
    downloadBundle: (request) => module.downloadBundle(request),
    cancelDownload: () => module.cancelDownload(),
    markLaunchSuccessful: () => module.markLaunchSuccessful(),
    restart: () => module.restart(),
    onProgress: (listener) => DeviceEventEmitter.addListener(PROGRESS_EVENT, listener),
  };
};
