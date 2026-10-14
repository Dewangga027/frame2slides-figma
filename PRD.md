# PRD — Frame2Slides

Tanggal: 15 Oktober 2026  
Status: Baseline keputusan D01–D16 dan OQ06/OQ07/OQ09/OQ10 disetujui; OQ08 benchmark pending; OQ11 open  
Produk: Plugin Figma privat untuk ekspor PDF dan PowerPoint (.pptx)

## Dasar spesifikasi dan batas bukti

Dokumen ini mengikuti struktur skill mattpocock `/to-spec`, dengan tambahan scope MVP, kontrak perilaku, acceptance criteria, dan open questions. Deliverable berupa dokumen lokal sesuai permintaan; tidak dipublikasikan ke issue tracker.

Sumber: permintaan pengguna pada chat Codex ini dan percakapan **Membuat Plugin Figma Pribadi**, ID `6acf64bb-273c-83ec-bb55-b0fbff687aaf`. Pengambilan percakapan mengembalikan lima turn pengguna dan tidak menyediakan halaman lebih lama. Isi jawaban asisten hanya berupa penanda referensi. Karena itu dokumen ini **belum merupakan ekstraksi terverifikasi dari seluruh diskusi asli**.

Pesan sumber yang dapat dibaca mengonfirmasi Smart Hybrid Conversion, Fixed Layout untuk nested Auto Layout, Select Frames + Drag & Drop, dan penggantian JPEG dengan PNG. Permintaan terbaru secara eksplisit mengunci keputusan tambahan di bawah. Detail operasional yang telah disetujui pada 15 Oktober 2026 dicatat sebagai **baseline approved**; rincian lain tetap **usulan spesifikasi**, bukan persetujuan historis. Bila berbeda dengan diskusi asli yang belum dapat dibaca, perlu direkonsiliasi.

## Problem Statement

Pengguna ingin memindahkan desain presentasi dari Figma ke PowerPoint dan PDF tanpa menyusun ulang slide secara manual. Ekspor harus menjaga tampilan dan urutan tumpukan objek, sekaligus mempertahankan kemampuan mengedit teks serta bentuk sederhana di PowerPoint. Desain dengan Auto Layout bertingkat dan efek kompleks memerlukan konversi yang mengutamakan visual fidelity tanpa mengubah dokumen sumber atau mengirim desain ke layanan eksternal.

## Solution

Frame2Slides menyediakan alur memilih frame, menyusun urutan slide lewat drag & drop, memeriksa hasil konversi, dan mengunduh PPTX atau PDF. Smart Hybrid Conversion mengubah objek yang dapat direpresentasikan dengan baik menjadi objek native PowerPoint; objek atau area yang tidak dapat dipertahankan tampilannya dirasterisasi sebagai PNG lossless ber-alpha, dengan skala default 2x.

PPTX memakai posisi dan ukuran akhir yang terhitung di Figma. Nested Auto Layout diekspor sebagai Fixed Layout: objek tetap dapat diedit jika mendukung konversi native, tetapi tidak membawa mekanisme reflow Auto Layout. PDF menjadi keluaran visual dari frame yang sama; editability native diwajibkan pada PPTX, bukan PDF.

## Keputusan terkunci

