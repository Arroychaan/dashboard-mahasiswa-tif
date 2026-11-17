# Panduan Final Instalasi Raspberry Pi 3B (SD Card 32GB + WiFi + Monitor Lab)

Seluruh kode aplikasi, pengaturan jaringan WiFi lokal, dan paket instalasi otomatis Raspberry Pi 3B telah disiapkan hingga tuntas.

---

## Ringkasan Cara Kerja Sistem

1. **Layar Monitor Lab (Tersambung ke HDMI Raspberry Pi 3B):**
   * Begitu Raspberry Pi 3B dicolok listrik, layar monitor otomatis membuka **Dashboard Publik** secara layar penuh (*Kiosk Mode*).
   * Kursor mouse disembunyikan, layar dicegah agar tidak mati (*anti-sleep*), dan orang yang lewat di lab hanya bisa melihat tampilan grafik dashboard.
2. **Aplikasi Admin (Dikendalikan dari Laptop / HP Pengurus Lab via WiFi):**
   * Pengurus lab cukup menyambungkan laptop atau HP ke **WiFi yang sama** dengan Raspberry Pi 3B.
   * Buka browser di laptop/HP, lalu ketik:
     👉 **`http://lab-informatika.local:3000/admin`**
   * Login menggunakan akun Super Admin untuk menambah/mengubah data mahasiswa lulusan, dosen, publikasi, atau mengganti tema tampilan (*Terang*, *Gelap*, *Monokrom*).

---

## Langkah Praktis Menyiapkan SD Card (Drive `E:`)

Karena SD Card baru belum memiliki Sistem Operasi dasar Raspberry Pi, ikuti 3 langkah singkat ini di PC Anda:

### Langkah 1: Pasang Sistem Operasi & WiFi ke SD Card (`E:`)
Aplikasi **Raspberry Pi Imager** sudah diinstalkan di PC ini. Buka aplikasi **Raspberry Pi Imager** dari Start Menu Windows, lalu pilih:
1. **Choose Device (Pilih Perangkat):** Pilih **`Raspberry Pi 3`**
2. **Choose OS (Pilih Sistem Operasi):** Pilih **`Raspberry Pi OS (other)`** $\rightarrow$ **`Raspberry Pi OS Lite (64-bit)`** *(paling ringan dan hemat RAM untuk Raspi 3B)*
3. **Choose Storage (Pilih Penyimpanan):** Pilih SD Card USB 32GB Anda (**Drive `E:`**)
4. Di bagian **Customisation** (sesuai tampilan Raspberry Pi Imager v2.0.8):
   * **Hostname:** isi `lab-informatika`
   * **Localisation:** Timezone `Asia/Jakarta`, Keyboard `us` (dan Wireless LAN country `ID` jika diminta)
   * **User:** isi username `pi` dan password bebas (misal `unissula2026`)
   * **Wi-Fi:** masukkan **Nama WiFi (SSID)** dan **Password WiFi** (boleh pakai WiFi kos dulu untuk uji coba awal)
   * **Remote access:** centang **Enable SSH** $\rightarrow$ pilih **Use password authentication**
   * **Raspberry Pi Connect:** lewati / **Next**, lalu mulai tulis (**Write**) ke SD Card.

---

### Langkah 2: Klik 2x File `PASANG-KE-SDCARD-E.bat`
Setelah Raspberry Pi Imager selesai menulis OS:
1. Cabut dan colok ulang USB SD Card ke PC ini agar terbaca kembali sebagai **Drive `E:`**.
2. Buka folder proyek `D:\Achmad Roychan\Proyek\dashboard-data-mahasiswa\`.
3. **Klik 2x file [`PASANG-KE-SDCARD-E.bat`](file:///d:/Achmad%20Roychan/Proyek/dashboard-data-mahasiswa/PASANG-KE-SDCARD-E.bat)**.
   * Skrip ini otomatis menyalin paket Dashboard yang sudah di-*build* (`5.9 MB`) ke dalam SD Card `E:\raspi-dashboard\`.
   * Skrip ini juga otomatis menyuntikkan perintah *Auto-Install* ke sistem boot SD Card.

---

### Langkah 3: Pasang SD Card ke Raspberry Pi 3B & Nyalakan!
1. Cabut SD Card dari PC, masukkan ke slot MicroSD **Raspberry Pi 3B**.
2. Hubungkan kabel HDMI ke monitor lab dan nyalakan adaptor daya Raspberry Pi 3B.
3. Pada penyalaan pertama (*First Boot*), Raspberry Pi akan otomatis terhubung ke WiFi dan memasang database PostgreSQL + Server Dashboard + Mode Layar Penuh (membutuhkan waktu sekitar 10–15 menit pada penyalaan pertama saja).
4. Setelah selesai, layar monitor akan langsung menampilkan **Dashboard Laboratorium Informatika UNISSULA** secara otomatis!

> **Catatan Tambahan (Jika Ingin Menjalankan Instalasi Manual lewat SSH):**
> Jika sewaktu-waktu Anda masuk melalui terminal/SSH (`ssh pi@lab-informatika.local`), Anda juga bisa menjalankan instalasi ulang kapan saja dengan 1 perintah:
> ```bash
> sudo bash /boot/firmware/raspi-dashboard/setup-raspi.sh
> ```

---

## Cara Mengganti / Menambah WiFi Saat Pindah dari Kos ke Lab

Tidak perlu menginstal ulang apa pun saat alat dipindahkan dari kos ke Lab Informatika:

1. **Cara Paling Praktis (Tambahkan WiFi Lab Sebelum Berangkat):**
   Saat Raspi masih menyala di kos, masuk lewat terminal/PowerShell laptop Anda (`ssh pi@lab-informatika.local`), lalu simpan profil WiFi Lab sebagai cadangan:
   ```bash
   sudo nmcli connection add type wifi con-name "WiFiLab" ifname wlan0 ssid "NAMA_WIFI_LAB" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "PASSWORD_WIFI_LAB"
   ```
   Begitu Raspi dibawa ke lab dan dicolok listrik, otomatis langsung terhubung ke WiFi Lab!

2. **Cara Jika Baru Tahu Password WiFi di Tempat:**
   * Colokkan keyboard USB sebentar ke Raspi (atau sambungkan kabel LAN), tekan `Ctrl + Alt + F2` lalu login (`pi` / password Anda).
   * Ketik `sudo nmtui`, pilih **Activate a connection**, pilih nama WiFi Lab, lalu masukkan password-nya.
   * Restart dengan `sudo reboot`.

---

## Informasi Login Admin Panel (Dari Laptop / HP Lain)

* **Alamat URL Admin:** `http://lab-informatika.local:3000/admin`
* **Email Super Admin:** `admin@unissula.ac.id`
* **Password:** `PasswordLabUnissula2026!`
* **Kode MFA / Recovery Code (Sekali Pakai):**
  * `CFA2E-A4BFB`
  * `CCE3A-121D1`
  * `303A5-4450B`
  * `9B7A6-78F66`
  * `80221-CD6AD`
  * `E10E8-2932E`
  * `CA3DB-1F257`
  * `81516-F1D3F`
* **TOTP Secret (untuk Google Authenticator / Authy):** `CZPWXPCI4KUNLKPKZLRLTC3AEZGPUYAZ`

