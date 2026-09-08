package com.lightdirector;

import android.content.Context;
import android.graphics.Bitmap;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.opengl.Matrix;
import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;
import com.pedro.encoder.utils.gl.GlUtil;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public class OverlayGlFilter extends BaseFilterRender {
  private final float[] squareVertexData = {
      -1f, -1f, 0f, 0f, 0f,
      1f, -1f, 0f, 1f, 0f,
      -1f, 1f, 0f, 0f, 1f,
      1f, 1f, 0f, 1f, 1f };
  private int program = -1;
  private int aPositionHandle = -1;
  private int aTextureHandle = -1;
  private int uMVPMatrixHandle = -1;
  private int uSTMatrixHandle = -1;
  private int uSamplerHandle = -1;
  private int uOverlayHandle = -1;
  private int overlayTexId = -1;
  private Bitmap pendingBitmap = null;
  private final Object lock = new Object();

  public OverlayGlFilter() {
    squareVertex = ByteBuffer.allocateDirect(squareVertexData.length * FLOAT_SIZE_BYTES)
        .order(ByteOrder.nativeOrder()).asFloatBuffer();
    squareVertex.put(squareVertexData).position(0);
    Matrix.setIdentityM(MVPMatrix, 0);
    Matrix.setIdentityM(STMatrix, 0);
  }

  public void updateBitmap(Bitmap bitmap) {
    synchronized (lock) { pendingBitmap = bitmap; }
  }

  @Override
  protected void initGlFilter(Context context) {
    String vertex = "attribute vec4 aPosition;\n"
        + "attribute vec4 aTextureCoord;\n"
        + "uniform mat4 uMVPMatrix;\n"
        + "uniform mat4 uSTMatrix;\n"
        + "varying vec2 vTextureCoord;\n"
        + "void main(){\n"
        + "  gl_Position = uMVPMatrix * aPosition;\n"
        + "  vTextureCoord = (uSTMatrix * aTextureCoord).xy;\n"
        + "}\n";
    String fragment = "precision mediump float;\n"
        + "uniform sampler2D uSampler;\n"
        + "uniform sampler2D uOverlay;\n"
        + "varying vec2 vTextureCoord;\n"
        + "void main(){\n"
        + "  vec4 cam = texture2D(uSampler, vTextureCoord);\n"
        + "  vec4 ov = texture2D(uOverlay, vTextureCoord);\n"
        + "  gl_FragColor = mix(cam, ov, ov.a);\n"
        + "}\n";
    program = GlUtil.createProgram(vertex, fragment);
    aPositionHandle = GLES20.glGetAttribLocation(program, "aPosition");
    aTextureHandle = GLES20.glGetAttribLocation(program, "aTextureCoord");
    uMVPMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix");
    uSTMatrixHandle = GLES20.glGetUniformLocation(program, "uSTMatrix");
    uSamplerHandle = GLES20.glGetUniformLocation(program, "uSampler");
    uOverlayHandle = GLES20.glGetUniformLocation(program, "uOverlay");
    int[] tex = new int[1];
    GLES20.glGenTextures(1, tex, 0);
    overlayTexId = tex[0];
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTexId);
    GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
    GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
    GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
    GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
    Bitmap clear = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
    clear.eraseColor(0);
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, clear, 0);
    clear.recycle();
  }

  @Override
  protected void drawFilter() {
    Bitmap bmp;
    synchronized (lock) { bmp = pendingBitmap; pendingBitmap = null; }
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTexId);
    if (bmp != null) {
      GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0);
    }
    GLES20.glUseProgram(program);
    squareVertex.position(SQUARE_VERTEX_DATA_POS_OFFSET);
    GLES20.glVertexAttribPointer(aPositionHandle, 3, GLES20.GL_FLOAT, false,
        SQUARE_VERTEX_DATA_STRIDE_BYTES, squareVertex);
    GLES20.glEnableVertexAttribArray(aPositionHandle);
    squareVertex.position(SQUARE_VERTEX_DATA_UV_OFFSET);
    GLES20.glVertexAttribPointer(aTextureHandle, 2, GLES20.GL_FLOAT, false,
        SQUARE_VERTEX_DATA_STRIDE_BYTES, squareVertex);
    GLES20.glEnableVertexAttribArray(aTextureHandle);
    GLES20.glUniformMatrix4fv(uMVPMatrixHandle, 1, false, MVPMatrix, 0);
    GLES20.glUniformMatrix4fv(uSTMatrixHandle, 1, false, STMatrix, 0);
    GLES20.glUniform1i(uSamplerHandle, 4);
    GLES20.glActiveTexture(GLES20.GL_TEXTURE4);
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, previousTexId);
    GLES20.glUniform1i(uOverlayHandle, 5);
    GLES20.glActiveTexture(GLES20.GL_TEXTURE5);
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTexId);
  }

  @Override
  public void release() {
    if (program != -1) GLES20.glDeleteProgram(program);
    if (overlayTexId != -1) {
      int[] t = { overlayTexId };
      GLES20.glDeleteTextures(1, t, 0);
      overlayTexId = -1;
    }
  }
}
