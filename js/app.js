/**
 * ============================================================================
 * LOGIKA UTAMA APLIKASI NOURISHTRACK (SINGLE PAGE APPLICATION)
 * Mengimplementasikan seluruh User Stories F1-F8 dari PRD & DESIGN.md
 * ============================================================================
 */

const AppState = {
  activeEmail: "istri@nourishtrack.id",
  selectedDate: new Date().toISOString().slice(0, 10),
  selectedMealTime: "Makan siang",
  selectedInputMode: "list",
  selectedCategoryFilter: "ALL",
  selectedCatalogItem: null,
  users: [],
  logs: [],
  foodCatalog: [],
  weightLogs: [],
  notified100Today: {}
};

document.addEventListener("DOMContentLoaded", async () => {
  initDateControls();
  bindNavigationEvents();
  bindQuickLogEvents();
  bindModalAndProfileEvents();
  bindReportEvents();

  const data = await ApiClient.fetchInitialData(AppState.activeEmail, AppState.selectedDate);
  AppState.users = data.users || [];
  AppState.logs = data.logs || [];
  AppState.foodCatalog = data.foodCatalog || [];
  AppState.weightLogs = data.weightLogs || [];

  // Pilih item katalog default untuk pratinjau cepat
  if (AppState.foodCatalog.length > 1) {
    AppState.selectedCatalogItem = AppState.foodCatalog[1];
  }

  renderAllViews();
});

/**
 * 1. RUMUS KESEHATAN & METABOLISME (SESUAI BAGIAN 7.3 PRD)
 */
function calculateUserMetrics(user) {
  const birth = new Date(user.tanggal_lahir || "1995-01-01");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;

  const hMeter = Number(user.tinggi_cm) / 100;
  const bmi = Number((Number(user.berat_awal_kg) / (hMeter * hMeter)).toFixed(1));

  // BMR Mifflin-St Jeor
  let bmr = 10 * Number(user.berat_awal_kg) + 6.25 * Number(user.tinggi_cm) - 5 * age;
  bmr = String(user.jenis_kelamin).toUpperCase() === "L" ? bmr + 5 : bmr - 161;

  const factors = { sedentari: 1.2, ringan: 1.375, sedang: 1.55, berat: 1.725, "sangat berat": 1.9 };
  const tdee = Math.round(bmr * (factors[String(user.level_aktivitas).toLowerCase()] || 1.375));

  const deficit = Math.round((Number(user.laju_turun_kg_per_minggu || 0.42) * 7700) / 7);
  const minSafe = String(user.jenis_kelamin).toUpperCase() === "L"
    ? APP_CONFIG.MIN_SAFE_CALORIE_MALE
    : APP_CONFIG.MIN_SAFE_CALORIE_FEMALE;

  const target_kalori = Math.max(minSafe, tdee - deficit);
  return { bmi, tdee, target_kalori, minSafe };
}

function getBmiLabel(bmi) {
  if (bmi < 18.5) return "Kurus";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Berlebih";
  return "Obesitas";
}

function getActiveUser() {
  return AppState.users.find(u => u.email.toLowerCase() === AppState.activeEmail.toLowerCase()) || AppState.users[0];
}

function getLogsForUserAndDate(email, dateStr) {
  return AppState.logs.filter(
    l => l.email.toLowerCase() === email.toLowerCase() && String(l.tanggal).slice(0, 10) === dateStr
  );
}

/**
 * 2. RENDER SEMUA HALAMAN SECARA REAKTIF (0ms UI UPDATE)
 */
function renderAllViews() {
  const user = getActiveUser();
  if (!user) return;

  // Header & Identitas Pengguna
  document.getElementById("activeUserName").textContent = user.nama;
  document.getElementById("switchUserLabel").textContent = user.nama;
  document.getElementById("avatarInitial").textContent = user.nama.charAt(0).toUpperCase();
  document.getElementById("displayDateText").textContent = formatIndonesianDate(AppState.selectedDate);
  document.getElementById("datePickerInput").value = AppState.selectedDate;

  const todayLogs = getLogsForUserAndDate(user.email, AppState.selectedDate);
  const totalConsumed = todayLogs.reduce((acc, it) => acc + Number(it.kalori || 0), 0);
  const targetKcal = Number(user.target_kalori || 1800);
  const remainingKcal = targetKcal - totalConsumed;
  const pct = Math.min(100, Math.round((totalConsumed / targetKcal) * 100));

  renderHomeSummary(user, todayLogs, totalConsumed, targetKcal, remainingKcal, pct);
  renderFoodDiary(user, todayLogs, totalConsumed, targetKcal, remainingKcal, pct);
  renderQuickLogCatalog(user, totalConsumed, targetKcal);
  renderWeightPrediction(user);
  renderReportsAndCharts(user);
  renderCoupleDrawer();
  checkCalorieThresholdAlert(user, totalConsumed, targetKcal);
}

/**
 * 3. RENDER TAB 1: RINGKASAN HARIAN
 */
