herepackage com.lightdirector;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.pedro.encoder.input.audio.AudioCodec;
import com.pedro.encoder.input.video.RootEncoder;
import com.pedro.rtmp.ConnectCheckerRtmp;
import com.pedro.rtmp.RtmpCamera2;
import org.json.JSONException;
import org.json.JSONObject;

public class NativeCompositorModule extends ReactContextBaseJavaModule implements ConnectCheckerRtmp, LifecycleEventListener {
private final ReactApplicationContext reactContext;
private RtmpCamera2 rtmpCamera2;
private NativeOverlayRenderer overlayRenderer;
private final Handler mainHandler = new Handler(Looper.getMainLooper());
private String currentUrl;

public NativeCompositorModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
    reactContext.addLifecycleEventListener(this);
}

@Override
public String getName() {
    return "NativeCompositor";
}

@ReactMethod
public void startStream(final String url, final Promise promise) {
    mainHandler.post(() -> {
        if (rtmpCamera2 != null && rtmpCamera2.isStreaming()) {
            promise.reject("E_ALREADY_STREAMING", "Already streaming");
            return;
        }
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("E_ACTIVITY_NULL", "Current activity is null");
            return;
        }
        rtmpCamera2 = new RtmpCamera2(activity, NativeCompositorModule.this);
        boolean videoPrepared = rtmpCamera2.prepareVideo(1280, 720, 30, 2500 * 1024, false);
        if (!videoPrepared) {
            rtmpCamera2 = null;
            promise.reject("E_PREPARE_FAIL", "Video preparation failed");
            return;
        }
        boolean audioPrepared = rtmpCamera2.prepareAudio(AudioCodec.AAC, 128 * 1024, 44100, true);
        if (!audioPrepared) {
            rtmpCamera2 = null;
            promise.reject("E_AUDIO_PREPARE_FAIL", "Audio preparation failed");
            return;
        }
        RootEncoder encoder = rtmpCamera2.getVideoEncoder();
        overlayRenderer = new NativeOverlayRenderer(encoder);
        rtmpCamera2.startPreview();
        currentUrl = url;
        rtmpCamera2.startStream(url);
        promise.resolve(null);
    });
}

@ReactMethod
public void stopStream(final Promise promise) {
    mainHandler.post(() -> {
        if (rtmpCamera2 != null && rtmpCamera2.isStreaming()) {
            rtmpCamera2.stopStream();
            rtmpCamera2.stopPreview();
            rtmpCamera2 = null;
            if (overlayRenderer != null) {
                overlayRenderer.release();
                overlayRenderer = null;
            }
            promise.resolve(null);
        } else {
            promise.reject("E_NOT_STREAMING", "Not currently streaming");
        }
    });
}

@ReactMethod
public void setOverlayState(final String json, final Promise promise) {
    mainHandler.post(() -> {
        if (overlayRenderer == null) {
            promise.reject("E_NO_RENDERER", "Overlay renderer not initialized");
            return;
        }
        try {
            JSONObject obj = new JSONObject(json);
            overlayRenderer.updateOverlayState(obj);
            promise.resolve(null);
        } catch (JSONException e) {
            promise.reject("E_JSON", e.getMessage());
        }
    });
}

private void emitEvent(String event, WritableMap data) {
    reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(event, data);
}

@Override
public void onConnectionSuccessRtmp() {
    WritableMap map = Arguments.createMap();
    map.putString("url", currentUrl != null ? currentUrl : "");
    emitEvent("onStreamConnected", map);
}

@Override
public void onConnectionFailedRtmp(String reason) {
    WritableMap map = Arguments.createMap();
    map.putString("error", reason);
    emitEvent("onStreamError", map);
    cleanup();
}

@Override
public void onNewBitrateRtmp(long bitrate) {
    // No-op
}

@Override
public void onDisconnectRtmp() {
    emitEvent("onStreamDisconnected", Arguments.createMap());
    cleanup();
}

@Override
public void onAuthErrorRtmp() {
    WritableMap map = Arguments.createMap();
    map.putString("error", "Authentication error");
    emitEvent("onStreamError", map);
}

@Override
public void onAuthSuccessRtmp() {
    // No-op
}

private void cleanup() {
    mainHandler.post(() -> {
        if (rtmpCamera2 != null) {
            if (rtmpCamera2.isStreaming()) {
                rtmpCamera2.stopStream();
            }
            rtmpCamera2.stopPreview();
            rtmpCamera2 = null;
        }
        if (overlayRenderer != null) {
            overlayRenderer.release();
            overlayRenderer = null;
        }
        currentUrl = null;
    });
}

@Override
public void onHostResume() {
    // No-op
}

@Override
public void onHostPause() {
    // No-op
}

@Override
public void onHostDestroy() {
    cleanup();
}
        }