| ID | Keputusan | Implikasi |
| --- | --- | --- |
| D01 | Plugin Figma privat | Tidak mensyaratkan publikasi di Figma Community. |
| D02 | Select Frames + Drag & Drop | Pilihan frame menjadi daftar slide; urutan daftar menentukan urutan keluaran. |
| D03 | Smart Hybrid Conversion | Konversi native jika fidelity memadai; raster fallback untuk representasi kompleks. |
| D04 | Fixed Layout untuk nested Auto Layout | Gunakan geometri akhir saat ekspor; tidak mereplikasi engine Auto Layout di PPTX. |
| D05 | Editable native text dan simple shapes/frames | Kasus yang masuk matriks dukungan native harus dapat diedit di PowerPoint. |
| D06 | PNG lossless dengan alpha sebagai default | Image manipulation dan raster fallback tidak memakai JPEG secara default; alpha dipertahankan bila sumber transparan. |
| D07 | Raster scale default 2x | Area berukuran W × H menghasilkan raster sekitar 2W × 2H pixel; ukuran penempatan tetap W × H pada desain. |
| D08 | Visual fidelity dan z-order | Tampilan, geometri, clipping, transparansi, dan hubungan depan/belakang menjadi kriteria utama. |
| D09 | PDF + PPTX | Keduanya berada dalam scope MVP. |
| D10 | Non-destructive | Ekspor tidak mengubah node, style, selection, struktur, atau layout dokumen sumber. |
| D11 | Local-only | Pemrosesan ekspor tidak mengunggah desain, asset, teks, atau hasil ke layanan eksternal. |
| D12 | Standard 16:9 Widescreen | PPTX dan PDF memakai kanvas referensi 1920×1080 px; frame dengan rasio berbeda di-*fit* proporsional tanpa distorsi/crop diam-diam, dengan padding/background sesuai. |
| D13 | Node-level fallback compositing (Opsi A) | Raster PNG ber-alpha pada node terkecil yang memerlukan fallback; native text/shape lain, termasuk yang berada di bawahnya, tetap editable. Ketidakmampuan compositing independen wajib dilaporkan. |
| D14 | Flatten structure di PPTX | Semua objek ditempatkan di level slide mengikuti absolute z-order/paint order tanpa nested group shapes; geometri nested Auto Layout diselesaikan absolut. |
| D15 | Fallback font default | Jika font asli tidak tersedia/kompatibel, gunakan Arial/Calibri, pertahankan styling sedekat mungkin, dan catat substitusi dalam warning report. |
| D16 | Target kompatibilitas terkunci | PowerPoint Desktop 2016+ Windows, M365 Windows/Mac, Google Slides (import PPTX), dan PDF viewer universal; target dukungan harus dibuktikan melalui uji, bukan dianggap sudah lulus. |


### Baseline keputusan kualitas dan distribusi (15 Oktober 2026)

| ID | Status | Ketentuan |
| --- | --- | --- |
| OQ06 | APPROVED | Posisi dan dimensi objek ±1 px pada koordinat sumber ternormalisasi; rotasi ±0,1°; jumlah baris teks sama; target SSIM ≥0,98 pada lingkungan render konsisten; z-order benar dan tanpa clipping leakage. Target pengujian, bukan hasil benchmark. |
| OQ07 | APPROVED | Raster PNG lossless ber-alpha; default 2x, pilihan UI 1x/2x/3x; placement fisik tidak berubah; limit Figma/pixel budget memunculkan warning atau controlled failure. |
| OQ08 | BENCHMARK PENDING | Fixture 1/10/25/50 slide; ukur durasi PPTX/PDF, file size, peak memory jika terukur, pixel usage, failure, fidelity dan editability. Belum ada hard limit/target performa final. |
| OQ09 | APPROVED | Distribusi privat via Figma Development Plugin; update melalui Git dan local build; tanpa backend; default filename `Frame2Slides_<FirstFrameName>_<YYYYMMDD>.pptx` / `.pdf`, sanitasi karakter tidak valid. FirstFrameName mengikuti urutan ekspor final. |
| OQ10 | APPROVED | PDF visual-first: satu frame per halaman 16:9, urutan sama, alpha/mask/clipping/background sesuai; selectable text bila didukung pipeline, tidak wajib pada raster; metode komposisi final dipilih setelah proof-of-concept. |
| OQ11 | OPEN | Rekonsiliasi seluruh percakapan dengan PRD belum diverifikasi. |

**Fixture wajib OQ06:** basic/mixed-style/multiline text, simple shapes, nested Auto Layout, overlapping layers, image crop/mask, transparency, rounded clipping, effects, component instances, dan multiple selected frames. Ukur SSIM dengan resolusi dan rendering environment konsisten; catat perbedaan antialiasing/font terpisah.

**Kebijakan kegagalan OQ08:** tidak boleh diam-diam menghilangkan node; error actionable, progress sesuai tahap, dan output parsial/rusak tidak boleh dilaporkan sukses. Batas kapasitas ditetapkan setelah benchmark dan menjadi release gate MVP.

## Scope MVP

### Termasuk

