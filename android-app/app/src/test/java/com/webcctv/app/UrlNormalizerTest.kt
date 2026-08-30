package com.webcctv.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Uji unit UrlNormalizer — inti dari perbaikan keluhan
 * "pas tempel IP atau domain mental, tidak mau konek".
 *
 * Kode lama memakai masukan apa adanya sehingga bentuk tanpa `http://`
 * selalu gagal dimuat WebView. Uji ini mengunci semua bentuk yang harus
 * diterima, plus bentuk yang memang harus ditolak.
 */
class UrlNormalizerTest {

    /* ---------- bentuk yang HARUS diterima ---------- */

    @Test fun ipPolos_memakaiPortBawaan() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("192.168.1.18"))
    }

    @Test fun ipDenganPort_mempertahankanPort() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("192.168.1.18:3000"))
    }

    @Test fun ipDenganPortLain_tidakDitimpa() {
        assertEquals("http://192.168.1.18:8080", UrlNormalizer.normalizeLocal("192.168.1.18:8080"))
    }

    @Test fun sudahAdaSkemaHttp_dibiarkan() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("http://192.168.1.18:3000"))
    }

    @Test fun skemaBesarKecil_tidakMasalah() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("HTTP://192.168.1.18:3000"))
    }

    @Test fun adaSlashDiAkhir_dibuang() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("192.168.1.18:3000/"))
    }

    @Test fun adaPath_dibuang() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("192.168.1.18:3000/login"))
    }

    @Test fun spasiDiTempelan_dibuang() {
        // Kasus nyata: menempel dari chat/WhatsApp sering membawa spasi.
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("  192.168.1.18 : 3000  "))
    }

    @Test fun newlineDiTempelan_dibuang() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("192.168.1.18:3000\n"))
    }

    @Test fun userinfo_dibuang() {
        assertEquals("http://192.168.1.18:3000", UrlNormalizer.normalizeLocal("admin:pass@192.168.1.18:3000"))
    }

    @Test fun ipPublik_jalan() {
        assertEquals("http://203.0.113.7:3000", UrlNormalizer.normalizeLocal("203.0.113.7"))
    }

    @Test fun domainPolos_memakaiHttps() {
        // Domain cloud tanpa skema harus HTTPS — inilah yang dipakai Cloudflare Tunnel.
        assertEquals("https://cctv.domainanda.com", UrlNormalizer.normalizeCloud("cctv.domainanda.com"))
    }

    @Test fun domainSudahHttps_dibiarkan() {
        assertEquals("https://cctv.domainanda.com", UrlNormalizer.normalizeCloud("https://cctv.domainanda.com"))
    }

    @Test fun domainTrycloudflare_jalan() {
        assertEquals(
            "https://clearly-castle-across-dialog.trycloudflare.com",
            UrlNormalizer.normalizeCloud("clearly-castle-across-dialog.trycloudflare.com")
        )
    }

    @Test fun domainTanpaPort_tidakDipaksaPort3000() {
        // Memaksa :3000 pada domain HTTPS akan merusak koneksi.
        assertEquals("https://cctv.domainanda.com", UrlNormalizer.normalizeCloud("cctv.domainanda.com"))
    }

    @Test fun subdomainBertingkat_jalan() {
        assertEquals("https://a.b.c.example.com", UrlNormalizer.normalizeCloud("a.b.c.example.com"))
    }

    @Test fun localhost_jalan() {
        assertEquals("http://localhost:3000", UrlNormalizer.normalizeLocal("localhost:3000"))
    }

    @Test fun ipv6DalamKurung_jalan() {
        assertEquals("http://[fe80::1]:3000", UrlNormalizer.normalizeLocal("[fe80::1]:3000"))
    }

    @Test fun portBatasBawah_diterima() {
        assertEquals("http://192.168.1.18:1", UrlNormalizer.normalizeLocal("192.168.1.18:1"))
    }

    @Test fun portBatasAtas_diterima() {
        assertEquals("http://192.168.1.18:65535", UrlNormalizer.normalizeLocal("192.168.1.18:65535"))
    }

    /* ---------- bentuk yang HARUS ditolak ---------- */

    @Test fun kosong_ditolak() {
        assertNull(UrlNormalizer.normalizeLocal(""))
        assertNull(UrlNormalizer.normalizeLocal(null))
        assertNull(UrlNormalizer.normalizeLocal("   "))
    }

    @Test fun ipOktetLebih255_ditolak() {
        assertNull(UrlNormalizer.normalizeLocal("192.168.1.999"))
    }

    @Test fun ipOktetKurang_ditolak() {
        assertNull(UrlNormalizer.normalizeLocal("192.168.1"))
    }

    @Test fun portBukanAngka_ditolak() {
        assertNull(UrlNormalizer.normalizeLocal("192.168.1.18:abc"))
    }

    @Test fun portLebih65535_ditolak() {
        assertNull(UrlNormalizer.normalizeLocal("192.168.1.18:99999"))
    }

    @Test fun teksAsal_ditolak() {
        assertNull(UrlNormalizer.normalizeLocal("bukan alamat"))
        assertNull(UrlNormalizer.normalizeLocal("http://"))
        assertNull(UrlNormalizer.normalizeLocal("...."))
    }

    @Test fun ipSalahKetik_hanyaAngkaDanTitik_ditolak() {
        // "192.168.1" nyaris pasti IP yang kurang satu oktet. Tanpa penolakan ini
        // masukan lolos sebagai nama host dan pengguna bingung kenapa tidak konek.
        assertNull(UrlNormalizer.normalizeLocal("192.168.1"))
        assertNull(UrlNormalizer.normalizeLocal("10.0"))
        assertNull(UrlNormalizer.normalizeLocal("192.168.1."))
    }

    @Test fun hostnameSatuLabel_diterima() {
        // "localhost" sah dan sering dipakai; tidak boleh ditolak.
        assertEquals("http://localhost:3000", UrlNormalizer.normalizeLocal("localhost"))
    }

    @Test fun domainTitikGanda_ditolak() {
        assertNull(UrlNormalizer.normalizeCloud("cctv..com"))
    }

    @Test fun hostnameDenganStrip_diterima() {
        assertEquals("https://cctv-rumah.example.com", UrlNormalizer.normalizeCloud("cctv-rumah.example.com"))
    }

    /* ---------- konsistensi ---------- */

    @Test fun hasilSelaluBisaDipakaiURLJava() {
        // Jaminan terpenting: apa pun yang diterima harus bisa di-parse java.net.URL.
        // Kode lama gagal persis di sini (MalformedURLException: no protocol).
        val inputs = listOf(
            "192.168.1.18", "192.168.1.18:3000", "http://192.168.1.18:3000",
            "192.168.1.18:8080/", " 192.168.1.18 : 3000 ", "203.0.113.7", "10.0.0.5:3000"
        )
        for (raw in inputs) {
            val out = UrlNormalizer.normalizeLocal(raw)
            org.junit.Assert.assertNotNull("gagal untuk masukan: $raw", out)
            val url = java.net.URL(out!!)   // melempar bila tidak valid
            assertEquals("http", url.protocol)
            org.junit.Assert.assertTrue("host kosong untuk: $raw", url.host.isNotEmpty())
        }
    }

    @Test fun idempoten_hasilDinormalisasiUlangTidakBerubah() {
        val once = UrlNormalizer.normalizeLocal("192.168.1.18")!!
        assertEquals(once, UrlNormalizer.normalizeLocal(once))
        val cloud = UrlNormalizer.normalizeCloud("cctv.domainanda.com")!!
        assertEquals(cloud, UrlNormalizer.normalizeCloud(cloud))
    }
}
