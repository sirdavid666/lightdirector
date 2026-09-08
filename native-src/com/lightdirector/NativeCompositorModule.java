package com.lightdirector;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;
import com.pedro.encoder.input.video.CameraHelper;
import com.pedro.rtmp.utils.ConnectCheckerRtmp;
import com.pedro.rtplibrary.rtmp.RtmpCamera2;
import com.pedro.rtplibrary.view.GlInterface;
import org.json.JSONException;
import org.json.JSONObject;

public class NativeCompositorModule extends ReactContextBaseJavaModule implements LifecycleEventListener, ConnectCheckerRtmp {
  public static final String NAME = "NativeCompositor";
  public static String currentGrade = "Natural";
  public static double micGain = 1.0;
  public static double mediaGain = 1.0;

  private final ReactApplicationContext reactContext;
  private RtmpCamera2 rtmpCamera2;
  private NativeOverlayRenderer overlayRenderer;
  private BaseFilterRender gradeFilter;
  private String currentUrl = "";

  public NativeCompositorModule(@NonNull ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    reactContext.addLifecycleEventListener(this);
  }

  @NonNull @Override public String getName() { return NAME; }

  @ReactMethod
  public void startStream(String url, Promise promise) {
    startStreamWithConfig(url, 1280, 720, 30, 2500, promise);
  }

  @ReactMethod
  public void startStreamWithConfig(String url, double w, double h, double fps, double kbps, Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) { promise.reject("E_ACTIVITY", "Activity is null"); return; }
    try {
      if (rtmpCamera2 == null) {
        rtmpCamera2 = new RtmpCamera2((Context) activity, true, this);
      }
      if (!rtmpCamera2.prepareVideo((int) w, (int) h, (int) fps, (int) (kbps * 1024), 0)) {
        promise.reject("E_PREPARE_VIDEO", "Video preparation failed"); return;
      }
      if (!rtmpCamera2.prepareAudio(128 * 1024, 44100, true)) {
        promise.reject("E_PREPARE_AUDIO", "Audio preparation failed"); return;
      }
      GlInterface gl = rtmpCamera2.getGlInterface();
      if (overlayRenderer == null) overlayRenderer = new NativeOverlayRenderer(gl);
      applyGrade(gl);
      rtmpCamera2.startPreview(CameraHelper.Facing.BACK);
      currentUrl = url;
      rtmpCamera2.startStream(url);
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("E_START_STREAM", e.getMessage());
    }
  }

  @ReactMethod
  public void stopStream(Promise promise) {
    if (rtmpCamera2 == null || !rtmpCamera2.isStreaming()) {
      promise.reject("E_NOT_STREAMING", "No active stream"); return;
    }
    try {
      rtmpCamera2.stopStream();
      if (overlayRenderer != null) { overlayRenderer.release(); overlayRenderer = null; }
      gradeFilter = null;
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("E_STOP", e.getMessage());
    }
  }

  @ReactMethod
  public void setOverlayState(String json, Promise promise) {
    if (overlayRenderer == null) { promise.reject("E_RENDERER", "Renderer not initialized"); return; }
    try {
      overlayRenderer.updateOverlayState(new JSONObject(json));
      promise.resolve(null);
    } catch (JSONException e) {
      promise.reject("E_JSON", "Invalid JSON");
    }
  }

  @ReactMethod
  public void setGrade(String preset, Promise promise) {
    currentGrade = (preset == null) ? "Natural" : preset;
    try {
      if (rtmpCamera2 != null) applyGrade(rtmpCamera2.getGlInterface());
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("E_GRADE", e.getMessage());
    }
  }

  @ReactMethod
  public void setAudioBalance(double mic, double media, Promise promise) {
    micGain = mic; mediaGain = media; promise.resolve(null);
  }

  @ReactMethod
  public void startFileVideoStream(String filePath, String url, Promise promise) {
    promise.reject("E_UNSUPPORTED", "Video-file streaming needs a library upgrade (Phase 2). Use image media instead.");
  }

  @ReactMethod
  public void stopFileStream(Promise promise) {
    promise.reject("E_UNSUPPORTED", "Not supported");
  }

  @ReactMethod
  public void showImageMedia(String filePath, Promise promise) {
    if (overlayRenderer == null) { promise.reject("E_RENDERER", "Renderer not initialized"); return; }
    Bitmap bmp = BitmapFactory.decodeFile(filePath);
    if (bmp == null) { promise.reject("E_FILE_NOT_FOUND", "Cannot decode image: " + filePath); return; }
    overlayRenderer.showMediaBitmap(bmp);
    promise.resolve(null);
  }

  @ReactMethod
  public void clearImageMedia(Promise promise) {
    if (overlayRenderer != null) overlayRenderer.clearMediaBitmap();
    promise.resolve(null);
  }

  private void applyGrade(GlInterface gl) {
    if (gradeFilter != null) { try { gl.removeFilter(gradeFilter); } catch (Throwable ignored) {} gradeFilter = null; }
    BaseFilterRender f = GradeFilters.forPreset(currentGrade);
    if (f != null) { gl.addFilter(f); gradeFilter = f; }
  }

  private void sendEvent(String name, WritableMap data) {
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit(name, data);
  }

  @Override public void onConnectionSuccessRtmp() {
    WritableMap m = Arguments.createMap(); m.putString("url", currentUrl); sendEvent("onStreamConnected", m);
  }
  @Override public void onConnectionFailedRtmp(String reason) {
    WritableMap m = Arguments.createMap(); m.putString("error", reason); sendEvent("onStreamError", m);
    safeStop();
  }
  @Override public void onNewBitrateRtmp(long bitrate) {}
  @Override public void onDisconnectRtmp() {
    sendEvent("onStreamDisconnected", Arguments.createMap()); safeStop();
  }
  @Override public void onAuthErrorRtmp() {
    WritableMap m = Arguments.createMap(); m.putString("error", "Authentication error"); sendEvent("onStreamError", m);
    safeStop();
  }
  @Override public void onAuthSuccessRtmp() {}

  private void safeStop() {
    try {
      if (rtmpCamera2 != null && rtmpCamera2.isStreaming()) rtmpCamera2.stopStream();
      if (overlayRenderer != null) { overlayRenderer.release(); overlayRenderer = null; }
      gradeFilter = null;
    } catch (Throwable ignored) {}
  }

  @Override public void onHostResume() {}
  @Override public void onHostPause() {}
  @Override public void onHostDestroy() { safeStop(); }
}
