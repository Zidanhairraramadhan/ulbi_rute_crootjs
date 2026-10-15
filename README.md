# Rute Kampus ULBI — CrootJS

Aplikasi peta statis untuk GitHub Pages. Menggunakan CrootJS untuk interaksi DOM, SVG untuk menggambar peta, dan algoritma Dijkstra sederhana untuk mencari jalur dari titik berangkat ke titik tujuan. Tidak memakai React, Leaflet, Google Maps SDK, atau framework frontend lain.

## File
- `index.html` — halaman utama dan tampilan.
- `app.js` — pemrosesan GeoJSON, gambar SVG, pemilihan asal/tujuan, dan perhitungan rute.
- `ulbi.geojson` — data GeoJSON yang diberikan pengguna, termasuk footprint gedung dan LineString jalan/lorong.

## Jalankan lokal
Karena browser membatasi `fetch()` dari file lokal, jalankan lewat server statis. Cara sederhana di VS Code: gunakan ekstensi Live Server lalu buka `index.html`.

## Deploy ke GitHub Pages
1. Buat repository GitHub baru, misalnya `ulbi-rute-crootjs`.
2. Upload ketiga file utama (`index.html`, `app.js`, `ulbi.geojson`) dan README.
3. Buka **Settings → Pages**.
4. Pada **Build and deployment**, pilih **Deploy from a branch**.
5. Pilih branch `main` dan folder `/ (root)`, lalu tekan **Save**.
6. Tunggu proses selesai; alamat Pages akan muncul di halaman Settings → Pages.

## Catatan akurasi
Rute hanya dihitung dari LineString jalan/lorong yang tersedia di GeoJSON yang diberikan. Data awal berisi sedikit polyline, bukan jaringan jalan kampus yang lengkap, sehingga beberapa rute bisa menjadi perkiraan atau berupa sambungan antarbagian. Untuk navigasi akurat, tambahkan polyline jalan yang saling terhubung dan verifikasi nama serta posisi gedung.