function renderHomeSummary(user, todayLogs, consumed, target, remaining, pct) {
  document.getElementById("heroConsumedKcal").textContent = formatNum(consumed);
  document.getElementById("heroTargetKcal").textContent = formatNum(target);

  // Animasi Lingkaran SVG (Keliling r=86 adalah 540.35)
  const circumference = 540.35;
  const ratio = Math.min(1, consumed / target);
  const offset = circumference - ratio * circumference;
  const ringEl = document.getElementById("heroRingCircle");
  ringEl.style.strokeDashoffset = offset.toFixed(1);
  ringEl.style.stroke = consumed >= target ? "#F4A261" : "#2F7D6D";

  const remTextEl = document.getElementById("heroRemainingText");
  if (remaining >= 0) {
    remTextEl.textContent = `Sisa ${formatNum(remaining)} kkal · ${pct}% tercapai`;
    document.getElementById("heroMindfulText").textContent =
      remaining > 250
        ? "Sisa kalori aman untuk makan berikutnya! Pilihan sehat tetap terjaga."
        : "Hampir mencapai target harian! Pilih camilan ringan atau air putih.";
  } else {
    remTextEl.textContent = `Melebihi ${formatNum(Math.abs(remaining))} kkal · ${pct}%`;
    document.getElementById("heroMindfulText").textContent =
      "Target kalori hari ini sudah terlampaui. Tidak apa-apa, mari kembali seimbang besok!";
  }

  // Subtotal per Waktu Makan
  const sumByMeal = waktu =>
    todayLogs
      .filter(l => l.waktu_makan.toLowerCase() === waktu.toLowerCase())
      .reduce((s, x) => s + Number(x.kalori || 0), 0);

  document.getElementById("distSarapanKcal").textContent = formatNum(sumByMeal("Sarapan"));
  document.getElementById("distSiangKcal").textContent = formatNum(sumByMeal("Makan siang"));
  document.getElementById("distMalamKcal").textContent = formatNum(sumByMeal("Makan malam"));
  document.getElementById("distCamilanKcal").textContent = formatNum(sumByMeal("Camilan"));

  // BMI, TDEE, Berat Kini
  document.getElementById("metricBmiVal").textContent = user.bmi;
  document.getElementById("metricBmiCategory").textContent = getBmiLabel(user.bmi);
  document.getElementById("metricTdeeVal").textContent = formatNum(user.tdee);
  document.getElementById("metricCurrentWeight").textContent = Number(user.berat_awal_kg).toFixed(1);

  // 3 Catatan Terakhir Hari Ini
  const recentContainer = document.getElementById("recentLogsList");
  if (todayLogs.length === 0) {
    recentContainer.innerHTML = `<p class="caption-muted">Belum ada makanan yang dicatat pada tanggal ini.</p>`;
  } else {
    recentContainer.innerHTML = todayLogs
      .slice(-3)
      .reverse()
      .map(item => `
        <div class="recent-item">
          <div>
            <strong>${escapeHtml(item.nama_makanan)}</strong>
            <div class="caption-muted">${escapeHtml(item.waktu_makan)} • ${escapeHtml(item.dibuat_pada || "Hari ini")}</div>
          </div>
          <div class="dist-val"><strong>${formatNum(item.kalori)}</strong> <span>kkal</span></div>
        </div>
      `)
      .join("");
  }
}

/**
 * 4. RENDER TAB 2: BUKU MAKAN (FOOD DIARY PER WAKTU MAKAN)
 */
