package com.lightdirector;

import android.content.Context;
import android.view.SurfaceView;
import android.view.View;
import android.widget.FrameLayout;
import android.view.ViewGroup.LayoutParams;

public class CompositorView extends FrameLayout {
private SurfaceView previewView;

public CompositorView(Context context) {
    super(context);
    previewView = new SurfaceView(context);
    previewView.setLayoutParams(new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    addView(previewView);
}

public View getPreviewView() {
    return previewView;
}

public void release() {
    if (previewView != null) {
        removeView(previewView);
        previewView = null;
    }
}
}