- Satu frame terpilih menjadi satu slide/page 16:9 (referensi 1920×1080 px); konten sumber dengan rasio berbeda di-fit proporsional, tanpa distorsi atau crop diam-diam.
- Daftar frame dengan nama, thumbnail, urutan, serta drag & drop.
- Ekspor satu atau beberapa frame ke PPTX dan PDF.
- Konversi teks, simple shapes, serta frame sederhana yang memenuhi matriks native.
- Fixed Layout untuk Auto Layout bertingkat.
- PNG fallback lossless ber-alpha (default 2x; pilihan 1x/2x/3x), preservasi z-order, dan laporan objek yang dirasterisasi.
- Validasi sebelum ekspor, progress, error yang dapat ditindaklanjuti, dan penyimpanan file lokal.
- Pemeriksaan visual dan editability terhadap kumpulan fixture yang disepakati.

### Batas scope dan keputusan teknis

Ukuran slide, node-level compositing dan flattened grouping telah dikunci pada D12–D14. Keterbatasan node-level compositing yang tidak dapat direproduksi tanpa melibatkan backdrop/sibling harus dilaporkan sebagai hambatan atau warning terukur, bukan diam-diam dirasterisasi sebagai seluruh frame. Hard limit kapasitas tetap menunggu benchmark OQ08; kelengkapan rekonsiliasi tetap menunggu OQ11.

## User Stories

1. Sebagai pengguna, saya ingin membuka plugin privat di Figma agar dapat mengekspor desain saya.
2. Sebagai pengguna, saya ingin memakai frame yang saya pilih agar hanya materi yang saya tentukan menjadi slide.
3. Sebagai pengguna, saya ingin melihat nama dan thumbnail frame agar dapat memeriksa isi daftar slide.
4. Sebagai pengguna, saya ingin mengurutkan frame lewat drag & drop agar urutan presentasi sesuai narasi saya.
5. Sebagai pengguna, saya ingin melihat urutan final sebelum ekspor agar dapat mencegah kesalahan urutan.
6. Sebagai pengguna, saya ingin mengekspor PPTX agar dapat melanjutkan penyuntingan di PowerPoint.
7. Sebagai pengguna, saya ingin mengekspor PDF agar dapat membagikan versi dengan tampilan tetap.
8. Sebagai pengguna, saya ingin teks sederhana tetap menjadi native text agar dapat mengubah isinya.
9. Sebagai pengguna, saya ingin bentuk dan frame sederhana tetap native agar dapat mengubah ukuran dan warnanya.
10. Sebagai pengguna, saya ingin posisi nested Auto Layout dipertahankan agar slide sama dengan desain saat ekspor.
11. Sebagai pengguna, saya ingin objek kompleks memakai fallback visual agar tidak kehilangan tampilan penting.
12. Sebagai pengguna, saya ingin fallback memakai PNG lossless 2x agar detail dan transparansi tetap terjaga.
13. Sebagai pengguna, saya ingin urutan depan/belakang objek dipertahankan agar overlap tetap benar.
14. Sebagai pengguna, saya ingin mengetahui bagian yang menjadi gambar agar memahami batas editability hasil.
15. Sebagai pengguna, saya ingin diberi tahu bila font atau fitur tidak dapat direpresentasikan agar dapat menilai hasilnya.
16. Sebagai pengguna, saya ingin kegagalan ekspor dijelaskan agar dapat memperbaiki frame atau mencoba kembali.
17. Sebagai pengguna, saya ingin seluruh proses berjalan lokal agar desain saya tidak dikirim ke pihak lain.
18. Sebagai pengguna, saya ingin dokumen Figma tidak berubah agar pekerjaan sumber tetap aman.

## Implementation Decisions

Keputusan D01–D16 serta baseline OQ06/OQ07/OQ09/OQ10 sudah disetujui. Rincian lainnya adalah usulan implementasi. Library PDF final dan batas kapasitas belum dipilih; target aplikasi D16 tidak menyatakan hasil pengujian sudah lulus.

### Alur pengguna dan state