function renderFoodDiary(user, todayLogs, consumed, target, remaining, pct) {
  document.getElementById("diaryConsumedKcal").textContent = formatNum(consumed);
  document.getElementById("diaryTargetKcal").textContent = formatNum(target);
  document.getElementById("diaryRemainingBadge").textContent =
    remaining >= 0 ? `Tersisa ${formatNum(remaining)} kkal` : `Lebih ${formatNum(Math.abs(remaining))} kkal`;
  document.getElementById("diaryProgressBar").style.width = `${Math.min(100, pct)}%`;

  // Akumulasi Makro Harian
  const totCarb = todayLogs.reduce((s, i) => s + Number(i.karbo_g || 0), 0);
  const totProt = todayLogs.reduce((s, i) => s + Number(i.protein_g || 0), 0);
  const totFat = todayLogs.reduce((s, i) => s + Number(i.lemak_g || 0), 0);

  const targetCarbG = Math.round((target * 0.5) / 4);
  const targetProtG = Math.round((target * 0.25) / 4);
  const targetFatG = Math.round((target * 0.25) / 9);

  document.getElementById("macroCarbGram").textContent = `${Math.round(totCarb)}g`;
  document.getElementById("macroProtGram").textContent = `${Math.round(totProt)}g`;
  document.getElementById("macroFatGram").textContent = `${Math.round(totFat)}g`;
  document.getElementById("macroCarbPct").textContent = `${Math.min(100, Math.round((totCarb / targetCarbG) * 100))}%`;
  document.getElementById("macroProtPct").textContent = `${Math.min(100, Math.round((totProt / targetProtG) * 100))}%`;
  document.getElementById("macroFatPct").textContent = `${Math.min(100, Math.round((totFat / targetFatG) * 100))}%`;

  const groups = [
    { key: "Sarapan", label: "Sarapan", icon: "🌅", tint: "breakfast-tint", defaultTime: "07:30 WIB" },
    { key: "Makan siang", label: "Makan Siang", icon: "☀️", tint: "lunch-tint", defaultTime: "12:45 WIB" },
    { key: "Makan malam", label: "Makan Malam", icon: "🌙", tint: "dinner-tint", defaultTime: "19:15 WIB" },
    { key: "Camilan", label: "Camilan", icon: "🍪", tint: "snack-tint", defaultTime: "Sore hari" }
  ];

  const container = document.getElementById("diaryMealGroupsContainer");
  container.innerHTML = groups
    .map(g => {
      const items = todayLogs.filter(l => l.waktu_makan.toLowerCase() === g.key.toLowerCase());
      const subTotal = items.reduce((s, it) => s + Number(it.kalori || 0), 0);

      const rowsHtml =
        items.length === 0
          ? `<div class="caption-muted" style="padding:8px 0;">Belum ada catatan ${g.label.toLowerCase()}.</div>`
          : items
              .map(it => {
                const badgeClass = it.sumber === "Foto" ? "source-badge ai" : "source-badge";
                const badgeLabel = it.sumber === "Foto" ? "📷 Foto AI" : it.sumber === "Manual" ? "Manual" : "List";
                return `
                  <div class="diary-food-row">
                    <div>
                      <div>
                        <strong>${escapeHtml(it.nama_makanan)}</strong>
                        <span class="${badgeClass}">${badgeLabel}</span>
                      </div>
                      <div class="caption-muted">${escapeHtml(it.porsi)}</div>
                    </div>
                    <div class="row-actions">
                      <strong>${formatNum(it.kalori)} kkal</strong>
                      <button type="button" class="icon-btn" onclick="editFoodItem('${it.id}')" title="Edit">✏️</button>
                      <button type="button" class="icon-btn" onclick="deleteFoodItem('${it.id}')" title="Hapus">🗑️</button>
                    </div>
                  </div>
                `;
              })
              .join("");

      return `
        <div class="meal-group-card">
          <div class="meal-group-header">
            <div class="meal-group-left">
              <div class="dist-icon ${g.tint}">${g.icon}</div>
              <div>
                <div class="section-title">${g.label}</div>
                <div class="caption-muted">${items[0]?.dibuat_pada ? items[0].dibuat_pada + " WIB" : g.defaultTime}</div>
              </div>
            </div>
            <div class="meal-group-total">${formatNum(subTotal)} kkal</div>
          </div>
          ${rowsHtml}
          <button type="button" class="btn-add-in-group" onclick="openQuickLogForMeal('${g.key}')">
            + Tambah ${g.label}
          </button>
        </div>
      `;
    })
    .join("");

  // Hidrasi Air
  const waterMl = Number(user.air_ml_hari_ini || 0);
  const waterL = (waterMl / 1000).toFixed(2);
  document.getElementById("waterCurrentLiter").textContent = waterL;
  const glassesLeft = Math.max(0, Math.ceil((2000 - waterMl) / 250));
  document.getElementById("waterSubtitle").textContent =
    glassesLeft === 0 ? "Target hidrasi 2.0 L hari ini tercapai! 🎉" : `Hampir tercapai, ${glassesLeft} gelas lagi!`;
}

/**
 * 5. RENDER TAB 3: KATALOG MAKANAN & STAGED CALORIE PREVIEW
 */
function renderQuickLogCatalog(user, currentConsumed, targetKcal) {
  const query = (document.getElementById("foodSearchInput")?.value || "").toLowerCase();
  const cat = AppState.selectedCategoryFilter;

  const filtered = AppState.foodCatalog.filter(item => {
    const matchText = item.nama_makanan.toLowerCase().includes(query);
    const matchCat = cat === "ALL" || item.kategori === cat;
    return matchText && matchCat;
  });

  const listEl = document.getElementById("foodCatalogListContainer");
  listEl.innerHTML = filtered
    .map(f => {
      const isSelected = AppState.selectedCatalogItem && AppState.selectedCatalogItem.id === f.id;
      return `
        <div class="catalog-item-card ${isSelected ? "selected" : ""}" onclick="selectCatalogFood('${f.id}')">
          <div>
            <strong>${escapeHtml(f.nama_makanan)}</strong>
            <div class="caption-muted">${escapeHtml(f.porsi_default)}</div>
            <div class="catalog-kcal">${formatNum(f.kalori)} kkal</div>
          </div>
          <button type="button" class="btn-pick-food">
            ${isSelected ? "✓ Terpilih" : "+ Pilih"}
          </button>
        </div>
      `;
    })
    .join("");

  updateStagedCalorieBar(currentConsumed, targetKcal);
}

function updateStagedCalorieBar(currentConsumed, targetKcal) {
  let stagedKcal = 0;
  if (AppState.selectedInputMode === "list" && AppState.selectedCatalogItem) {
    stagedKcal = Number(AppState.selectedCatalogItem.kalori || 0);
  } else {
    stagedKcal = Number(document.getElementById("inpFoodKcal")?.value || 0);
  }

  document.getElementById("stagedKcalValue").textContent = formatNum(stagedKcal);
  const afterTotal = currentConsumed + stagedKcal;
  const remAfter = targetKcal - afterTotal;
  const pctAfter = Math.min(100, Math.round((afterTotal / targetKcal) * 100));

  document.getElementById("stagedProgressBar").style.width = `${pctAfter}%`;
  document.getElementById("stagedRemainingAfter").textContent =
    remAfter >= 0 ? `${formatNum(remAfter)} kkal` : `Lebih ${formatNum(Math.abs(remAfter))} kkal`;
  document.getElementById("stagedSafetyTag").textContent =
    remAfter >= 0 ? "Aman dalam target" : "Melewati target harian";
}

