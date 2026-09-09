package com.lightdirector;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Point;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import com.pedro.rtplibrary.view.GlInterface;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Locale;

public class NativeOverlayRenderer {
  private final GlInterface gl;
  private final OverlayGlFilter filter;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private JSONObject state;
  private Bitmap mediaBitmap = null;
  private Bitmap recyclePending = null;
  private int width = 1280;
  private int height = 720;
  private boolean tickerAnimating = false;
  private final Runnable tickerAnimator = new Runnable() {
    @Override
    public void run() {
      if (tickerAnimating && state != null) {
        render();
        mainHandler.postDelayed(this, 33); // ~30fps
      }
    }
  };

  public NativeOverlayRenderer(GlInterface gl) {
    this.gl = gl;
    try {
      Point size = gl.getEncoderSize();
      if (size != null && size.x > 0 && size.y > 0) {
        this.width = size.x;
        this.height = size.y;
      }
    } catch (Throwable ignored) {}
    this.filter = new OverlayGlFilter();
    gl.addFilter(this.filter);
  }

  public void updateOverlayState(JSONObject state) {
    this.state = state;
    boolean hasTicker = false;
    try {
      hasTicker = state != null && state.has("ticker") && !state.isNull("ticker");
    } catch (JSONException ignored) {}
    
    if (hasTicker && !tickerAnimating) {
      tickerAnimating = true;
      mainHandler.post(tickerAnimator);
    } else if (!hasTicker && tickerAnimating) {
      tickerAnimating = false;
    }
    
    render();
  }

  public void showMediaBitmap(Bitmap bitmap) {
    synchronized (this) {
      recyclePending = mediaBitmap;
      mediaBitmap = bitmap;
    }
    render();
  }

  public void clearMediaBitmap() {
    synchronized (this) {
      recyclePending = mediaBitmap;
      mediaBitmap = null;
    }
    render();
  }

  private void render() {
    mainHandler.post(() -> {
      Bitmap media;
      Bitmap old;
      synchronized (this) {
        media = mediaBitmap;
        old = recyclePending;
        recyclePending = null;
      }
      Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
      Canvas canvas = new Canvas(bmp);
      if (media != null && !media.isRecycled()) {
        RectF dst = new RectF(0, 0, width, height);
        canvas.drawBitmap(media, null, dst, null);
      }
      if (old != null && old != media && !old.isRecycled()) {
        old.recycle();
      }
      drawOverlay(canvas, state);
      filter.updateBitmap(bmp);
    });
  }