1. Pengguna memilih frame di canvas dan membuka/memperbarui daftar dalam plugin. Daftar tidak boleh otomatis berubah ketika pengguna sudah menyusun urutan tanpa tindakan eksplisit untuk memuat ulang selection.
2. Validasi memastikan daftar berisi frame yang tersedia dan memiliki dimensi positif. Selection kosong atau node yang tidak didukung menghasilkan pesan jelas, tanpa ekspor kosong.
3. Pengguna menyusun urutan. Identitas frame menggunakan ID node, bukan nama yang bisa duplikat.
4. Preflight membaca snapshot desain dan membuat conversion plan, warning, serta hambatan ekspor.
5. Pengguna memilih keluaran PPTX atau PDF. Keduanya menggunakan daftar dan urutan yang sama.
6. Generator membangun file secara lokal. File hanya ditawarkan setelah hasil berhasil dibuat; kegagalan tidak boleh tampil sebagai keberhasilan atau menghilangkan slide secara diam-diam.

State yang diperlukan: daftar kosong, siap, preflight, ekspor berlangsung, berhasil, dan gagal. Tombol ekspor dicegah memulai job kedua ketika job pertama masih berjalan. Penanganan pembatalan dapat ditambahkan kemudian; bukan keputusan terkunci.

### Seams dan tanggung jawab modul

Implementasi plugin sedang berjalan secara bertahap; status pengujian codebase tidak diverifikasi oleh dokumen ini. Usulan seam utama adalah **permintaan ekspor berisi snapshot frame berurutan → file keluaran dan laporan konversi**. UI dan integrasi Figma diuji pada batas yang sama melalui fixture integrasi; unit test internal hanya untuk algoritma yang membutuhkan diagnosis khusus.

Tanggung jawab logis:

| Modul | Input | Output/tanggung jawab |
| --- | --- | --- |
| Selection & ordering | ID frame dan tindakan urutan | Daftar frame berurutan yang tervalidasi. |
| Snapshot adapter | Node Figma terpilih | Scene immutable, geometri final, style, text runs, asset references, hierarchy dan paint order. |
| Conversion planner | Snapshot dan kemampuan target | Native/raster plan, batas fallback, warning dan error. |
| Raster adapter | Node fallback | PNG lossless ber-alpha 1x/2x/3x (default 2x), pixel dimensions dan placement bounds; compositing node independen. |
| PPTX writer | Plan dan assets | Slide objects native/gambar dalam urutan yang benar. |
| PDF writer | Frame snapshot dan assets | Satu halaman 16:9 per frame, visual-first, alpha/mask/background konsisten; teknik vector/raster final menunggu proof-of-concept. |
| Export coordinator | Daftar, format, konfigurasi | Progress, file bytes dan laporan per slide; tidak memodifikasi sumber. |

Kontrak snapshot harus menyertakan ID sumber, nama, ukuran frame, transformasi, visibility, opacity, clipping/mask, serta urutan render. Kontrak hasil harus menyertakan format, file bytes, jumlah slide/page, dan laporan berisi ID node, jenis konversi, serta alasan warning/fallback. Jangan menyimpan data desain lintas sesi tanpa kebutuhan yang disetujui.

### Matriks konversi native yang diusulkan

| Jenis node/kondisi | Perilaku PPTX MVP |
| --- | --- |
| Teks tanpa efek/mask kompleks, style dan font dapat dipetakan | Native text dengan konten, posisi, ukuran, alignment, warna dan text runs yang didukung. |
| Rectangle, ellipse, line sederhana dengan solid fill/stroke yang dapat dipetakan | Native shape. |
| Frame sederhana dengan background/border yang dapat dipetakan | Native representasi background/border; children dikonversi menurut aturan masing-masing. Frame tidak otomatis berarti satu grup PowerPoint. |
| Nested Auto Layout | Baca geometri final children; ekspor koordinat tetap. |
| Image manipulation/crop/effect yang perlu dibake | PNG lokal dengan hasil visual sesuai sumber. |
| Efek, vector, mask, blend, atau style yang gagal dipetakan dengan fidelity memadai | PNG fallback; alasan dicatat. |
| Node tidak terlihat | Tidak dirender; jangan membuatnya terlihat pada hasil. |