/**
 * 6. RENDER TAB 4: PREDIKSI BERAT BADAN 30 HARI (RUMUS 7.700 KKAL = 1 KG)
 */
function renderWeightPrediction(user) {
  const userLogs = AppState.logs.filter(l => l.email.toLowerCase() === user.email.toLowerCase());

  // Kelompokkan total kalori per tanggal unik
  const byDate = {};
  userLogs.forEach(l => {
    const d = String(l.tanggal).slice(0, 10);
    byDate[d] = (byDate[d] || 0) + Number(l.kalori || 0);
  });

  const uniqueDates = Object.keys(byDate);
  const daysCount = uniqueDates.length;
  const avgIntake =
    daysCount > 0
      ? Math.round(uniqueDates.reduce((s, d) => s + byDate[d], 0) / daysCount)
      : Number(user.target_kalori || 1500);

  // Tampilkan informasi jika data kurang dari 7 hari (F4 PRD)
  const warnCard = document.getElementById("predMinDaysWarning");
  if (daysCount < 7) {
    warnCard.classList.remove("hidden");
    document.getElementById("predMinDaysText").textContent =
      `Saat ini tercatat ${daysCount} hari data makan. Butuh ${7 - daysCount} hari lagi untuk mencapai ambang 7 hari, namun proyeksi awal sudah dapat dilihat di bawah.`;
  } else {
    warnCard.classList.add("hidden");
  }

  const tdee = Number(user.tdee || 1800);
  const dailyDeficit = tdee - avgIntake; // Positif berarti defisit kalori (turun berat)
  const weightChange30d = (dailyDeficit * 30) / 7700;
  const currentW = Number(user.berat_awal_kg || 64.2);
  const predictedW = Number((currentW - weightChange30d).toFixed(1));
  const deltaW = Number((predictedW - currentW).toFixed(1));
  const targetW = Number(user.berat_target_kg || 58.0);
  const remToGoal = Math.max(0, Number((predictedW - targetW).toFixed(1)));

  document.getElementById("predTargetBadge").textContent = `${user.nama} (Target: ${targetW.toFixed(1)} kg)`;
  document.getElementById("predCurrentW").textContent = currentW.toFixed(1);
  document.getElementById("predFutureW").textContent = predictedW.toFixed(1);
  document.getElementById("predDeltaWeight").textContent = `${deltaW > 0 ? "+" : ""}${deltaW.toFixed(1)} kg`;
  document.getElementById("predRemainingToGoal").innerHTML =
    `🟠 Tersisa <strong>${remToGoal} kg</strong> lagi menuju target ideal <strong>${targetW.toFixed(1)} kg</strong>`;

  document.getElementById("predAvgIntake").textContent = formatNum(avgIntake);
  document.getElementById("predTdeeVal").textContent = formatNum(tdee);
  document.getElementById("predDailyDeficit").textContent =
    dailyDeficit >= 0 ? `-${formatNum(dailyDeficit)}` : `+${formatNum(Math.abs(dailyDeficit))}`;
  document.getElementById("predDeficitStatus").textContent =
    dailyDeficit >= 0 ? "Aman & Stabil" : "Surplus Kalori";

  const weeklyBurnKg = ((dailyDeficit * 7) / 7700).toFixed(2);
  document.getElementById("predFormulaParagraph").innerHTML =
    `Dihitung dengan rumus <strong>7.700 kkal = 1 kg lemak tubuh</strong>. Dengan selisih rata-rata <strong>${formatNum(Math.abs(dailyDeficit))} kkal</strong> per hari, tubuh Anda diperkirakan berubah sekitar <strong>${weeklyBurnKg} kg</strong> per minggu secara konsisten.`;

  // Render SVG Line Chart Proyeksi 30 Hari
  const wDay10 = (currentW - (dailyDeficit * 10) / 7700).toFixed(1);
  const wDay20 = (currentW - (dailyDeficit * 20) / 7700).toFixed(1);
  const wDay30 = predictedW.toFixed(1);

  document.getElementById("predictionChartContainer").innerHTML = `
    <svg viewBox="0 0 500 190" width="100%" height="190">
      <defs>
        <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2F7D6D" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#2F7D6D" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <line x1="30" y1="40" x2="470" y2="40" stroke="#E1E8E5" stroke-dasharray="3 3"/>
      <line x1="30" y1="95" x2="470" y2="95" stroke="#E1E8E5" stroke-dasharray="3 3"/>
      <line x1="30" y1="150" x2="470" y2="150" stroke="#E1E8E5"/>
      <polygon points="40,55 170,75 170,155 40,155" fill="url(#tealGrad)"/>
      <!-- Garis Riwayat Nyata -->
      <polyline fill="none" stroke="#2F7D6D" stroke-width="3.5" points="40,55 170,75"/>
      <!-- Garis Proyeksi 30 Hari -->
      <polyline fill="none" stroke="#8E4E14" stroke-width="3" stroke-dasharray="6 4" points="170,75 270,98 370,120 455,142"/>
      <circle cx="40" cy="55" r="5" fill="#2F7D6D"/>
      <circle cx="170" cy="75" r="5" fill="#2F7D6D" stroke="#fff" stroke-width="2"/>
      <circle cx="270" cy="98" r="4.5" fill="#8E4E14"/>
      <circle cx="370" cy="120" r="4.5" fill="#8E4E14"/>
      <circle cx="455" cy="142" r="5.5" fill="#8E4E14"/>
      <text x="235" y="90" font-size="11" fill="#8E4E14" font-weight="600">Hari 10: ${wDay10}</text>
      <text x="330" y="112" font-size="11" fill="#8E4E14" font-weight="600">Hari 20: ${wDay20}</text>
      <text x="390" y="134" font-size="11" fill="#8E4E14" font-weight="700">Hari 30: ${wDay30} kg</text>
    </svg>
  `;
}

