# PRD — Frame2Slides

Tanggal: 14 Oktober 2026  
Status: Draft untuk implementasi; keputusan terbuka belum disetujui  
Produk: Plugin Figma privat untuk ekspor PDF dan PowerPoint (.pptx)

## Dasar spesifikasi dan batas bukti

Dokumen ini mengikuti struktur skill mattpocock `/to-spec`, dengan tambahan scope MVP, kontrak perilaku, acceptance criteria, dan open questions. Deliverable berupa dokumen lokal sesuai permintaan; tidak dipublikasikan ke issue tracker.

Sumber: permintaan pengguna pada chat Codex ini dan percakapan **Membuat Plugin Figma Pribadi**, ID `6acf64bb-273c-83ec-bb55-b0fbff687aaf`. Pengambilan percakapan mengembalikan lima turn pengguna dan tidak menyediakan halaman lebih lama. Isi jawaban asisten hanya berupa penanda referensi. Karena itu dokumen ini **belum merupakan ekstraksi terverifikasi dari seluruh diskusi asli**.

Pesan sumber yang dapat dibaca mengonfirmasi Smart Hybrid Conversion, Fixed Layout untuk nested Auto Layout, Select Frames + Drag & Drop, dan penggantian JPEG dengan PNG. Permintaan terbaru secara eksplisit mengunci keputusan tambahan di bawah. Detail operasional yang ditambahkan untuk membuat PRD implementable berstatus **usulan spesifikasi**, bukan persetujuan historis. Bila berbeda dengan diskusi asli yang belum dapat dibaca, perlu direkonsiliasi.

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

## Scope MVP

### Termasuk

- Satu frame terpilih menjadi satu slide/page, dengan batas slide berasal dari frame tersebut.
- Daftar frame dengan nama, thumbnail, urutan, serta drag & drop.
- Ekspor satu atau beberapa frame ke PPTX dan PDF.
- Konversi teks, simple shapes, serta frame sederhana yang memenuhi matriks native.
- Fixed Layout untuk Auto Layout bertingkat.
- PNG fallback 2x, alpha, preservasi z-order, dan laporan objek yang dirasterisasi.
- Validasi sebelum ekspor, progress, error yang dapat ditindaklanjuti, dan penyimpanan file lokal.
- Pemeriksaan visual dan editability terhadap kumpulan fixture yang disepakati.

### Batas scope yang diusulkan

Kebijakan ukuran frame berbeda, compositing fallback yang melibatkan objek lain, dan grouping belum dipilih. Implementasi bagian tersebut harus menunggu keputusan; dukungan MVP tidak boleh diklaim lengkap sebelum acceptance criteria terkait ditetapkan. Pengembangan pipeline dasar dengan frame berukuran sama dan fallback independen tetap dapat dilakukan.

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

Semua rincian dalam bagian ini merupakan usulan implementasi kecuali yang merujuk keputusan D01–D11. Tidak ada library, versi aplikasi, atau batas kapasitas yang dianggap sudah dipilih.

### Alur pengguna dan state

1. Pengguna memilih frame di canvas dan membuka/memperbarui daftar dalam plugin. Daftar tidak boleh otomatis berubah ketika pengguna sudah menyusun urutan tanpa tindakan eksplisit untuk memuat ulang selection.
2. Validasi memastikan daftar berisi frame yang tersedia dan memiliki dimensi positif. Selection kosong atau node yang tidak didukung menghasilkan pesan jelas, tanpa ekspor kosong.
3. Pengguna menyusun urutan. Identitas frame menggunakan ID node, bukan nama yang bisa duplikat.
4. Preflight membaca snapshot desain dan membuat conversion plan, warning, serta hambatan ekspor.
5. Pengguna memilih keluaran PPTX atau PDF. Keduanya menggunakan daftar dan urutan yang sama.
6. Generator membangun file secara lokal. File hanya ditawarkan setelah hasil berhasil dibuat; kegagalan tidak boleh tampil sebagai keberhasilan atau menghilangkan slide secara diam-diam.

State yang diperlukan: daftar kosong, siap, preflight, ekspor berlangsung, berhasil, dan gagal. Tombol ekspor dicegah memulai job kedua ketika job pertama masih berjalan. Penanganan pembatalan dapat ditambahkan kemudian; bukan keputusan terkunci.

### Seams dan tanggung jawab modul

Belum ada codebase atau prior art pengujian di workspace ini. Usulan seam utama adalah **permintaan ekspor berisi snapshot frame berurutan → file keluaran dan laporan konversi**. UI dan integrasi Figma diuji pada batas yang sama melalui fixture integrasi; unit test internal hanya untuk algoritma yang membutuhkan diagnosis khusus.

Tanggung jawab logis:

| Modul | Input | Output/tanggung jawab |
| --- | --- | --- |
| Selection & ordering | ID frame dan tindakan urutan | Daftar frame berurutan yang tervalidasi. |
| Snapshot adapter | Node Figma terpilih | Scene immutable, geometri final, style, text runs, asset references, hierarchy dan paint order. |
| Conversion planner | Snapshot dan kemampuan target | Native/raster plan, batas fallback, warning dan error. |
| Raster adapter | Area fallback | PNG ber-alpha 2x, pixel dimensions dan placement bounds. |
| PPTX writer | Plan dan assets | Slide objects native/gambar dalam urutan yang benar. |
| PDF writer | Frame snapshot dan assets | Page sesuai desain dan urutan; teknik vector/raster PDF belum dikunci. |
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

Daftar dukungan native harus eksplisit dan diuji. Jangan menganggap semua teks, shapes, frame, atau text styling selalu dapat diekspor native. Teks pada kasus dasar yang didukung tidak boleh dirasterisasi hanya demi menyederhanakan implementasi. Font tidak tersedia/tidak cocok harus menghasilkan warning; strategi substitusi versus fallback masih perlu ditetapkan.

### Geometri, stacking dan fallback

- Transformasi dihitung relatif terhadap frame slide. Ukuran unit PPTX ditentukan secara konsisten setelah kebijakan ukuran slide dipilih.
- Auto Layout, constraints, dan resizing behavior tidak direplikasi; snapshot layout akhir menjadi sumber posisi.
- PNG 2x tidak boleh menyebabkan gambar tampil dua kali lebih besar di slide. Rounding pixel wajib mempertahankan rasio dan bounds visual.
- Alpha dipertahankan, tanpa latar putih yang tidak ada di sumber. Efek yang meluas di luar node memerlukan visual bounds yang sesuai agar shadow tidak terpotong.
- Native objects dan raster ditempatkan mengikuti paint order. Objek native tidak boleh ditambahkan ulang di atas raster yang sudah mencakupnya.
- Planner harus mendeteksi kasus yang memerlukan backdrop/compositing atau kumpulan objek yang tidak bisa diganti satu raster tanpa mengubah overlap. Kebijakan resolusinya masih OQ02; jangan memakai kebijakan arbitrer secara diam-diam.
- Clipping frame harus dihormati. Frame dengan clipping/non-clipping dan elemen keluar bounds memerlukan fixture terpisah.

### Local-only dan non-destructive

Pemrosesan scene, raster, penyusunan file, dan penyimpanan hasil berlangsung di lingkungan lokal plugin. Dependency runtime harus tersedia tanpa mengambil script, font, atau converter dari server saat ekspor. Tidak ada upload desain, telemetry isi desain, atau cloud conversion. Ketentuan ini mencakup perilaku Frame2Slides; tidak mengklaim aplikasi Figma sendiri beroperasi sepenuhnya offline.

Plugin membaca node dan mengekspor bytes tanpa mengubah dokumen. Tidak memakai temporary source nodes yang meninggalkan perubahan, tidak detach component, flatten, atau mengubah text/style pada sumber. Salinan data in-memory diperbolehkan.

### Error dan batas kapasitas

Kegagalan font, raster, serialization, node hilang, serta kehabisan kapasitas harus dilaporkan dengan slide/node terkait bila tersedia. Nilai batas jumlah slide, pixel budget, ukuran file, dan waktu proses belum disepakati. Tetapkan melalui benchmark sebelum rilis; jangan menjanjikan ekspor tanpa batas. Ekspor parsial tidak termasuk scope yang disetujui.

## Acceptance Criteria

Kriteria berikut adalah usulan kontrak penerimaan. Kasus berstatus “menunggu keputusan” belum dapat dipakai untuk mengklaim MVP selesai.

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
| AC16 | Fixture dibandingkan dengan render Figma pada ukuran yang sama | Geometri, teks, warna, crop, alpha dan stacking diperiksa. Tidak ada missing object, overlap salah, atau clipping tak disengaja. Toleransi kuantitatif dan target aplikasi mengikuti OQ05/OQ06. |
| AC17 | Frame memiliki ukuran/rasio berbeda | Menunggu OQ01: pengujian harus membuktikan kebijakan yang dipilih tanpa distorsi tak disetujui. |
| AC18 | Fallback bergantung pada backdrop atau mencakup beberapa sibling | Menunggu OQ02: hasil visual dan batas kehilangan editability harus sesuai kebijakan yang disetujui. |
| AC19 | Frame memiliki nesting/grouping | Menunggu OQ03: struktur grouping PPTX sesuai keputusan tanpa mengubah z-order atau editability. |

## Testing Decisions

