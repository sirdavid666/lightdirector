herepackage com.lightdirector;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import org.json.JSONObject;
import org.json.JSONException;
import com.pedro.encoder.input.video.RootEncoder;
import java.util.Locale;

public class NativeOverlayRenderer {
private final RootEncoder encoder;
private final OverlayGlFilter filter;
private final Handler mainHandler = new Handler(Looper.getMainLooper());
private JSONObject state;
private final int width;
private final int height;

public NativeOverlayRenderer(RootEncoder encoder) {
    this.encoder = encoder;
    this.width = encoder.getVideoWidth();
    this.height = encoder.getVideoHeight();
    this.filter = new OverlayGlFilter(width, height);
    this.encoder.addVideoEffect(this.filter);
}

public void updateOverlayState(JSONObject state) {
    this.state = state;
    mainHandler.post(() -> {
        Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        drawOverlay(canvas, this.state);
        filter.updateBitmap(bmp);
    });
}

private void drawOverlay(Canvas canvas, JSONObject s) {
    try {
        String layout = s.optString("layout", "Blank");
        if ("Blank".equals(layout)) {
            canvas.drawColor(Color.BLACK);
            return;
        }
        if ("CameraOnly".equals(layout)) {
            canvas.drawColor(Color.TRANSPARENT);
            return;
        }
        canvas.drawColor(Color.TRANSPARENT);
        if (s.has("scripture") && !"null".equals(s.optString("scripture"))) {
            JSONObject o = s.getJSONObject("scripture");
            String ref = o.optString("reference", "");
            String txt = o.optString("text", "");
            float cardW = width * 0.8f;
            float cardH = height * 0.4f;
            float left = (width - cardW) / 2f;
            float top = (height - cardH) / 2f;
            Paint bg = new Paint();
            bg.setColor(Color.argb(180, 0, 0, 0));
            canvas.drawRoundRect(new RectF(left, top, left + cardW, top + cardH), 20, 20, bg);
            Paint refPaint = new Paint();
            refPaint.setColor(Color.YELLOW);
            refPaint.setTextSize(cardH * 0.1f);
            refPaint.setFakeBoldText(true);
            canvas.drawText(ref, left + 20, top + refPaint.getTextSize() + 20, refPaint);
            TextPaint txtPaint = new TextPaint();
            txtPaint.setColor(Color.WHITE);
            txtPaint.setTextSize(cardH * 0.08f);
            int txtWidth = (int) (cardW - 40);
            StaticLayout layout = new StaticLayout(txt, txtPaint, txtWidth, Layout.Alignment.ALIGN_NORMAL, 1.0f, 0, false);
            canvas.save();
            canvas.translate(left + 20, top + refPaint.getTextSize() + 40);
            layout.draw(canvas);
            canvas.restore();
        }
        if (s.has("lyrics") && !"null".equals(s.optString("lyrics"))) {
            JSONObject o = s.getJSONObject("lyrics");
            String title = o.optString("title", "");
            String line = o.optString("line", "");
            int idx = o.optInt("index", 0);
            int total = o.optInt("total", 0);
            float barH = height * 0.2f;
            float top = height - barH;
            Paint bg = new Paint();
            bg.setColor(Color.argb(180, 0, 0, 0));
            canvas.drawRect(0, top, width, height, bg);
            Paint titlePaint = new Paint();
            titlePaint.setColor(Color.YELLOW);
            titlePaint.setTextSize(barH * 0.2f);
            canvas.drawText(title, 20, top + titlePaint.getTextSize() + 10, titlePaint);
            Paint linePaint = new Paint();
            linePaint.setColor(Color.WHITE);
            linePaint.setTextSize(barH * 0.5f);
            linePaint.setFakeBoldText(true);
            float lineWidth = linePaint.measureText(line);
            canvas.drawText(line, (width - lineWidth) / 2f, top + barH * 0.65f, linePaint);
            Paint cntPaint = new Paint();
            cntPaint.setColor(Color.YELLOW);
            cntPaint.setTextSize(barH * 0.2f);
            String cnt = idx + "/" + total;
            float cntW = cntPaint.measureText(cnt);
            canvas.drawText(cnt, width - cntW - 20, top + cntPaint.getTextSize() + 10, cntPaint);
        }
        if (s.has("ticker") && !"null".equals(s.optString("ticker"))) {
            JSONObject o = s.getJSONObject("ticker");
            String txt = o.optString("text", "");
            int speed = o.optInt("scrollSpeed", 50);
            float stripH = height * 0.07f;
            Paint stripBg = new Paint();
            stripBg.setColor(Color.BLACK);
            canvas.drawRect(0, 0, width, stripH, stripBg);
            Paint newsPaint = new Paint();
            newsPaint.setColor(Color.YELLOW);
            newsPaint.setTextSize(stripH * 0.6f);
            newsPaint.setFakeBoldText(true);
            float newsW = newsPaint.measureText("NEWS");
            canvas.drawRect(0, 0, newsW + 40, stripH, new Paint(){{
                setColor(Color.YELLOW);
            }});
            canvas.drawText("NEWS", 20, stripH * 0.75f, newsPaint);
            Paint txtPaint = new Paint();
            txtPaint.setColor(Color.WHITE);
            txtPaint.setTextSize(stripH * 0.6f);
            float txtW = txtPaint.measureText(txt);
            long now = System.currentTimeMillis();
            float offset = ((now / 1000f) * speed) % (txtW + width);
            float x = width - offset;
            canvas.drawText(txt, x, stripH * 0.75f, txtPaint);
            if (x < txtW) {
                canvas.drawText(txt, x - txtW - width, stripH * 0.75f, txtPaint);
            }
        }
        if (s.has("lowerThird") && !"null".equals(s.optString("lowerThird"))) {
            JSONObject o = s.getJSONObject("lowerThird");
            String name = o.optString("name", "");
            String role = o.optString("role", "");
            float boxW = width * 0.4f;
            float boxH = height * 0.15f;
            Paint boxBg = new Paint();
            boxBg.setColor(Color.argb(200, 0, 0, 0));
            canvas.drawRect(20, 20, 20 + boxW, 20 + boxH, boxBg);
            Paint edge = new Paint();
            edge.setColor(Color.rgb(255, 140, 0));
            canvas.drawRect(20, 20, 30, 20 + boxH, edge);
            Paint namePaint = new Paint();
            namePaint.setColor(Color.WHITE);
            namePaint.setTextSize(boxH * 0.4f);
            namePaint.setFakeBoldText(true);
            canvas.drawText(name, 40, 20 + namePaint.getTextSize() + 10, namePaint);
            Paint rolePaint = new Paint();
            rolePaint.setColor(Color.YELLOW);
            rolePaint.setTextSize(boxH * 0.3f);
            canvas.drawText(role, 40, 20 + namePaint.getTextSize() + rolePaint.getTextSize() + 30, rolePaint);
        }
        if (s.has("countdown") && !"null".equals(s.optString("countdown"))) {
            JSONObject o = s.getJSONObject("countdown");
            int sec = o.optInt("secondsLeft", 0);
            int mins = sec / 60;
            int secs = sec % 60;
            String txt = String.format(Locale.US, "%02d:%02d", mins, secs);
            float boxW = width * 0.2f;
            float boxH = height * 0.1f;
            float left = (width - boxW) / 2f;
            float top = height * 0.05f;
            Paint bg = new Paint();
            bg.setColor(Color.argb(180, 0, 0, 0));
            canvas.drawRoundRect(new RectF(left, top, left + boxW, top + boxH), 10, 10, bg);
            Paint txtPaint = new Paint();
            txtPaint.setColor(sec <= 10 ? Color.RED : Color.GREEN);
            txtPaint.setTextSize(boxH * 0.6f);
            txtPaint.setFakeBoldText(true);
            float txtW = txtPaint.measureText(txt);
            canvas.drawText(txt, left + (boxW - txtW) / 2f, top + boxH * 0.7f, txtPaint);
        }
    } catch (JSONException e) {}
}

public void release() {
    filter.release();
}
                                           }