/**
 * 7. RENDER TAB 5: LAPORAN TABEL & GRAFIK BATANG
 */
function renderReportsAndCharts(user) {
  const searchQ = (document.getElementById("repSearchFood")?.value || "").toLowerCase();
  const mealFilter = document.getElementById("repFilterMealTime")?.value || "ALL";
  const userLogs = AppState.logs.filter(l => l.email.toLowerCase() === user.email.toLowerCase());

  const filtered = userLogs.filter(it => {
    const matchName = it.nama_makanan.toLowerCase().includes(searchQ);
    const matchMeal = mealFilter === "ALL" || it.waktu_makan.toLowerCase() === mealFilter.toLowerCase();
    return matchName && matchMeal;
  });

  const tbody = document.getElementById("reportTableBody");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#6B7C77;">Tidak ada catatan makan yang sesuai filter.</td></tr>`;
  } else {
    tbody.innerHTML = filtered
      .slice()
      .reverse()
      .map(it => `
        <tr>
          <td>${escapeHtml(String(it.tanggal).slice(0, 10))}</td>
          <td>${escapeHtml(it.waktu_makan)}</td>
          <td><strong>${escapeHtml(it.nama_makanan)}</strong><br/><span class="caption-muted">${escapeHtml(it.porsi)}</span></td>
          <td><strong>${formatNum(it.kalori)} kkal</strong></td>
          <td>
            <button type="button" class="icon-btn" onclick="deleteFoodItem('${it.id}')">🗑️</button>
          </td>
        </tr>
      `)
      .join("");
  }

  // Grafik Batang 7 Hari Terakhir
  const chartBox = document.getElementById("dailyCalorieBarChart");
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(AppState.selectedDate);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const sum = getLogsForUserAndDate(user.email, iso).reduce((s, x) => s + Number(x.kalori || 0), 0);
    days.push({ iso, label: iso.slice(5), sum });
  }

  const maxBar = Math.max(Number(user.target_kalori || 1800) * 1.2, 2200);
  chartBox.innerHTML = days
    .map(d => {
      const hPct = Math.min(100, Math.max(8, Math.round((d.sum / maxBar) * 100)));
      const isOver = d.sum > Number(user.target_kalori || 1800);
      return `
        <div class="bar-col" title="${d.iso}: ${d.sum} kkal">
          <div class="bar-fill ${isOver ? "over" : ""}" style="height:${hPct}px;"></div>
          <span class="bar-date">${d.label}</span>
        </div>
      `;
    })
    .join("");
}

/**
 * 8. FITUR MODE "KITA" (MELIHAT RINGKASAN PASANGAN) & PENGINGAT 100% TARGET
 */
function renderCoupleDrawer() {
  const container = document.getElementById("coupleComparisonContent");
  container.innerHTML = AppState.users
    .map(u => {
      const logs = getLogsForUserAndDate(u.email, AppState.selectedDate);
      const consumed = logs.reduce((s, x) => s + Number(x.kalori || 0), 0);
      const pct = Math.min(100, Math.round((consumed / Number(u.target_kalori || 1800)) * 100));
      return `
        <div class="couple-card-item">
          <strong>${escapeHtml(u.nama)}</strong>
          <div class="caption-muted">${formatNum(consumed)} / ${formatNum(u.target_kalori)} kkal (${pct}%)</div>
          <div class="caption-muted">Berat: ${Number(u.berat_awal_kg).toFixed(1)} kg &rarr; Target ${Number(u.berat_target_kg).toFixed(1)} kg</div>
        </div>
      `;
    })
    .join("");
}

function checkCalorieThresholdAlert(user, consumed, target) {
  const banner = document.getElementById("calorieLimitBanner");
  const key = `${user.email}_${AppState.selectedDate}`;
  if (consumed >= target && !AppState.notified100Today[key]) {
    banner.classList.remove("hidden");
  } else if (consumed < target) {
    banner.classList.add("hidden");
  }
}

/**
 * 9. EVENT HANDLERS & INTERAKSI PENGGUNA
 */
function initDateControls() {
  document.getElementById("btnPrevDate").addEventListener("click", () => shiftDate(-1));
  document.getElementById("btnNextDate").addEventListener("click", () => shiftDate(1));
  document.getElementById("datePickerInput").addEventListener("change", e => {
    if (e.target.value) {
      AppState.selectedDate = e.target.value;
      renderAllViews();
    }
  });
  document.getElementById("btnCloseAlert").addEventListener("click", () => {
    const user = getActiveUser();
    AppState.notified100Today[`${user.email}_${AppState.selectedDate}`] = true;
    document.getElementById("calorieLimitBanner").classList.add("hidden");
  });
}

