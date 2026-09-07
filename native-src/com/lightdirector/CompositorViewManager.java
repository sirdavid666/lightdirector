herepackage com.lightdirector;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

public class CompositorViewManager extends SimpleViewManager<CompositorView> {
@Override
public String getName() {
return "NativeCompositorView";
}

@Override
public CompositorView createViewInstance(ThemedReactContext context) {
    return new CompositorView(context);
}

@Override
public void onDropViewInstance(CompositorView view) {
    view.release();
    super.onDropViewInstance(view);
}
}
