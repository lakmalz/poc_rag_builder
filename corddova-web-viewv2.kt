public final class SPANavigator {

    private static final long TIMEOUT_MS = 1000;
    private static final long POLL_DELAY_MS = 80;

    private final CordovaWebView appView;
    private final Handler handler;

    public interface MaskController {
        void show();
        void hide();
    }

    public SPANavigator(CordovaWebView appView, Handler handler) {
        this.appView = appView;
        this.handler = handler;
    }

    public void navigate(
            String suffix,
            MaskController maskController,
            @Nullable String expectedHash
    ) {
        if (appView == null || suffix == null || suffix.isEmpty()) return;

        maskController.show();

        String safeHash = buildSafeHash(suffix);
        executeNavigation(safeHash);

        pollUntilReady(maskController, expectedHash);
    }

    // ------------------------
    // Internal helpers
    // ------------------------

    private String buildSafeHash(String suffix) {
        if (!suffix.startsWith("#")) {
            suffix = "#" + suffix;
        }

        String separator = suffix.contains("?") ? "&" : "?";
        suffix = suffix + separator + "ts=" + System.currentTimeMillis();

        return escapeJs(suffix);
    }

    private void executeNavigation(String hash) {
        String js = "window.location.replace('" + hash + "');";
        appView.getEngine().evaluateJavascript(js, null);
    }

    private void pollUntilReady(
            MaskController maskController,
            @Nullable String expectedHash
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
                        (expectedHash != null
                                ? " && location.hash.indexOf('" + expectedHash + "') !== -1"
                                : "");

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

    private String escapeJs(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("'", "\\'");
    }
}