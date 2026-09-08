package com.lightdirector;

import android.content.Context;
import android.opengl.GLES20;
import android.opengl.Matrix;
import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;
import com.pedro.encoder.input.gl.render.filters.BeautyFilterRender;
import com.pedro.encoder.utils.gl.GlUtil;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

public final class GradeFilters {
  private GradeFilters() {}

  private static final String VERTEX = "attribute vec4 aPosition;\n"
      + "attribute vec4 aTextureCoord;\n"
      + "uniform mat4 uMVPMatrix;\n"
      + "uniform mat4 uSTMatrix;\n"
      + "varying vec2 vTextureCoord;\n"
      + "void main(){\n"
      + "  gl_Position = uMVPMatrix * aPosition;\n"
      + "  vTextureCoord = (uSTMatrix * aTextureCoord).xy;\n"
      + "}\n";

  private static final String HEAD = "precision mediump float;\n"
      + "uniform sampler2D uSampler;\n"
      + "varying vec2 vTextureCoord;\n"
      + "void main(){\n"
      + "  vec4 c = texture2D(uSampler, vTextureCoord);\n";

  private static final String WARM = HEAD
      + "  c.r = min(c.r * 1.15, 1.0);\n  c.b = c.b * 0.88;\n"
      + "  float g = dot(c.rgb, vec3(0.333));\n  c.rgb = mix(vec3(g), c.rgb, 1.1);\n"
      + "  gl_FragColor = c;\n}\n";
  private static final String COOL = HEAD
      + "  c.b = min(c.b * 1.15, 1.0);\n"
      + "  float g = dot(c.rgb, vec3(0.333));\n  c.rgb = mix(vec3(g), c.rgb, 0.85);\n"
      + "  gl_FragColor = c;\n}\n";
  private static final String CINE = HEAD
      + "  c.rgb = (c.rgb - 0.5) * 1.15 + 0.5;\n"
      + "  float g = dot(c.rgb, vec3(0.333));\n  c.rgb = mix(vec3(g), c.rgb, 0.9);\n"
      + "  vec2 p = vTextureCoord - 0.5;\n  c.rgb *= smoothstep(0.85, 0.45, length(p));\n"
      + "  gl_FragColor = c;\n}\n";
  private static final String VIVID = HEAD
      + "  float g = dot(c.rgb, vec3(0.333));\n  c.rgb = mix(vec3(g), c.rgb, 1.6);\n"
      + "  c.rgb = (c.rgb - 0.5) * 1.2 + 0.5;\n"
      + "  gl_FragColor = c;\n}\n";
  private static final String LIFT = HEAD
      + "  c.rgb = pow(c.rgb, vec3(0.85));\n"
      + "  c.rgb = mix(c.rgb, vec3(0.5), 0.08);\n"
      + "  gl_FragColor = c;\n}\n";
  private static final String VIGN = HEAD
      + "  vec2 p = vTextureCoord - 0.5;\n  c.rgb *= smoothstep(0.8, 0.45, length(p));\n"
      + "  gl_FragColor = c;\n}\n";
  private static final String NOIR = HEAD
      + "  float g = dot(c.rgb, vec3(0.333));\n  g = (g - 0.5) * 1.3 + 0.5;\n"
      + "  gl_FragColor = vec4(g, g, g, c.a);\n}\n";
  private static final String RETRO = HEAD
      + "  vec3 s = vec3(dot(c.rgb, vec3(0.393, 0.769, 0.189)), dot(c.rgb, vec3(0.349, 0.686, 0.168)), dot(c.rgb, vec3(0.272, 0.534, 0.131)));\n"
      + "  float n = fract(sin(dot(vTextureCoord, vec2(12.9898, 78.233))) * 43758.5453) * 0.08 - 0.04;\n"
      + "  gl_FragColor = vec4(s + n, c.a);\n}\n";

  public static BaseFilterRender forPreset(String preset) {
    if (preset == null) return null;
    switch (preset) {
      case "WarmChurch": return new ShaderFilter(WARM);
      case "Cool": return new ShaderFilter(COOL);
      case "Cinematic": return new ShaderFilter(CINE);
      case "Vivid": return new ShaderFilter(VIVID);
      case "FlatLogLift": return new ShaderFilter(LIFT);
      case "Vignette": return new ShaderFilter(VIGN);
      case "Noir": return new ShaderFilter(NOIR);
      case "Retro": return new ShaderFilter(RETRO);
      case "Beauty": return new BeautyFilterRender();
      default: return null;
    }
  }

  public static class ShaderFilter extends BaseFilterRender {
    private final float[] squareVertexData = {
        -1f, -1f, 0f, 0f, 0f,
        1f, -1f, 0f, 1f, 0f,
        -1f, 1f, 0f, 0f, 1f,
        1f, 1f, 0f, 1f, 1f };
    private final String fragment;
    private int program = -1;
    private int aPositionHandle = -1;
    private int aTextureHandle = -1;
    private int uMVPMatrixHandle = -1;
    private int uSTMatrixHandle = -1;
    private int uSamplerHandle = -1;

    public ShaderFilter(String fragment) {
      this.fragment = fragment;
      squareVertex = ByteBuffer.allocateDirect(squareVertexData.length * FLOAT_SIZE_BYTES)
          .order(ByteOrder.nativeOrder()).asFloatBuffer();
      squareVertex.put(squareVertexData).position(0);
      Matrix.setIdentityM(MVPMatrix, 0);
      Matrix.setIdentityM(STMatrix, 0);
    }

    @Override
    protected void initGlFilter(Context context) {
      program = GlUtil.createProgram(VERTEX, fragment);
      aPositionHandle = GLES20.glGetAttribLocation(program, "aPosition");
      aTextureHandle = GLES20.glGetAttribLocation(program, "aTextureCoord");
      uMVPMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix");
      uSTMatrixHandle = GLES20.glGetUniformLocation(program, "uSTMatrix");
      uSamplerHandle = GLES20.glGetUniformLocation(program, "uSampler");
    }

    @Override
    protected void drawFilter() {
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
    }

    @Override
    public void release() {
      if (program != -1) GLES20.glDeleteProgram(program);
    }
  }
}
