package com.webcctv.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.webkit.*
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var setupLayout: View
    private lateinit var inputLocalIp: EditText
    private lateinit var inputCloudDomain: EditText
    private lateinit var btnSave: Button
    private lateinit var btnTest: Button
    private lateinit var btnReconfigure: Button
    private lateinit var txtStatus: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var hintLocal: TextView
    private lateinit var sharedPref: SharedPreferences

    private var localUrl = ""
    private var cloudUrl = ""
    private var busy = false

    companion object {
        /** Port bawaan aplikasi Web-CCTV. Dipakai bila IP diketik tanpa port. */
        private const val DEFAULT_PORT = 3000
        /** Timeout koneksi. 1.2 detik (nilai lama) terlalu pendek untuk LAN yang lambat. */
        private const val TIMEOUT_MS = 4000
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        sharedPref = getSharedPreferences("WebCctvPrefs", Context.MODE_PRIVATE)

        webView = findViewById(R.id.webView)
        setupLayout = findViewById(R.id.setupLayout)
        inputLocalIp = findViewById(R.id.inputLocalIp)
        inputCloudDomain = findViewById(R.id.inputCloudDomain)
        btnSave = findViewById(R.id.btnSave)
        btnTest = findViewById(R.id.btnTest)
        btnReconfigure = findViewById(R.id.btnReconfigure)
        txtStatus = findViewById(R.id.txtStatus)
        progressBar = findViewById(R.id.progressBar)
        hintLocal = findViewById(R.id.hintLocal)

        // Muat alamat tersimpan. Catatan: versi lama menyimpan contoh
        // "https://cctv.domainanda.com" sebagai nilai awal — domain contoh itu
        // tidak pernah bisa di-resolve, jadi nilai contoh tidak dipakai lagi.
        localUrl = sharedPref.getString("localUrl", "")?.takeIf { it.isNotBlank() } ?: ""
        cloudUrl = sharedPref.getString("cloudUrl", "")?.takeIf { it.isNotBlank() } ?: ""

        inputLocalIp.setText(localUrl)
        inputCloudDomain.setText(cloudUrl)

        // Pratinjau langsung: pengguna melihat hasil normalisasi saat mengetik,
        // jadi tahu persis alamat apa yang akan dipakai.
        inputLocalIp.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { updateLocalHint() }
        })

        btnSave.setOnClickListener { saveAndConnect() }
        btnTest.setOnClickListener { testConnectionOnly() }
        btnReconfigure.setOnClickListener { showSetupScreen("Ubah alamat server") }

        if (sharedPref.getBoolean("isFirstRun", true) || localUrl.isBlank()) {
            showSetupScreen(null)
        } else {
            connectAutomatically()
        }
    }

    /* ==================================================================
     * NORMALISASI ALAMAT
     * ------------------------------------------------------------------
     * Inilah perbaikan inti untuk keluhan "tempel IP atau domain tidak mau
     * konek". Kode lama memakai masukan apa adanya, sehingga:
     *   192.168.1.18        -> URL("192.168.1.18") melempar MalformedURLException
     *   192.168.1.18:3000   -> dianggap berskema "192.168.1.18"
     *   cctv.anda.com       -> tanpa skema, WebView gagal memuat
     * Logikanya ada di UrlNormalizer (tanpa dependensi Android) agar bisa diuji.
     * ================================================================== */

    private fun normalizeUrl(raw: String?, defaultScheme: String, defaultPort: Int): String? =
        UrlNormalizer.normalize(raw, defaultScheme, defaultPort)

    /** Pratinjau hasil normalisasi di bawah kolom alamat lokal. */
    private fun updateLocalHint() {
        val raw = inputLocalIp.text.toString()
        if (raw.isBlank()) {
            hintLocal.text = "Cukup tempel IP atau IP:port — awalan http:// ditambah otomatis."
            hintLocal.setTextColor(0xFF64748B.toInt())
            return
        }
        val n = normalizeUrl(raw, "http", DEFAULT_PORT)
        if (n == null) {
            hintLocal.text = "Alamat tidak dikenali. Contoh yang benar: 192.168.1.18:3000"
            hintLocal.setTextColor(0xFFF87171.toInt())
        } else {
            hintLocal.text = "Akan dipakai:  $n"
            hintLocal.setTextColor(0xFF34D399.toInt())
        }
    }

    /* ==================================================================
     * LAYAR PENGATURAN
     * ================================================================== */

    private fun showSetupScreen(message: String?) {
        setupLayout.visibility = View.VISIBLE
        webView.visibility = View.GONE
        btnReconfigure.visibility = View.GONE
        updateLocalHint()
        if (message != null) setStatus(message, 0xFF94A3B8.toInt())
    }

    private fun setStatus(text: String, color: Int) {
        txtStatus.visibility = View.VISIBLE
        txtStatus.text = text
        txtStatus.setTextColor(color)
    }

    private fun setBusy(on: Boolean) {
        busy = on
        progressBar.visibility = if (on) View.VISIBLE else View.GONE
        btnSave.isEnabled = !on
        btnTest.isEnabled = !on
    }

    /* ==================================================================
     * SIMPAN & UJI
     * ================================================================== */

    private fun saveAndConnect() {
        if (busy) return

        // Alamat lokal WAJIB; alamat cloud OPSIONAL.
        // Kode lama menolak bila salah satu kosong ("Harap isi kedua kolom
        // alamat!") — inilah penyebab form terasa "mental" padahal pengguna
        // memang tidak punya domain cloud.
        val rawLocal = inputLocalIp.text.toString()
        val local = normalizeUrl(rawLocal, "http", DEFAULT_PORT)
        if (local == null) {
            setStatus(
                if (rawLocal.isBlank()) "Alamat server lokal wajib diisi."
                else "Alamat lokal tidak valid: \"${rawLocal.trim()}\"\nContoh yang benar: 192.168.1.18:3000",
                0xFFF87171.toInt()
            )
            return
        }

        val rawCloud = inputCloudDomain.text.toString()
        var cloud = ""
        if (rawCloud.isNotBlank()) {
            // Domain cloud tanpa skema diasumsikan HTTPS (Cloudflare Tunnel).
            cloud = normalizeUrl(rawCloud, "https", DEFAULT_PORT) ?: ""
            if (cloud.isEmpty()) {
                setStatus("Alamat cloud tidak valid: \"${rawCloud.trim()}\"", 0xFFF87171.toInt())
                return
            }
        }

        localUrl = local
        cloudUrl = cloud
        sharedPref.edit()
            .putString("localUrl", local)
            .putString("cloudUrl", cloud)
            .putBoolean("isFirstRun", false)
            .apply()

        setStatus("Menghubungi $local ...", 0xFF94A3B8.toInt())
        setBusy(true)
        probe(local) { okLocal ->
            runOnUiThread {
                setBusy(false)
                if (okLocal) {
                    setStatus("Terhubung ke jaringan lokal.", 0xFF34D399.toInt())
                    loadWebCctv(local)
                } else if (cloud.isNotEmpty()) {
                    setStatus("Lokal tidak terjangkau, mencoba $cloud ...", 0xFFFBBF24.toInt())
                    setBusy(true)
                    probe(cloud) { okCloud ->
                        runOnUiThread {
                            setBusy(false)
                            if (okCloud) loadWebCctv(cloud)
                            else showSetupScreen("Kedua alamat tidak bisa dihubungi.\nPastikan HP satu Wi-Fi dengan STB, lalu coba lagi.")
                        }
                    }
                } else {
                    showSetupScreen(
                        "Tidak bisa menghubungi $local.\n" +
                        "• Pastikan HP tersambung ke Wi-Fi yang sama dengan STB\n" +
                        "• Pastikan Web-CCTV sedang berjalan di STB\n" +
                        "• Periksa IP STB dengan perintah: hostname -I"
                    )
                }
            }
        }
    }

    private fun testConnectionOnly() {
        if (busy) return
        val local = normalizeUrl(inputLocalIp.text.toString(), "http", DEFAULT_PORT)
        if (local == null) {
            setStatus("Alamat lokal tidak valid.", 0xFFF87171.toInt()); return
        }
        val cloudRaw = inputCloudDomain.text.toString()
        val cloud = if (cloudRaw.isBlank()) "" else normalizeUrl(cloudRaw, "https", DEFAULT_PORT).orEmpty()

        setStatus("Menguji $local ...", 0xFF94A3B8.toInt())
        setBusy(true)
        probe(local) { okLocal ->
            if (cloud.isEmpty()) {
                runOnUiThread {
                    setBusy(false)
                    if (okLocal) setStatus("✅ Lokal OK: $local", 0xFF34D399.toInt())
                    else setStatus("❌ Lokal gagal: $local", 0xFFF87171.toInt())
                }
                return@probe
            }
            runOnUiThread { setStatus("Menguji $cloud ...", 0xFF94A3B8.toInt()) }
            probe(cloud) { okCloud ->
                runOnUiThread {
                    setBusy(false)
                    val a = if (okLocal) "✅ Lokal OK" else "❌ Lokal gagal"
                    val b = if (okCloud) "✅ Cloud OK" else "❌ Cloud gagal"
                    setStatus("$a  ·  $b", if (okLocal || okCloud) 0xFF34D399.toInt() else 0xFFF87171.toInt())
                }
            }
        }
    }

    /* ==================================================================
     * KONEKSI OTOMATIS SAAT APLIKASI DIBUKA
     * ================================================================== */

    private fun connectAutomatically() {
        if (!isNetworkAvailable()) {
            showSetupScreen("Tidak ada koneksi internet di HP ini.")
            return
        }
        setStatus("Menghubungi $localUrl ...", 0xFF94A3B8.toInt())
        setBusy(true)
        probe(localUrl) { okLocal ->
            runOnUiThread {
                setBusy(false)
                when {
                    okLocal -> loadWebCctv(localUrl)
                    cloudUrl.isNotEmpty() -> {
                        setBusy(true)
                        setStatus("Di luar jaringan lokal, mencoba cloud ...", 0xFFFBBF24.toInt())
                        probe(cloudUrl) { okCloud ->
                            runOnUiThread {
                                setBusy(false)
                                if (okCloud) loadWebCctv(cloudUrl)
                                else showSetupScreen("Server tidak bisa dihubungi, baik lokal maupun cloud.")
                            }
                        }
                    }
                    else -> showSetupScreen("Server lokal tidak bisa dihubungi. Pastikan HP satu Wi-Fi dengan STB.")
                }
            }
        }
    }

    /* ==================================================================
     * WEBVIEW
     * ================================================================== */

    @SuppressLint("SetJavaScriptEnabled")
    private fun loadWebCctv(targetUrl: String) {
        setupLayout.visibility = View.GONE
        webView.visibility = View.VISIBLE
        btnReconfigure.visibility = View.VISIBLE

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)

        try { webView.clearCache(true) } catch (_: Exception) {}

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?, request: WebResourceRequest?, error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                // HANYA untuk dokumen utama. Kode lama memanggil showSetupScreen()
                // untuk SEMUA error, sehingga satu favicon/gambar yang gagal memuat
                // langsung melempar pengguna kembali ke form konfigurasi.
                val mainFrame = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    request?.isForMainFrame ?: true
                } else true
                if (!mainFrame) return
                runOnUiThread {
                    showSetupScreen("Gagal memuat $targetUrl.\nPeriksa alamat dan koneksi, lalu coba lagi.")
                }
            }
        }
        webView.webChromeClient = WebChromeClient()
        webView.loadUrl(targetUrl)
    }

    /* ==================================================================
     * JARINGAN
     * ================================================================== */

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val net = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(net) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } else {
            @Suppress("DEPRECATION")
            val info = cm.activeNetworkInfo
            @Suppress("DEPRECATION")
            info != null && info.isConnected
        }
    }

    /**
     * Uji apakah server menjawab. Memakai Thread biasa, bukan AsyncTask yang
     * sudah usang (AsyncTask menimbulkan banyak peringatan kompilasi).
     *
     * Titik uji memakai /api/version karena endpoint itu paling ringan dan
     * tidak memerlukan autentikasi.
     */
    private fun probe(baseUrl: String, callback: (Boolean) -> Unit) {
        Thread {
            val ok = try {
                val url = URL(baseUrl.trimEnd('/') + "/api/version")
                val c = url.openConnection() as HttpURLConnection
                c.connectTimeout = TIMEOUT_MS
                c.readTimeout = TIMEOUT_MS
                c.requestMethod = "GET"
                c.instanceFollowRedirects = true
                val code = c.responseCode
                c.disconnect()
                // 200-499 berarti server HIDUP dan menjawab. Kode lama hanya
                // menerima 200, sehingga server yang membalas 401/403 dianggap
                // mati dan aplikasi keliru pindah ke alamat cloud.
                code in 200..499
            } catch (_: Exception) {
                false
            }
            callback(ok)
        }.start()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (webView.visibility == View.VISIBLE && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
