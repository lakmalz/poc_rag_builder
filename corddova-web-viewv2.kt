object WebViewManager {

    private var cordovaWebView: CordovaWebView? = null

    fun init(context: Context) {
        if (cordovaWebView != null) return

        val cordovaInterface = CordovaInterfaceImpl(context as Activity)

        val webView = CordovaWebViewImpl.makeWebView(
            context,
            CordovaWebViewEngine.createEngine(context, null)
        )

        webView.init(
            cordovaInterface,
            ArrayList(),
            null
        )

        webView.loadUrl("file:///android_asset/www/index.html")

        cordovaWebView = webView
    }

    fun getWebView(): CordovaWebView? = cordovaWebView
}