Daftar dukungan native harus eksplisit dan diuji. Jangan menganggap semua teks, shapes, frame, atau text styling selalu dapat diekspor native. Teks pada kasus dasar yang didukung tidak boleh dirasterisasi hanya demi menyederhanakan implementasi. Font tidak tersedia/tidak cocok memakai Arial/Calibri sesuai D15 dan wajib menghasilkan warning; perbedaan wrapping harus diuji.

### Geometri, stacking dan fallback

- Transformasi dihitung relatif terhadap frame sumber lalu dinormalisasi proporsional ke kanvas 16:9 (1920×1080 px referensi), dengan padding/background bila rasio berbeda. Unit PPTX dipetakan konsisten tanpa stretch atau crop diam-diam.
- Auto Layout, constraints, dan resizing behavior tidak direplikasi; snapshot layout akhir menjadi sumber posisi.
- PNG default 2x (opsi 1x/3x) tidak boleh mengubah ukuran penempatan gambar di slide. Rounding pixel wajib mempertahankan rasio dan bounds visual.
- Alpha dipertahankan, tanpa latar putih yang tidak ada di sumber. Efek yang meluas di luar node memerlukan visual bounds yang sesuai agar shadow tidak terpotong.
- Native objects dan raster ditempatkan mengikuti paint order. Objek native tidak boleh ditambahkan ulang di atas raster yang sudah mencakupnya.
- Planner menggunakan node-level alpha fallback independen sesuai D13. Jika efek membutuhkan backdrop/sibling sehingga node-level fallback tidak setara, laporkan hambatan atau warning eksplisit; jangan diam-diam merasterisasi seluruh frame atau menghilangkan native text.
- Clipping frame harus dihormati. Frame dengan clipping/non-clipping dan elemen keluar bounds memerlukan fixture terpisah.

### Local-only dan non-destructive

Pemrosesan scene, raster, penyusunan file, dan penyimpanan hasil berlangsung di lingkungan lokal plugin. Dependency runtime harus tersedia tanpa mengambil script, font, atau converter dari server saat ekspor. Tidak ada upload desain, telemetry isi desain, atau cloud conversion. Ketentuan ini mencakup perilaku Frame2Slides; tidak mengklaim aplikasi Figma sendiri beroperasi sepenuhnya offline.

Plugin membaca node dan mengekspor bytes tanpa mengubah dokumen. Tidak memakai temporary source nodes yang meninggalkan perubahan, tidak detach component, flatten, atau mengubah text/style pada sumber. Salinan data in-memory diperbolehkan.

### Error dan batas kapasitas

Kegagalan font, raster, serialization, node hilang, serta kehabisan kapasitas harus dilaporkan dengan slide/node terkait bila tersedia. Nilai batas jumlah slide, pixel budget, ukuran file, dan waktu proses belum disepakati (OQ08). Jalankan benchmark 1/10/25/50 slide, lalu tetapkan limit dan target sebelum rilis; jangan menjanjikan ekspor tanpa batas. Ekspor parsial tidak termasuk scope yang disetujui.

## Acceptance Criteria

Kriteria berikut menjadi baseline penerimaan untuk keputusan yang telah disetujui. Angka fidelity adalah target uji, bukan hasil pengukuran; performa dan kapasitas tetap menunggu OQ08.

