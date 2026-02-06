import android.os.Handler;
import android.os.SystemClock;

import org.apache.cordova.CordovaWebView;

public final class SPANavigator {

    private static final long TIMEOUT_MS = 1000;
    private static final long POLL_DELAY_MS = 80;

    private final CordovaWebView appView;
    private final Handler handler;

    // UI control stays outside
    public interface MaskController {
        void show();
        void hide();
    }

    public SPANavigator(CordovaWebView appView, Handler handler) {
        this.appView = appView;
        this.handler = handler;
    }

    // ------------------------
    // Public API
    // ------------------------

    public void navigate(String suffix, MaskController maskController) {
        if (appView == null || suffix == null || suffix.isEmpty()) return;

        maskController.show();

        String normalizedHash = normalizeHash(suffix);
        String expectedHash = extractBaseHash(normalizedHash);
        String finalHash = appendTimestamp(normalizedHash);

        executeNavigation(finalHash);
        pollUntilReady(maskController, expectedHash);
    }

    // ------------------------
    // Navigation
    // ------------------------

    private void executeNavigation(String hash) {
        String js = "window.location.replace('" + hash + "');";
        appView.getEngine().evaluateJavascript(js, null);
    }

    // ------------------------
    // Ready-state polling
    // ------------------------

    private void pollUntilReady(
            MaskController maskController,
            String expectedHash
    ) {
        long start = SystemClock.elapsedRealtime();

        Runnable poll = new Runnable() {
            @Override
            public void run() {

                if (SystemClock.elapsedRealtime() - start > TIMEOUT_MS) {
                    maskController.hide();
                    return;
                }

                String js =
                        "(document.readyState === 'complete' || " +
                        " document.readyState === 'interactive')" +
                        " && location.hash.indexOf('" + expectedHash + "') !== -1";

                appView.getEngine().evaluateJavascript(js, value -> {
                    if ("true".equals(value)) {
                        maskController.hide();
                    } else {
                        handler.postDelayed(this, POLL_DELAY_MS);
                    }
                });
            }
        };

        handler.post(poll);
    }

    // ------------------------
    // Hash helpers
    // ------------------------

    private String normalizeHash(String suffix) {
        return suffix.startsWith("#") ? suffix : "#" + suffix;
    }

    private String extractBaseHash(String hash) {
        int q = hash.indexOf('?');
        return q > 0 ? hash.substring(0, q) : hash;
    }

    private String appendTimestamp(String hash) {
        String separator = hash.contains("?") ? "&" : "?";
        return escapeJs(hash + separator + "ts=" + System.currentTimeMillis());
    }

    private String escapeJs(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("'", "\\'");
    }
}
SPANavigator navigator = new SPANavigator(appView, uiHandlerJSExe);

navigator.navigate("ssoLogin", new SPANavigator.MaskController() {
    @Override public void show() {
        ensureMask();
        showMask();
    }

    @Override public void hide() {
        hideMask();
    }
});

