package com.webcctv.app

/**
 * Normalisasi alamat server Web-CCTV.
 *
 * Dipisah dari MainActivity dan TIDAK menyentuh API Android apa pun, supaya
 * bisa diuji di JVM biasa (`./gradlew test`). Ini inti dari perbaikan keluhan
 * "tempel IP atau domain tidak mau konek": kode lama memakai masukan apa
 * adanya sehingga bentuk tanpa `http://` selalu gagal.
 */
object UrlNormalizer {

    /** Port bawaan aplikasi Web-CCTV. */
    const val DEFAULT_PORT = 3000

    private val SCHEME_RX = Regex("^(https?)://", RegexOption.IGNORE_CASE)
    private val IPV4_RX = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
    // Nama host: satu label (mis. "localhost") ATAU FQDN bertitik.
    private val HOSTNAME_RX =
        Regex("^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$")
    // Hanya angka dan titik => pengguna sedang menulis IP, bukan nama host.
    private val IP_LIKE_RX = Regex("^[0-9.]+$")
    private val WS_RX = Regex("\\s")
    private val AROUND_COLON_RX = Regex("\\s*:\\s*")
    private val AROUND_SLASH_RX = Regex("\\s*/\\s*")

    /**
     * Ubah masukan bebas menjadi URL yang valid.
     *
     * Bentuk yang diterima:
     *   192.168.1.18                  -> http://192.168.1.18:3000
     *   192.168.1.18:3000             -> http://192.168.1.18:3000
     *   http://192.168.1.18:3000      -> http://192.168.1.18:3000
     *   192.168.1.18:8080/            -> http://192.168.1.18:8080
     *   cctv.domainanda.com           -> https://cctv.domainanda.com
     *   https://cctv.domainanda.com   -> https://cctv.domainanda.com
     *   "  192.168.1.18 : 3000  "     -> http://192.168.1.18:3000  (spasi dibuang)
     *
     * @param defaultScheme dipakai bila skema tidak ditulis
     * @param defaultPort   dipakai bila alamat berupa IP tanpa port
     * @return URL ternormalisasi, atau null bila masukan bukan alamat yang sah
     */
    fun normalize(
        raw: String?,
        defaultScheme: String,
        defaultPort: Int = DEFAULT_PORT,
        forceDefaultPort: Boolean = false
    ): String? {
        var s = (raw ?: "").trim()
        if (s.isEmpty()) return null
        // Spasi di sekitar ':' dan '/' sering ikut saat menempel dari chat/WhatsApp,
        // mis. "192.168.1.18 : 3000". Hanya spasi di posisi struktural itu yang
        // dibuang. Menghapus SEMUA spasi (perilaku sebelumnya) berbahaya: teks
        // "bukan alamat" akan menyatu jadi "bukanalamat" dan lolos sebagai nama host.
        s = s.replace(AROUND_COLON_RX, ":").replace(AROUND_SLASH_RX, "/").trim()
        if (s.isEmpty()) return null
        // Masih ada spasi di tengah => ini bukan alamat.
        if (WS_RX.containsMatchIn(s)) return null

        // 1) Pisahkan skema.
        var scheme = defaultScheme
        val m = SCHEME_RX.find(s)
        if (m != null) {
            scheme = m.value.removeSuffix("://").lowercase()
            s = s.substring(m.range.last + 1)
        }
        // Buang userinfo (user:pass@) — tidak dipakai aplikasi ini.
        s = s.substringAfterLast('@')
        // Aplikasi selalu di root; buang path/query/fragment.
        s = s.substringBefore('/').substringBefore('?').substringBefore('#')
        if (s.isEmpty()) return null

        // 2) Pisahkan host dan port (dukung IPv6 dalam kurung siku).
        val host: String
        var port: String? = null
        if (s.startsWith("[")) {
            val end = s.indexOf(']')
            if (end < 0) return null
            host = s.substring(0, end + 1)
            val rest = s.substring(end + 1)
            if (rest.startsWith(":")) port = rest.substring(1)
        } else if (s.count { it == ':' } == 1) {
            val parts = s.split(":")
            host = parts[0]
            port = parts[1]
        } else {
            host = s
        }
        if (host.isEmpty()) return null

        // 3) Validasi bentuk host.
        val isIpv4 = IPV4_RX.matches(host)
        if (isIpv4) {
            for (seg in host.split(".")) {
                val n = seg.toIntOrNull() ?: return null
                if (n !in 0..255) return null
            }
        } else if (!host.startsWith("[")) {
            // "192.168.1" atau "192.168.1.999" hampir pasti IP yang salah ketik.
            // Tanpa penolakan ini, masukan itu lolos sebagai nama host dan
            // pengguna mendapat pesan "tidak bisa konek" tanpa tahu sebabnya.
            if (IP_LIKE_RX.matches(host)) return null
            if (!HOSTNAME_RX.matches(host)) return null
        }

        // 4) Tentukan port.
        if (port.isNullOrEmpty()) {
            // IP tanpa port -> port bawaan aplikasi. Untuk kolom LOKAL, nama host
            // seperti "localhost" juga diberi port bawaan karena yang dimaksud
            // memang aplikasi ini. Untuk kolom CLOUD, domain dibiarkan memakai
            // port standar skemanya (80/443) agar HTTPS tidak rusak.
            if (isIpv4 || host.startsWith("[") || forceDefaultPort) port = defaultPort.toString()
        } else {
            val p = port.toIntOrNull() ?: return null
            if (p !in 1..65535) return null
        }

        return StringBuilder(scheme).append("://").append(host)
            .apply { if (!port.isNullOrEmpty()) append(':').append(port) }
            .toString()
    }

    /** Versi singkat untuk alamat lokal (skema http, port bawaan 3000 selalu ditambah). */
    fun normalizeLocal(raw: String?): String? =
        normalize(raw, "http", DEFAULT_PORT, forceDefaultPort = true)

    /** Versi singkat untuk alamat cloud (skema https, tanpa memaksa port). */
    fun normalizeCloud(raw: String?): String? =
        normalize(raw, "https", DEFAULT_PORT, forceDefaultPort = false)
}
