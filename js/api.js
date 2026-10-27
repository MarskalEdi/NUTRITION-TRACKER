/**
 * ============================================================================
 * LAYER KOMUNIKASI FETCH REST API (TANPA GOOGLE.SCRIPT.RUN / TANPA IFRAME)
 * Mendukung Optimistic UI + LocalStorage Cache + Fallback Offline Otomatis
 * ============================================================================
 */

const STORAGE_KEY = "NOURISHTRACK_STATE_V1";

const ApiClient = {
  isConfigured() {
    return (
      APP_CONFIG.GAS_URL &&
      APP_CONFIG.GAS_URL.startsWith("https://script.google.com/macros/s/")
    );
  },

  async fetchInitialData(email, dateStr) {
    if (!this.isConfigured()) {
      return this.getLocalSeedData();
    }
    try {
      const url = `${APP_CONFIG.GAS_URL}?action=init&email=${encodeURIComponent(email)}&date=${encodeURIComponent(dateStr)}`;
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      const json = await res.json();
      if (json.status === "success" && json.data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(json.data));
        return json.data;
      }
      throw new Error(json.message || "Gagal memuat data dari GAS");
    } catch (err) {
      console.warn("Menggunakan cache lokal karena koneksi API tertunda:", err.message);
      return this.getLocalSeedData();
    }
  },

  async postAction(action, payload) {
    if (!this.isConfigured()) {
      return { status: "local_only", data: payload };
    }
    try {
      const res = await fetch(APP_CONFIG.GAS_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // Menghindari preflight CORS di GAS
        body: JSON.stringify({ action, payload })
      });
      return await res.json();
    } catch (err) {
      console.warn(`Sinkronisasi latar [${action}] disimpan di lokal:`, err.message);
      return { status: "cached", data: payload };
    }
  },

  getLocalSeedData() {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }

    const today = new Date().toISOString().slice(0, 10);
    const seed = {
      users: [
        {
          email: "istri@nourishtrack.id",
          nama: "Istri",
          jenis_kelamin: "P",
          tanggal_lahir: "1995-08-20",
          tinggi_cm: 160,
          berat_awal_kg: 64.2,
          berat_target_kg: 58.0,
          level_aktivitas: "ringan",
          laju_turun_kg_per_minggu: 0.42,
          bmi: 23.8,
          tdee: 1800,
          target_kalori: 1800,
          air_ml_hari_ini: 1750
        },
        {
          email: "suami@nourishtrack.id",
          nama: "Suami",
          jenis_kelamin: "L",
          tanggal_lahir: "1993-06-15",
          tinggi_cm: 172,
          berat_awal_kg: 78.0,
          berat_target_kg: 70.0,
          level_aktivitas: "sedang",
          laju_turun_kg_per_minggu: 0.5,
          bmi: 26.4,
          tdee: 2580,
          target_kalori: 2030,
          air_ml_hari_ini: 1500
        }
      ],
      logs: [
        { id: "LOG-101", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Sarapan", nama_makanan: "Oatmeal & Chia Seeds", porsi: "1 mangkuk sedang (200g)", kalori: 220, protein_g: 8, lemak_g: 5, karbo_g: 36, sumber: "Pilih dari daftar", dibuat_pada: "07:30" },
        { id: "LOG-102", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Sarapan", nama_makanan: "Pisang Cavendish", porsi: "1 buah utuh (118g)", kalori: 100, protein_g: 1, lemak_g: 0, karbo_g: 25, sumber: "Manual", dibuat_pada: "07:35" },
        { id: "LOG-103", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Makan siang", nama_makanan: "Nasi Merah", porsi: "1 porsi matang (150g)", kalori: 165, protein_g: 4, lemak_g: 1, karbo_g: 35, sumber: "Pilih dari daftar", dibuat_pada: "12:45" },
        { id: "LOG-104", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Makan siang", nama_makanan: "Dada Ayam Sambal Matah", porsi: "Panggang fillet (120g)", kalori: 285, protein_g: 32, lemak_g: 12, karbo_g: 8, sumber: "Foto", dibuat_pada: "12:50" },
        { id: "LOG-105", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Makan siang", nama_makanan: "Tumis Buncis Tempe", porsi: "Minyak kelapa sedikit (75g)", kalori: 70, protein_g: 5, lemak_g: 3, karbo_g: 7, sumber: "Pilih dari daftar", dibuat_pada: "12:52" },
        { id: "LOG-106", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Makan malam", nama_makanan: "Sup Ikan Gurame Bening", porsi: "1 mangkok besar (350ml)", kalori: 350, protein_g: 28, lemak_g: 14, karbo_g: 18, sumber: "Pilih dari daftar", dibuat_pada: "19:15" },
        { id: "LOG-107", email: "istri@nourishtrack.id", tanggal: today, waktu_makan: "Camilan", nama_makanan: "Apel Merah Segar", porsi: "1 potong sedang (110g)", kalori: 57, protein_g: 0, lemak_g: 0, karbo_g: 14, sumber: "Pilih dari daftar", dibuat_pada: "16:10" },
        { id: "LOG-201", email: "suami@nourishtrack.id", tanggal: today, waktu_makan: "Sarapan", nama_makanan: "Telur Rebus (2 butir) & Roti Gandum", porsi: "1 porsi (160g)", kalori: 310, protein_g: 18, lemak_g: 11, karbo_g: 32, sumber: "Pilih dari daftar", dibuat_pada: "07:15" },
        { id: "LOG-202", email: "suami@nourishtrack.id", tanggal: today, waktu_makan: "Makan siang", nama_makanan: "Nasi Putih & Dada Ayam Bakar", porsi: "1 porsi lengkap (280g)", kalori: 510, protein_g: 48, lemak_g: 8, karbo_g: 58, sumber: "Pilih dari daftar", dibuat_pada: "12:30" }
      ],
      foodCatalog: [
        { id: "FD-01", nama_makanan: "Nasi Putih", porsi_default: "1 centong · 100g", kalori: 130, protein_g: 3, lemak_g: 0.3, karbo_g: 28, kategori: "Makanan Indonesia" },
        { id: "FD-02", nama_makanan: "Dada Ayam Fillet Bakar", porsi_default: "1 porsi 150g · P: 46g, L: 4g", kalori: 248, protein_g: 46, lemak_g: 4, karbo_g: 2, kategori: "Tinggi Protein" },
        { id: "FD-03", nama_makanan: "Gado-Gado dg Telur Rebus", porsi_default: "1 porsi sedang · 200g", kalori: 312, protein_g: 14, lemak_g: 16, karbo_g: 28, kategori: "Makanan Indonesia" },
        { id: "FD-04", nama_makanan: "Telur Rebus (1 butir)", porsi_default: "55g · P: 6g, L: 5g", kalori: 74, protein_g: 6, lemak_g: 5, karbo_g: 1, kategori: "Tinggi Protein" },
        { id: "FD-05", nama_makanan: "Nasi Merah", porsi_default: "1 porsi matang · 150g", kalori: 165, protein_g: 4, lemak_g: 1, karbo_g: 35, kategori: "Makanan Indonesia" },
        { id: "FD-06", nama_makanan: "Oatmeal & Chia Seeds", porsi_default: "1 mangkuk sedang · 200g", kalori: 220, protein_g: 8, lemak_g: 5, karbo_g: 36, kategori: "Sering dimakan" },
        { id: "FD-07", nama_makanan: "Sup Ikan Gurame Bening", porsi_default: "1 mangkok besar · 350ml", kalori: 350, protein_g: 28, lemak_g: 14, karbo_g: 18, kategori: "Tinggi Protein" },
        { id: "FD-08", nama_makanan: "Apel Merah Segar", porsi_default: "1 potong sedang · 110g", kalori: 57, protein_g: 0.3, lemak_g: 0.2, karbo_g: 14, kategori: "Sering dimakan" }
      ],
      weightLogs: [
        { id: "W-01", email: "istri@nourishtrack.id", tanggal: "2026-10-13", berat_kg: 65.0, catatan: "Awal program" },
        { id: "W-02", email: "istri@nourishtrack.id", tanggal: "2026-10-20", berat_kg: 64.6, catatan: "Minggu 1" },
        { id: "W-03", email: "istri@nourishtrack.id", tanggal: today, berat_kg: 64.2, catatan: "Pagi hari" },
        { id: "W-04", email: "suami@nourishtrack.id", tanggal: today, berat_kg: 78.0, catatan: "Awal program" }
      ]
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  },

  saveLocalState(stateObj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateObj));
  }
};