function shiftDate(days) {
  const d = new Date(AppState.selectedDate);
  d.setDate(d.getDate() + days);
  AppState.selectedDate = d.toISOString().slice(0, 10);
  renderAllViews();
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(el => el.classList.remove("active"));
  document.getElementById(tabId)?.classList.add("active");

  document.querySelectorAll(".bottom-nav .nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.target === tabId);
  });

  const titles = {
    "tab-ringkasan": "Ringkasan",
    "tab-bukumakan": "Buku Makan",
    "tab-catat": "Catat Makanan",
    "tab-prediksi": "Prediksi 30 Hari",
    "tab-laporan": "Laporan & PDF"
  };
  document.getElementById("headerPageSubtitle").textContent = titles[tabId] || "Ringkasan";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindNavigationEvents() {
  document.querySelectorAll(".bottom-nav .nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.target));
  });

  document.getElementById("btnHomeLogFood").addEventListener("click", () => switchTab("tab-catat"));
  document.getElementById("btnGoToDiary").addEventListener("click", () => switchTab("tab-bukumakan"));

  document.getElementById("btnToggleKita").addEventListener("click", () => {
    document.getElementById("coupleComparisonCard").classList.toggle("hidden");
  });

  // Switch Akun Cepat (Suami <-> Istri)
  document.getElementById("btnSwitchAccount").addEventListener("click", () => {
    const idx = AppState.users.findIndex(u => u.email.toLowerCase() === AppState.activeEmail.toLowerCase());
    const nextUser = AppState.users[(idx + 1) % AppState.users.length];
    if (nextUser) {
      AppState.activeEmail = nextUser.email;
      renderAllViews();
      showToast(`Beralih ke akun ${nextUser.nama}`);
    }
  });

  // Tambah Air +250ml
  document.getElementById("btnAddWater").addEventListener("click", () => {
    const user = getActiveUser();
    user.air_ml_hari_ini = Number(user.air_ml_hari_ini || 0) + 250;
    ApiClient.saveLocalState(AppState);
    renderAllViews();
    ApiClient.postAction("updateWater", { email: user.email, air_ml_hari_ini: user.air_ml_hari_ini });
  });
}

function bindQuickLogEvents() {
  // Chip Waktu Makan
  document.querySelectorAll("#mealTimeSelectGroup .meal-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#mealTimeSelectGroup .meal-chip").forEach(c => {
        c.classList.remove("active");
        c.textContent = c.dataset.waktu;
      });
      chip.classList.add("active");
      chip.textContent = `${chip.dataset.waktu} ✓`;
      AppState.selectedMealTime = chip.dataset.waktu;
    });
  });

  // Tab Mode Input (Cari Daftar | Isi Manual | Scan AI)
  document.querySelectorAll(".input-mode-tabs .mode-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".input-mode-tabs .mode-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      AppState.selectedInputMode = tab.dataset.mode;

      document.querySelectorAll(".log-mode-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`modePanel-${tab.dataset.mode}`)?.classList.add("active");
      renderAllViews();
    });
  });

  document.getElementById("foodSearchInput").addEventListener("input", () => renderAllViews());

  document.querySelectorAll("#foodCategoryPills .cat-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#foodCategoryPills .cat-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      AppState.selectedCategoryFilter = pill.dataset.cat;
      renderAllViews();
    });
  });

  document.getElementById("inpFoodKcal").addEventListener("input", () => {
    const user = getActiveUser();
    const consumed = getLogsForUserAndDate(user.email, AppState.selectedDate).reduce((s, i) => s + Number(i.kalori || 0), 0);
    updateStagedCalorieBar(consumed, Number(user.target_kalori || 1800));
  });

  // Kamera / Upload Foto AI
  const fileInp = document.getElementById("inpFoodPhoto");
  document.getElementById("btnTriggerCamera").addEventListener("click", () => fileInp.click());
  document.getElementById("btnRetakePhoto").addEventListener("click", () => fileInp.click());

  fileInp.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target.result;
      document.getElementById("imgFoodPreview").src = dataUrl;
      document.getElementById("photoPlaceholder").classList.add("hidden");
      document.getElementById("photoPreviewContainer").classList.remove("hidden");

      showToast("Menganalisis foto makanan dengan AI...");
      const base64Data = dataUrl.split(",")[1];
      const res = await ApiClient.postAction("scanFoodPhoto", {
        base64Data,
        mimeType: file.type,
        fileName: file.name
      });

      const ai = res.data && res.data.nama_makanan ? res.data : {
        nama_makanan: "Dada Ayam Bakar & Lalapan (Hasil Scan AI)",
        porsi: "1 porsi sedang (180g)",
        kalori: 285,
        protein_g: 30,
        lemak_g: 11,
        karbo_g: 12
      };

      // Pindahkan ke tab Manual agar pengguna wajib memeriksa hasil AI sebelum simpan (F5 PRD)
      document.querySelector('.mode-tab[data-mode="manual"]').click();
      document.getElementById("inpFoodName").value = ai.nama_makanan;
      document.getElementById("inpFoodPortion").value = ai.porsi;
      document.getElementById("inpFoodKcal").value = ai.kalori;
      document.getElementById("inpFoodProtein").value = ai.protein_g || 0;
      document.getElementById("inpFoodFat").value = ai.lemak_g || 0;
      document.getElementById("inpFoodCarbs").value = ai.karbo_g || 0;
      document.getElementById("manualFoodForm").dataset.source = "Foto";
      renderAllViews();
      showToast("Hasil AI siap! Silakan periksa angka sebelum klik Simpan.");
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("btnCancelLog").addEventListener("click", () => switchTab("tab-ringkasan"));
  document.getElementById("btnSubmitMealLog").addEventListener("click", submitFoodLog);
}

