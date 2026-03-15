# LitGit

Monorepo TypeScript modern untuk web dan desktop, dibangun dengan React, TanStack Router, dan Tauri.

## Partisipasi Hackathon

Proyek ini dibuat sebagai partisipasi dalam **[Mayar Vibecoding Competition 2026](https://mayar.id/vibe2026)** (Ramadhan 2026). Dikembangkan dengan pendekatan vibecoding dan [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

## Fitur

- **TypeScript** - Keamanan tipe dan pengalaman pengembangan yang lebih baik
- **TanStack Router** - Routing berbasis file dengan dukungan type safety penuh
- **TailwindCSS** - CSS utility-first untuk pengembangan UI yang cepat
- **shadcn/ui** - Komponen UI yang dapat dipakai ulang
- **Tauri** - Membangun aplikasi desktop native
- **Turborepo** - Sistem build monorepo yang dioptimasi

## Cara Memulai

**Prasyarat:** [Bun](https://bun.sh) (disarankan v1.3.x).

Pasang dependensi:

```bash
bun install
```

Jalankan dev server semua aplikasi:

```bash
bun run dev
```

Buka [http://localhost:3001](http://localhost:3001) di peramban untuk preview aplikasi desktop (Vite).

## Struktur Proyek

```
LitGit/
├── apps/
│   └── desktop/      # Aplikasi desktop (React + TanStack Router + Tauri)
├── packages/
│   ├── config/       # Konfigurasi TypeScript bersama
│   └── env/          # Validasi environment (@litgit/env)
```

## Perintah yang Tersedia

- `bun run dev` - Menjalankan dev server semua aplikasi dalam mode pengembangan
- `bun run dev:desktop-web` - Dev server web (Vite) untuk preview di peramban (hanya desktop)
- `bun run dev:desktop` - Menjalankan aplikasi desktop Tauri dalam mode pengembangan (hanya desktop)
- `bun run build` - Membangun semua aplikasi
- `bun run build:desktop` - Membangun aplikasi desktop Tauri untuk distribusi (hanya desktop)
- `bun run build:desktop-web` - Membangun aset web (Vite) untuk aplikasi desktop (hanya desktop)
- `bun run check-types` - Memeriksa tipe TypeScript di semua app
- `bun run check` - Menjalankan pemeriksaan lint dan format (Ultracite)
- `bun run fix` - Memperbaiki otomatis masalah lint dan format (Ultracite)
- `bun run gen:gitignore-templates` - Menghasilkan ulang template .gitignore untuk aplikasi desktop

## Dibangun dengan

- [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) - Kerangka proyek
- React, TanStack Router, TailwindCSS, shadcn/ui, Tauri, Turborepo, Ultracite (Biome)

## Lisensi

Proprietary. Hak cipta dilindungi.

## Penghargaan

- Dibangun dengan [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).
- Diserahkan sebagai bagian dari [Mayar Vibecoding Competition 2026](https://mayar.id/vibe2026).
