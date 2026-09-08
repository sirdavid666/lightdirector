package com.lightdirector;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.uimanager.ViewManager;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;

public class NativeCompositorPackage implements ReactPackage {
@Override
public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
return Collections.singletonList(new NativeCompositorModule(reactContext));
}

@Override
public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.singletonList(new CompositorViewManager());
}
}