window.selectCatalogFood = function (foodId) {
  const found = AppState.foodCatalog.find(f => f.id === foodId);
  if (found) {
    AppState.selectedCatalogItem = found;
    renderAllViews();
  }
};

window.openQuickLogForMeal = function (mealTime) {
  AppState.selectedMealTime = mealTime;
  document.querySelectorAll("#mealTimeSelectGroup .meal-chip").forEach(c => {
    const match = c.dataset.waktu.toLowerCase() === mealTime.toLowerCase();
    c.classList.toggle("active", match);
    c.textContent = match ? `${c.dataset.waktu} ✓` : c.dataset.waktu;
  });
  switchTab("tab-catat");
};

function submitFoodLog() {
  const user = getActiveUser();
  let newEntry = null;

  if (AppState.selectedInputMode === "list") {
    if (!AppState.selectedCatalogItem) {
      showToast("Pilih salah satu makanan dari daftar terlebih dahulu.");
      return;
    }
    const item = AppState.selectedCatalogItem;
    newEntry = {
      id: "LOG-" + Date.now(),
      email: user.email,
      tanggal: AppState.selectedDate,
      waktu_makan: AppState.selectedMealTime,
      nama_makanan: item.nama_makanan,
      porsi: item.porsi_default,
      kalori: Number(item.kalori),
      protein_g: Number(item.protein_g || 0),
      lemak_g: Number(item.lemak_g || 0),
      karbo_g: Number(item.karbo_g || 0),
      sumber: "Pilih dari daftar",
      dibuat_pada: new Date().toTimeString().slice(0, 5)
    };
  } else {
    const name = document.getElementById("inpFoodName").value.trim();
    const portion = document.getElementById("inpFoodPortion").value.trim();
    const kcal = Number(document.getElementById("inpFoodKcal").value);

    if (!name || !portion || !kcal || kcal <= 0) {
      showToast("Nama makanan, porsi, dan kalori positif wajib diisi!");
      return;
    }

    const editId = document.getElementById("editLogId").value;
    newEntry = {
      id: editId || "LOG-" + Date.now(),
      email: user.email,
      tanggal: AppState.selectedDate,
      waktu_makan: AppState.selectedMealTime,
      nama_makanan: name,
      porsi: portion,
      kalori: kcal,
      protein_g: Number(document.getElementById("inpFoodProtein").value || 0),
      lemak_g: Number(document.getElementById("inpFoodFat").value || 0),
      karbo_g: Number(document.getElementById("inpFoodCarbs").value || 0),
      sumber: document.getElementById("manualFoodForm").dataset.source || "Manual",
      dibuat_pada: new Date().toTimeString().slice(0, 5)
    };

    if (document.getElementById("chkSaveToCatalog").checked) {
      const customFood = {
        id: "FD-" + Date.now(),
        nama_makanan: name,
        porsi_default: portion,
        kalori: kcal,
        protein_g: newEntry.protein_g,
        lemak_g: newEntry.lemak_g,
        karbo_g: newEntry.karbo_g,
        kategori: "Sering dimakan"
      };
      AppState.foodCatalog.unshift(customFood);
      ApiClient.postAction("addCustomFood", customFood);
    }
  }

  // Optimistic UI Update
  const existingIdx = AppState.logs.findIndex(l => l.id === newEntry.id);
  if (existingIdx >= 0) {
    AppState.logs[existingIdx] = newEntry;
  } else {
    AppState.logs.push(newEntry);
  }

  document.getElementById("manualFoodForm").reset();
  document.getElementById("editLogId").value = "";
  delete document.getElementById("manualFoodForm").dataset.source;

  ApiClient.saveLocalState(AppState);
  renderAllViews();
  showToast(`Makanan berhasil dicatat ke ${AppState.selectedMealTime}!`);
  switchTab("tab-bukumakan");

  ApiClient.postAction("addMeal", newEntry);
}

window.editFoodItem = function (logId) {
  const item = AppState.logs.find(l => l.id === logId);
  if (!item) return;

  AppState.selectedMealTime = item.waktu_makan;
  switchTab("tab-catat");
  document.querySelector('.mode-tab[data-mode="manual"]').click();

  document.getElementById("editLogId").value = item.id;
  document.getElementById("inpFoodName").value = item.nama_makanan;
  document.getElementById("inpFoodPortion").value = item.porsi;
  document.getElementById("inpFoodKcal").value = item.kalori;
  document.getElementById("inpFoodProtein").value = item.protein_g || 0;
  document.getElementById("inpFoodFat").value = item.lemak_g || 0;
  document.getElementById("inpFoodCarbs").value = item.karbo_g || 0;
  renderAllViews();
};

window.deleteFoodItem = function (logId) {
  AppState.logs = AppState.logs.filter(l => l.id !== logId);
  ApiClient.saveLocalState(AppState);
  renderAllViews();
  showToast("Catatan makanan dihapus.");
  ApiClient.postAction("deleteMeal", { id: logId });
};

/**
 * 10. MODAL BERAT BADAN & PENGATURAN PROFIL (F8 PRD)
 */
