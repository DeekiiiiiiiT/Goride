package co.roamenterprise.driver;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Survive WebView renderer kills on low-RAM OEMs (TECNO/HiOS).
 * Without a listener, Capacitor returns false from onRenderProcessGone and Android kills the app.
 */
public class MainActivity extends BridgeActivity {
    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String RENDER_GONE_KEY = "webview_render_process_gone";
    private static final long CRASH_WINDOW_MS = 60_000L;
    private static final int MAX_CRASHES_IN_WINDOW = 3;

    // Static so recreate() does not reset the give-up-after-3 guard.
    private static int renderCrashes = 0;
    private static long firstCrashAt = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null) {
            return;
        }
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                long now = System.currentTimeMillis();
                if (now - firstCrashAt > CRASH_WINDOW_MS) {
                    firstCrashAt = now;
                    renderCrashes = 0;
                }
                renderCrashes++;

                boolean didCrash = detail != null && detail.didCrash();
                SharedPreferences prefs = getSharedPreferences(PREFS_GROUP, MODE_PRIVATE);
                prefs.edit().putString(RENDER_GONE_KEY, didCrash ? "crash" : "kill").apply();

                if (renderCrashes > MAX_CRASHES_IN_WINDOW) {
                    // Give up so Play vitals still records a hard failure.
                    return false;
                }

                recreate();
                return true;
            }
        });
    }
}