| ID | Given / When | Then |
| --- | --- | --- |
| AC01 | Tiga frame valid dipilih dan dimuat | Daftar memuat ketiganya satu kali, dengan identitas yang tetap benar meskipun namanya sama. |
| AC02 | Urutan A,B,C diubah menjadi C,A,B | PPTX dan PDF menghasilkan urutan C,A,B dengan tiga slide/page. |
| AC03 | Selection kosong atau tidak valid | Ekspor dicegah dengan pesan; tidak menghasilkan file kosong. |
| AC04 | Fixture native text diekspor | Konten sama dan dapat diedit sebagai text di PowerPoint; bukan gambar teks. |
| AC05 | Fixture simple shapes/frame diekspor | Bentuk/background yang didukung merupakan objek native dan dapat diedit. |
| AC06 | Fixture nested Auto Layout diekspor | Posisi/ukuran akhir sama dengan snapshot; mengedit teks PPTX tidak memicu Auto Layout sibling. |
| AC07 | Area W×H memerlukan raster fallback | PNG lossless default 2x dihasilkan, alpha sesuai sumber, dan placement tidak berubah menjadi 2W×2H. |
| AC08 | Native dan raster overlap dalam fixture | Hubungan depan/belakang, clipping, dan opacity sesuai sumber; tidak ada objek duplikat. |
| AC09 | Fitur tidak didukung native | Plan memuat fallback atau hambatan yang jelas dan laporan alasan; tidak ada kehilangan visual diam-diam. |
| AC10 | Ekspor PPTX berhasil | File dapat dibuka di target PowerPoint tanpa repair prompt; jumlah slide benar dan object editability AC04–AC05 terbukti. |
| AC11 | Ekspor PDF berhasil | File dapat dibuka di pembaca PDF, jumlah page benar, dan tiap page cocok dengan frame yang dimaksud. |
| AC12 | Dokumen sebelum/sesudah ekspor dibandingkan | Node, hierarchy, style, text, layout, dan selection tidak berubah akibat plugin. |
| AC13 | Traffic plugin dipantau selama ekspor | Tidak ada network request untuk upload/pemrosesan desain atau pengambilan dependency runtime eksternal. |
| AC14 | Raster/generator gagal | UI menunjukkan gagal dan konteks yang berguna; tidak menyatakan berhasil atau menawarkan hasil yang dianggap lengkap. |
| AC15 | Tombol ekspor ditekan berulang saat proses berlangsung | Tidak membuat job ganda; progress tetap terkait job aktif. |
| AC16 | Fixture dibandingkan dengan render Figma pada ukuran yang sama | Geometri, teks, warna, crop, alpha dan stacking diperiksa. Tidak ada missing object, overlap salah, atau clipping tak disengaja. Toleransi target: posisi/dimensi ±1 px, rotasi ±0,1°, jumlah baris teks sama, SSIM ≥0,98 dengan render konsisten; target aplikasi mengikuti D16. |
| AC17 | Frame memiliki ukuran/rasio berbeda | Semua halaman/slide 16:9; konten di-fit proporsional dengan padding/background, tanpa stretch atau crop diam-diam (D12). |
| AC18 | Fallback dan native node overlap atau bergantung pada backdrop | Node-level PNG ber-alpha mempertahankan native text/shape lain; bila compositing independen tidak setara, laporkan hambatan eksplisit (D13). |
| AC19 | Frame memiliki nesting/grouping | PPTX menggunakan objek flat pada slide level dalam absolute z-order; tidak ada nested PowerPoint shape groups (D14). |

| AC20 | Font asli tidak tersedia | Font Arial/Calibri digunakan; laporan menyebut node, font asli dan font pengganti; wrapping diperiksa (D15). |
| AC21 | PPTX diuji pada target kompatibilitas | Buka/render/edit pada PowerPoint 2016+ Windows, M365 Windows/Mac, dan import Google Slides; dokumentasikan perbedaan dan kegagalan (D16). |
| AC22 | Pengguna memilih raster 1x, 2x, atau 3x | PNG sesuai skala, alpha terjaga, posisi dan ukuran fisik tetap; default 2x (OQ07). |
| AC23 | PDF diekspor dari frame beragam | Satu page 16:9 per frame, urutan sama, visual-first; text selectability diuji jika pipeline mendukung (OQ10). |
| AC24 | Benchmark kapasitas 1/10/25/50 slide dijalankan | Catat durasi, ukuran file, pixel usage, memory bila terukur, fidelity, editability, dan kegagalan; tetapkan release limits setelah evaluasi (OQ08). |
| AC25 | Ekspor selesai dan nama file ditentukan | Nama default mengikuti `Frame2Slides_<FirstFrameName>_<YYYYMMDD>` dengan ekstensi sesuai format dan sanitasi nama (OQ09). |

## Testing Decisions

