package com.budgiesocial.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

/** Budgie's one screen: the app, edge to edge, with sound that may start on its own (a call's ring, the other person's voice). */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // after super.onCreate: Capacitor has switched from the splash theme to the app's own by then, so the window
        // is built in the app's theme. Edge to edge: the page goes under the status and navigation bars, and makes
        // room for them itself (app.css, --nook-top and env(safe-area-inset-*)).
        EdgeToEdge.enable(this);
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
