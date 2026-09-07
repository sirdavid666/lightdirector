herepackage com.lightdirector;

import android.graphics.Bitmap;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;

public class OverlayGlFilter extends BaseFilterRender {
private int overlayTextureId = -1;
private Bitmap overlayBitmap;
private boolean bitmapPending = false;

public OverlayGlFilter(int width, int height) {
    super(width, height);
}

public void updateBitmap(Bitmap bitmap) {
    if (bitmap == null) return;
    if (overlayBitmap != null && !overlayBitmap.isRecycled()) overlayBitmap.recycle();
    overlayBitmap = bitmap;
    bitmapPending = true;
}

@Override
protected void drawFilter() {
    if (overlayTextureId == -1) {
        int[] tex = new int[1];
        GLES20.glGenTextures(1, tex, 0);
        overlayTextureId = tex[0];
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTextureId);
        GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
    }
    if (bitmapPending && overlayBitmap != null) {
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTextureId);
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, overlayBitmap, 0);
        bitmapPending = false;
    }
    GLES20.glEnable(GLES20.GL_BLEND);
    GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
    drawTexture(overlayTextureId);
    GLES20.glDisable(GLES20.GL_BLEND);
}

@Override
public void release() {
    if (overlayTextureId != -1) {
        int[] tex = {overlayTextureId};
        GLES20.glDeleteTextures(1, tex, 0);
        overlayTextureId = -1;
    }
    if (overlayBitmap != null && !overlayBitmap.isRecycled()) {
        overlayBitmap.recycle();
        overlayBitmap = null;
    }
    super.release();
}
}