- Test memeriksa hasil eksternal: urutan, file yang valid, visual, editability, privacy dan integritas sumber; bukan nama fungsi atau detail algoritma.
- Prior art belum tersedia karena workspace tidak berisi implementasi plugin. Seam ekspor di atas masih usulan dan belum dikonfirmasi pengguna.
- Fixture minimal: native text termasuk multiline dan mixed runs; rectangle/ellipse/line; frame sederhana; nested Auto Layout; image crop; transparent PNG; native/raster overlap; shadow; mask/clipping; duplicate frame names; invalid selection; font bermasalah; serta ekspor gagal.
- Fixture compositing/backdrop, grouping, dan mixed frame sizes wajib karena D12–D14 sudah diputuskan.
- Uji struktur PPTX untuk memastikan teks dan shapes native, lalu buka dan edit manual pada target PowerPoint. Valid XML saja tidak membuktikan fidelity atau editability praktis.
- Render hasil PPTX/PDF dan bandingkan dengan frame Figma pada dimensi sama. Gunakan target OQ06 (±1 px geometri, ±0,1° rotasi, line count sama, SSIM ≥0,98); font/antialiasing dinilai terpisah. Angka merupakan target yang belum terbukti.
- Integrasi Figma memverifikasi snapshot dokumen sebelum/sesudah serta memantau aktivitas jaringan plugin. Jalankan benchmark kapasitas pada desain representatif sebelum menetapkan batas.

## Out of Scope

Batas berikut diusulkan untuk MVP: publikasi plugin Community, backend/cloud conversion, kolaborasi akun, sinkronisasi balik PowerPoint ke Figma, live link, konversi animasi/prototyping, reflow Auto Layout di PPTX, native editability untuk semua fitur kompleks, editing PDF sebagai objek PowerPoint, serta batch seluruh file tanpa selection.

## Open Questions / Decision Status

| ID | Pertanyaan | Status | Keputusan / tindak lanjut |
| --- | --- | --- | --- |
| OQ01 | Ukuran slide berbeda | LOCKED (D12) | 16:9 Widescreen 1920×1080 px; proportional fit tanpa distorsi/crop diam-diam. |
| OQ02 | Batas fallback compositing | LOCKED (D13) | Independent node-level PNG alpha; native text di bawah tetap editable; keterbatasan backdrop dilaporkan. |
| OQ03 | Grouping PPTX | LOCKED (D14) | Flatten objects pada slide level mengikuti absolute z-order. |
| OQ04 | Font tidak kompatibel | LOCKED (D15) | Fallback Arial/Calibri dan warning report. |
| OQ05 | Kompatibilitas | LOCKED (D16) | PowerPoint Desktop 2016+ Windows/M365 Windows & Mac, Google Slides, PDF universal; perlu uji. |
| OQ06 | Visual fidelity | APPROVED | ±1 px geometri, ±0,1° rotasi, wrapping setara, target SSIM ≥0,98 dan fixture wajib. |
| OQ07 | Skala raster | APPROVED | PNG lossless alpha 1x/2x/3x; default 2x. |
| OQ08 | Kapasitas dan performa | BENCHMARK PENDING | Benchmark 1/10/25/50 slide; limit dan target final setelah pengukuran. |
| OQ09 | Distribusi privat dan nama file | APPROVED | Development Plugin, Git/local build, `Frame2Slides_<FirstFrameName>_<YYYYMMDD>.<ext>`. |
| OQ10 | PDF | APPROVED | Visual-first 16:9; text selectable bila didukung; metode final setelah proof-of-concept. |
| OQ11 | Kelengkapan diskusi | OPEN | Rekonsiliasi terhadap percakapan lengkap belum dilakukan. |

## Further Notes

Urutan implementasi: selection/order dan snapshot → normalisasi kanvas 16:9 serta native text/shapes → raster independen dan flattened z-order → PDF/PPTX output serta laporan → integrasi, visual QA, kompatibilitas, dan benchmark. D12–D16 sudah locked; OQ08 menjadi release gate benchmark dan OQ11 tetap open.

Definisi selesai: acceptance criteria yang berlaku lulus pada target yang disepakati, keputusan yang menghalangi MVP terselesaikan, keluaran native terbukti dapat diedit, fidelity diverifikasi, dan local-only/non-destructive terbukti. Dokumen ini tidak mengklaim implementasi atau pengujian sudah dilakukan.
