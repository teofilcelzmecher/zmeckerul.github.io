package com.budgiesocial.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
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
            WebView web = bridge.getWebView();
            web.getSettings().setMediaPlaybackRequiresUserGesture(false);
            keyboardOnce(web);
        }
    }

    /**
     * The keyboard makes room for itself once. Capacitor already makes the page end where the keyboard starts (its
     * SystemBars plugin pads the window by the keyboard's height); newer WebViews would also make room for it inside
     * the page, so everything (the top bar, the menu, the message box) went up a second keyboard's height. The page
     * isn't told about the keyboard any more, and while it's up, there's no navigation bar under the page to keep
     * clear of either (the keyboard covers it).
     */
    private static void keyboardOnce(WebView web) {
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            if (!insets.isVisible(WindowInsetsCompat.Type.ime())) return ViewCompat.onApplyWindowInsets(v, insets);
            int bars = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets edges = insets.getInsets(bars);
            WindowInsetsCompat calm = new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false)
                .setInsets(bars, Insets.of(edges.left, edges.top, edges.right, 0))
                .build();
            return ViewCompat.onApplyWindowInsets(v, calm);
        });
    }
}
