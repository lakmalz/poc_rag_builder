object CordovaWebViewManager {

    private var cordovaWebView: CordovaWebView? = null

    fun preload(context: Context) {
        if (cordovaWebView != null) return

        val activity = context as Activity

        val systemWebView = SystemWebView(activity)
        val engine = SystemWebViewEngine(systemWebView)
        val webView = CordovaWebViewImpl(engine)

        val preferences = CordovaPreferences()
        val pluginEntries = ArrayList<PluginEntry>()

        webView.init(
            CordovaInterfaceImpl(activity),
            pluginEntries,
            preferences
        )

        webView.loadUrl("file:///android_asset/www/index.html")

        cordovaWebView = webView
    }

    fun get(): CordovaWebView? = cordovaWebView

    fun clear() {
        cordovaWebView?.view?.let {
            (it.parent as? ViewGroup)?.removeView(it)
        }
        cordovaWebView?.destroy()
        cordovaWebView = null
    }
}