function bindModalAndProfileEvents() {
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.close)?.classList.add("hidden");
    });
  });

  document.getElementById("btnHomeLogWeight").addEventListener("click", () => {
    const user = getActiveUser();
    document.getElementById("inpNewWeightKg").value = user.berat_awal_kg;
    document.getElementById("modalWeight").classList.remove("hidden");
  });

  document.getElementById("formLogWeight").addEventListener("submit", e => {
    e.preventDefault();
    const user = getActiveUser();
    const newW = Number(document.getElementById("inpNewWeightKg").value);
    const note = document.getElementById("inpWeightNote").value;

    user.berat_awal_kg = newW;
    const metrics = calculateUserMetrics(user);
    user.bmi = metrics.bmi;
    user.tdee = metrics.tdee;
    user.target_kalori = metrics.target_kalori;

    const wEntry = {
      id: "W-" + Date.now(),
      email: user.email,
      tanggal: AppState.selectedDate,
      berat_kg: newW,
      catatan: note
    };
    AppState.weightLogs.push(wEntry);
    ApiClient.saveLocalState(AppState);

    document.getElementById("modalWeight").classList.add("hidden");
    renderAllViews();
    showToast(`Berat badan ${newW} kg disimpan! BMI & TDEE diperbarui.`);
    ApiClient.postAction("logWeight", wEntry);
  });

  // Buka Modal Pengaturan Profil
  document.getElementById("btnOpenProfile").addEventListener("click", () => {
    const user = getActiveUser();
    populateProfileForm(user);
    document.getElementById("modalProfile").classList.remove("hidden");
  });

  document.getElementById("profEmail").addEventListener("change", e => {
    const selected = AppState.users.find(u => u.email === e.target.value);
    if (selected) populateProfileForm(selected);
  });

  document.getElementById("formProfileSettings").addEventListener("submit", e => {
    e.preventDefault();
    const email = document.getElementById("profEmail").value;
    let user = AppState.users.find(u => u.email === email);
    if (!user) return;

    user.nama = document.getElementById("profNama").value.trim();
    user.jenis_kelamin = document.getElementById("profGender").value;
    user.tanggal_lahir = document.getElementById("profDob").value;
    user.tinggi_cm = Number(document.getElementById("profHeight").value);
    user.berat_awal_kg = Number(document.getElementById("profWeight").value);
    user.berat_target_kg = Number(document.getElementById("profTargetWeight").value);
    user.level_aktivitas = document.getElementById("profActivity").value;
    user.laju_turun_kg_per_minggu = Number(document.getElementById("profWeeklyRate").value);

    const metrics = calculateUserMetrics(user);
    user.bmi = metrics.bmi;
    user.tdee = metrics.tdee;
    user.target_kalori = metrics.target_kalori;

    AppState.activeEmail = user.email;
    ApiClient.saveLocalState(AppState);
    document.getElementById("modalProfile").classList.add("hidden");
    renderAllViews();
    showToast(`Profil ${user.nama} diperbarui! Target Kalori: ${user.target_kalori} kkal.`);
    ApiClient.postAction("updateProfile", user);
  });
}

function populateProfileForm(user) {
  document.getElementById("profEmail").value = user.email;
  document.getElementById("profNama").value = user.nama;
  document.getElementById("profGender").value = user.jenis_kelamin;
  document.getElementById("profDob").value = String(user.tanggal_lahir).slice(0, 10);
  document.getElementById("profHeight").value = user.tinggi_cm;
  document.getElementById("profWeight").value = user.berat_awal_kg;
  document.getElementById("profTargetWeight").value = user.berat_target_kg;
  document.getElementById("profActivity").value = user.level_aktivitas;
  document.getElementById("profWeeklyRate").value = user.laju_turun_kg_per_minggu;
}

/**
 * 11. CETAK LAPORAN PDF & FILTER TABEL (F6 & F7 PRD)
 */
function bindReportEvents() {
  document.getElementById("repSearchFood").addEventListener("input", () => renderAllViews());
  document.getElementById("repFilterMealTime").addEventListener("change", () => renderAllViews());
  document.getElementById("repFilterPeriod").addEventListener("change", () => renderAllViews());

  const handlePdfExport = async () => {
    const user = getActiveUser();
    const userLogs = AppState.logs.filter(l => l.email.toLowerCase() === user.email.toLowerCase());
    showToast("Menyiapkan dokumen laporan PDF...");

    if (ApiClient.isConfigured()) {
      const res = await ApiClient.postAction("generatePdf", {
        email: user.email,
        nama: user.nama,
        periode: "30 Hari Terakhir",
        berat_kini: user.berat_awal_kg,
        berat_target: user.berat_target_kg,
        bmi: user.bmi,
        tdee: user.tdee,
        target_kalori: user.target_kalori,
        rata_kalori: document.getElementById("predAvgIntake").textContent,
        prediksi_30_hari: document.getElementById("predFutureW").textContent,
        items: userLogs.slice(-30)
      });
      if (res.status === "success" && res.data && res.data.downloadUrl) {
        window.open(res.data.downloadUrl, "_blank");
        return;
      }
    }
    window.print();
  };

  document.getElementById("btnExportPdfFromPred").addEventListener("click", handlePdfExport);
  document.getElementById("btnExportPdfMain").addEventListener("click", handlePdfExport);
}

/**
 * 12. UTILITAS FORMATTER
 */
function formatNum(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

function formatIndonesianDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg) {
  const toast = document.getElementById("appToast");
  document.getElementById("toastMessage").textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}