here/*
Verified facts for pedroSG94 rtmp-rtsp-stream-client-java 2.2.2:
BaseFilterRender fully-qualified name: com.pedro.rtplibrary.filter.BaseFilterRender
Abstract method signatures:
  public abstract String getVertexShader();
  public abstract String getFragmentShader();
Built-in filter renders present in 2.2.2:
  SepiaFilterRender, GrayScaleFilterRender, SaturationFilterRender, BeautyFilterRender, ContrastFilterRender
GLES20 program-compile helper: com.pedro.opengl.util.GlUtil.createProgram(String vertexSrc, String fragmentSrc)
*/

package com.lightdirector;

import android.opengl.GLES20;
import java.nio.FloatBuffer;
import com.pedro.rtplibrary.filter.BaseFilterRender;
import com.pedro.opengl.util.GlUtil;
import com.pedro.rtplibrary.filter.BeautyFilterRender;

/** Container for grade filter renders. */
public final class GradeFilters {

    private GradeFilters() {}

    /** Returns a filter render for the given preset name or null if unsupported. */
    public static BaseFilterRender forPreset(String preset) {
        if (preset == null) return null;
        switch (preset) {
            case "Natural":     return null;
            case "WarmChurch":  return new WarmChurchFilter();
            case "Cool":        return new CoolFilter();
            case "Cinematic":   return new CinematicFilter();
            case "Vivid":       return new VividFilter();
            case "FlatLogLift": return new FlatLogLiftFilter();
            case "Vignette":    return new VignetteFilter();
            case "Noir":        return new NoirFilter();
            case "Retro":       return new RetroFilter();
            case "Beauty":      return new BeautyFilterRender();
            default:            return null;
        }
    }

    // Shared fullscreen vertex shader
    private static final String VERTEX_SHADER =
            "attribute vec4 aPosition;" +
            "attribute vec2 aTextureCoord;" +
            "varying vec2 vTextureCoord;" +
            "void main() {" +
            "  gl_Position = aPosition;" +
            "  vTextureCoord = aTextureCoord;" +
            "}";

    // Helper base: subclasses only provide fragment shader
    private static abstract class SimpleFilter extends BaseFilterRender {
        @Override
        public String getVertexShader() { return VERTEX_SHADER; }
        @Override
        public abstract String getFragmentShader();
    }

    // 1. WarmChurch – warm tint (+R, -B) + slight saturation boost
    private static class WarmChurchFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  c.r = min(c.r * 1.2, 1.0);" +
                "  c.b = c.b * 0.8;" +
                "  float gray = dot(c.rgb, vec3(0.33));" +
                "  c.rgb = mix(vec3(gray), c.rgb, 1.1);" +
                "  gl_FragColor = c;" +
                "}";
        }
    }

    // 2. Cool – blue tint, desaturate
    private static class CoolFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  c.b = min(c.b * 1.2, 1.0);" +
                "  float gray = dot(c.rgb, vec3(0.33));" +
                "  c.rgb = mix(vec3(gray), c.rgb, 0.85);" +
                "  gl_FragColor = c;" +
                "}";
        }
    }

    // 3. Cinematic – contrast + vignette + slight desaturation
    private static class CinematicFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec2 pos = vTextureCoord - 0.5;" +
                "  float vignette = smoothstep(0.8, 0.5, length(pos));" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  c.rgb = ((c.rgb - 0.5) * 1.15) + 0.5;" +
                "  float gray = dot(c.rgb, vec3(0.33));" +
                "  c.rgb = mix(vec3(gray), c.rgb, 0.85);" +
                "  c.rgb *= vignette;" +
                "  gl_FragColor = c;" +
                "}";
        }
    }

    // 4. Vivid – high saturation + contrast
    private static class VividFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  float gray = dot(c.rgb, vec3(0.33));" +
                "  c.rgb = mix(vec3(gray), c.rgb, 1.6);" +
                "  c.rgb = ((c.rgb - 0.5) * 1.2) + 0.5;" +
                "  gl_FragColor = c;" +
                "}";
        }
    }

    // 5. FlatLogLift – gamma lift + highlight compression
    private static class FlatLogLiftFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  c.rgb = pow(c.rgb, vec3(0.85));" +
                "  c.rgb = c.rgb / (c.rgb + vec3(1.0));" +
                "  gl_FragColor = c;" +
                "}";
        }
    }

    // 6. Vignette – radial darkening
    private static class VignetteFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec2 pos = vTextureCoord - 0.5;" +
                "  float dist = length(pos);" +
                "  float vignette = smoothstep(0.7, 0.5, dist);" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  c.rgb *= vignette;" +
                "  gl_FragColor = c;" +
                "}";
        }
    }

    // 7. Noir – grayscale + strong contrast
    private static class NoirFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  float gray = dot(c.rgb, vec3(0.33));" +
                "  gray = ((gray - 0.5) * 1.3) + 0.5;" +
                "  gl_FragColor = vec4(gray, gray, gray, c.a);" +
                "}";
        }
    }

    // 8. Retro – sepia matrix + subtle grain
    private static class RetroFilter extends SimpleFilter {
        @Override
        public String getFragmentShader() {
            return
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D sTexture;" +
                "void main() {" +
                "  vec4 c = texture2D(sTexture, vTextureCoord);" +
                "  // sepia matrix" +
                "  float r = dot(c.rgb, vec3(0.393, 0.769, 0.189));" +
                "  float g = dot(c.rgb, vec3(0.349, 0.686, 0.168));" +
                "  float b = dot(c.rgb, vec3(0.272, 0.534, 0.131));" +
                "  // subtle grain" +
                "  float grain = fract(sin(dot(vTextureCoord, vec2(12.9898,78.233))) * 43758.5453);" +
                "  grain = (grain - 0.5) * 0.06;" +
                "  gl_FragColor = vec4(r + grain, g + grain, b + grain, c.a);" +
                "}";
        }
    }
              }