- Test memeriksa hasil eksternal: urutan, file yang valid, visual, editability, privacy dan integritas sumber; bukan nama fungsi atau detail algoritma.
- Prior art belum tersedia karena workspace tidak berisi implementasi plugin. Seam ekspor di atas masih usulan dan belum dikonfirmasi pengguna.
- Fixture minimal: native text termasuk multiline dan mixed runs; rectangle/ellipse/line; frame sederhana; nested Auto Layout; image crop; transparent PNG; native/raster overlap; shadow; mask/clipping; duplicate frame names; invalid selection; font bermasalah; serta ekspor gagal.
- Gunakan fixture compositing/backdrop, grouping, dan mixed frame sizes setelah OQ01–OQ03 diputuskan.
- Uji struktur PPTX untuk memastikan teks dan shapes native, lalu buka dan edit manual pada target PowerPoint. Valid XML saja tidak membuktikan fidelity atau editability praktis.
- Render hasil PPTX/PDF dan bandingkan dengan frame Figma pada dimensi yang sama. Perbedaan font dan anti-aliasing harus dinilai terpisah dari kesalahan geometri; ambang penerimaan tidak boleh dikarang.
- Integrasi Figma memverifikasi snapshot dokumen sebelum/sesudah serta memantau aktivitas jaringan plugin. Jalankan benchmark kapasitas pada desain representatif sebelum menetapkan batas.

## Out of Scope

Batas berikut diusulkan untuk MVP: publikasi plugin Community, backend/cloud conversion, kolaborasi akun, sinkronisasi balik PowerPoint ke Figma, live link, konversi animasi/prototyping, reflow Auto Layout di PPTX, native editability untuk semua fitur kompleks, editing PDF sebagai objek PowerPoint, serta batch seluruh file tanpa selection.

## Open Questions

| ID | Pertanyaan yang belum disepakati | Dampak/opsi untuk diputuskan |
| --- | --- | --- |
| OQ01 | Bagaimana ukuran slide berbeda ditangani? | PPTX memiliki ukuran slide pada level presentasi. Pilih menolak ukuran campuran, normalisasi ke target dengan fit/padding, atau memisahkan deck; tentukan target size, alignment dan perilaku PDF secara tersendiri. Tidak ada opsi yang sudah disetujui. |
| OQ02 | Apa batas fallback compositing? | Node saja, subtree/container, rentang paint order, atau seluruh slide saat diperlukan? Tentukan penanganan blend/backdrop/mask/overlap dan tradeoff terhadap editability. Tidak ada blanket full-slide raster yang disetujui. |
| OQ03 | Bagaimana grouping hasil PPTX? | Flat objects, hierarchy tertentu, atau grup yang mengikuti Figma? Tentukan frame background, child groups, transformasi, clipping dan grup campuran native/raster. Fixed Layout tidak otomatis menjawab grouping. |
| OQ04 | Apa kebijakan font dan text styling yang tidak kompatibel? | Tentukan font target, substitusi, warning, raster fallback, serta kebutuhan font di perangkat penerima. |
| OQ05 | Apa target kompatibilitas? | Tentukan Figma host dan versi/platform PowerPoint serta PDF viewer yang menjadi target acceptance. |
| OQ06 | Apa ambang visual fidelity? | Sepakati toleransi geometri, wrapping teks, perbedaan render, dan daftar fixture wajib; belum ada angka yang disetujui. |
| OQ07 | Apakah skala raster dapat diubah pengguna? | Default 2x terkunci; pilihan tambahan, batas dan UI belum disetujui. |
| OQ08 | Apa batas kapasitas dan target performa? | Jumlah slide, pixel budget, ukuran file, waktu ekspor, dan perilaku saat batas terlampaui memerlukan benchmark. |
| OQ09 | Bagaimana distribusi privat dan penamaan file? | Tentukan sideload/internal distribution, update, serta nama file/default export settings. |
| OQ10 | Bagaimana kualitas dan teknik PDF? | PDF berada di MVP, tetapi raster/vector composition, text selectability, dan alpha/background page belum dikunci. |
| OQ11 | Apakah ada keputusan tambahan pada isi diskusi yang belum tersedia? | Rekonsiliasi dengan ekspor percakapan lengkap sebelum menyebut PRD sebagai ekstraksi seluruh diskusi. |

## Further Notes

Urutan implementasi yang diusulkan: selection/order dan snapshot → native text/shapes dengan frame berukuran sama → raster independen dan z-order → PDF/PPTX output serta laporan → integrasi, visual QA, dan benchmark. Selesaikan OQ01–OQ03 sebelum mengimplementasikan perilaku terkait atau menyatakan MVP siap rilis.

Definisi selesai: acceptance criteria yang berlaku lulus pada target yang disepakati, keputusan yang menghalangi MVP terselesaikan, keluaran native terbukti dapat diedit, fidelity diverifikasi, dan local-only/non-destructive terbukti. Dokumen ini tidak mengklaim implementasi atau pengujian sudah dilakukan.