  private void drawOverlay(Canvas canvas, JSONObject s) {
    if (s == null) return;
    try {
      String layout = s.optString("layout", "CameraOnly");
      if ("Blank".equals(layout)) { canvas.drawColor(Color.BLACK); return; }
      if ("CameraOnly".equals(layout)) return;

      if (s.has("scripture") && !s.isNull("scripture")) {
        JSONObject o = s.getJSONObject("scripture");
        String ref = o.optString("reference", "");
        String txt = o.optString("text", "");
        float cardW = width * 0.8f;
        float cardH = height * 0.45f;
        float left = (width - cardW) / 2f;
        float top = (height - cardH) / 2f;
        Paint bg = new Paint();
        bg.setColor(Color.argb(190, 0, 0, 0));
        canvas.drawRoundRect(new RectF(left, top, left + cardW, top + cardH), 20, 20, bg);
        Paint refPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        refPaint.setColor(Color.YELLOW);
        refPaint.setTextSize(cardH * 0.12f);
        refPaint.setFakeBoldText(true);
        canvas.drawText(ref, left + 24, top + refPaint.getTextSize() + 24, refPaint);
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setColor(Color.WHITE);
        tp.setTextSize(cardH * 0.10f);
        StaticLayout sl = new StaticLayout(txt, tp, (int) (cardW - 48), Layout.Alignment.ALIGN_CENTER, 1.1f, 0, false);
        canvas.save();
        canvas.translate(left + 24, top + refPaint.getTextSize() + 60);
        sl.draw(canvas);
        canvas.restore();
      }

      if (s.has("lyrics") && !s.isNull("lyrics")) {
        JSONObject o = s.getJSONObject("lyrics");
        String title = o.optString("title", "");
        String line = o.optString("line", "");
        int idx = o.optInt("index", 0);
        int total = o.optInt("total", 0);
        float barH = height * 0.16f;
        float top = height - barH;
        Paint bg = new Paint();
        bg.setColor(Color.argb(200, 0, 0, 0));
        canvas.drawRect(0, top, width, height, bg);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setColor(Color.rgb(250, 204, 21));
        tp.setTextSize(barH * 0.22f);
        canvas.drawText(title, 24, top + tp.getTextSize() + 12, tp);
        Paint lp = new Paint(Paint.ANTI_ALIAS_FLAG);
        lp.setColor(Color.WHITE);
        lp.setTextSize(barH * 0.5f);
        lp.setFakeBoldText(true);
        float lw = lp.measureText(line);
        canvas.drawText(line, Math.max(24, (width - lw) / 2f), top + barH * 0.66f, lp);
        Paint cp = new Paint(Paint.ANTI_ALIAS_FLAG);
        cp.setColor(Color.rgb(250, 204, 21));
        cp.setTextSize(barH * 0.22f);
        String cnt = (idx + 1) + "/" + total;
        canvas.drawText(cnt, width - cp.measureText(cnt) - 24, top + cp.getTextSize() + 12, cp);
      }

      if (s.has("ticker") && !s.isNull("ticker")) {
        JSONObject o = s.getJSONObject("ticker");
        String txt = o.optString("text", "");
        int speed = o.optInt("scrollSpeed", 50);
        float stripH = height * 0.06f;
        float stripTop = height - stripH;
        Paint sbg = new Paint();
        sbg.setColor(Color.BLACK);
        canvas.drawRect(0, stripTop, width, height, sbg);
        Paint np = new Paint(Paint.ANTI_ALIAS_FLAG);
        np.setColor(Color.BLACK);
        np.setTextSize(stripH * 0.6f);
        np.setFakeBoldText(true);
        float newsW = np.measureText("NEWS") + 32;
        Paint nb = new Paint();
        nb.setColor(Color.rgb(250, 204, 21));
        canvas.drawRect(0, stripTop, newsW, height, nb);
        canvas.drawText("NEWS", 16, stripTop + stripH * 0.72f, np);
        Paint ttp = new Paint(Paint.ANTI_ALIAS_FLAG);
        ttp.setColor(Color.WHITE);
        ttp.setTextSize(stripH * 0.6f);
        float tw = ttp.measureText(txt);
        long now = System.currentTimeMillis();
        float off = ((now / 1000f) * speed) % (tw + width);
        float x = width - off;
        canvas.drawText(txt, x, stripTop + stripH * 0.72f, ttp);
        if (x + tw < width) canvas.drawText(txt, x + tw + 120, stripTop + stripH * 0.72f, ttp);
      }

      if (s.has("lowerThird") && !s.isNull("lowerThird")) {
        JSONObject o = s.getJSONObject("lowerThird");
        String name = o.optString("name", "");
        String role = o.optString("role", "");
        float boxW = width * 0.42f;
        float boxH = height * 0.13f;
        float bottom = height * 0.10f;
        float top = height - bottom - boxH;
        Paint bg = new Paint();
        bg.setColor(Color.argb(205, 0, 0, 0));
        canvas.drawRect(24, top, 24 + boxW, top + boxH, bg);
        Paint edge = new Paint();
        edge.setColor(Color.rgb(255, 106, 0));
        canvas.drawRect(24, top, 34, top + boxH, edge);
        Paint nmp = new Paint(Paint.ANTI_ALIAS_FLAG);
        nmp.setColor(Color.WHITE);
        nmp.setTextSize(boxH * 0.42f);
        nmp.setFakeBoldText(true);
        canvas.drawText(name, 50, top + nmp.getTextSize() + 12, nmp);
        Paint rp = new Paint(Paint.ANTI_ALIAS_FLAG);
        rp.setColor(Color.rgb(250, 204, 21));
        rp.setTextSize(boxH * 0.30f);
        canvas.drawText(role, 50, top + nmp.getTextSize() + rp.getTextSize() + 28, rp);
      }

      if (s.has("countdown") && !s.isNull("countdown")) {
        int sec = s.getJSONObject("countdown").optInt("secondsLeft", 0);
        String txt = String.format(Locale.US, "%02d:%02d", sec / 60, sec % 60);
        float boxW = width * 0.18f;
        float boxH = height * 0.09f;
        float left = (width - boxW) / 2f;
        float top = height * 0.04f;
        Paint bg = new Paint();
        bg.setColor(Color.argb(190, 0, 0, 0));
        canvas.drawRoundRect(new RectF(left, top, left + boxW, top + boxH), 12, 12, bg);
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setColor(sec <= 10 ? Color.RED : Color.rgb(34, 197, 94));
        tp.setTextSize(boxH * 0.62f);
        tp.setFakeBoldText(true);
        canvas.drawText(txt, left + (boxW - tp.measureText(txt)) / 2f, top + boxH * 0.72f, tp);
      }
    } catch (JSONException ignored) {}
  }

  public void release() {
    tickerAnimating = false;
    mainHandler.removeCallbacks(tickerAnimator);
    try { gl.removeFilter(filter); } catch (Throwable ignored) {}
    filter.release();
  }
}
