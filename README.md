# ติดตาม % การโอนสินค้าเทียบแผน Weekly-Daily

Web app แทนที่ workflow Excel `Tracking_โอนเทียบแผน_WK36.xlsx`: Upload ไฟล์โอนจริง (ABS0000) + แผนโอน Weekly/Daily (BSR030/BDR130) แล้วให้ระบบคำนวณ % โอนเทียบแผนและวิเคราะห์การสูญเสียให้อัตโนมัติ

## โครงสร้างโปรเจกต์

- `frontend/` — Vite + React + TypeScript + Tailwind (Upload, Dashboard, Settings)
- `supabase/migrations/` — Postgres schema + RLS
- `supabase/functions/process-week/` — Edge Function ที่รัน calculation engine
- `supabase/functions/_shared/calcEngine.ts` — engine หลัก มี unit test (`*.test.ts`) เทียบกับค่าจริงจาก WK36

## Setup ครั้งแรก

### 1. สร้าง Supabase project

ที่ [supabase.com](https://supabase.com) สร้าง project ใหม่ แล้วรัน migration:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # รัน supabase/migrations/0001_init.sql
npx supabase functions deploy process-week
```

### 2. ตั้งค่า Frontend

```bash
cd frontend
cp .env.example .env
# ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY จาก Supabase Dashboard > Settings > API
npm install
npm run dev
```

### 3. สร้าง user แรก (ถ้าต้องการบังคับ login)

ระบบ login เปิด/ปิดได้จากหน้า Settings (ตาราง `app_settings.require_login`) ค่าเริ่มต้นคือ **เปิด** — สร้างบัญชีแรกได้ที่ Supabase Dashboard > Authentication > Users > Add user หรือปิด `require_login` ไว้ก่อนถ้ายังไม่ต้องการ login

## รันเทส

```bash
npm test                 # calc engine unit tests + real-WK36-file integration test (ที่ repo root)
cd frontend && npx tsc -b && npm run build   # type-check + build
```

การทดสอบ integration (`supabase/functions/_shared/wk36-integration.test.ts`) จะ parse ไฟล์ตัวอย่างจริงใน `โอนเทียบแผน Weekly-Daily/` และตรวจว่าผลลัพธ์ตรงกับค่าที่ยืนยันจากสูตร Excel จริง — ถ้าย้าย/ลบโฟลเดอร์ตัวอย่างนั้น เทสนี้จะหาไฟล์ไม่เจอ

## หมายเหตุสำคัญ

- ตัวเลขรวมของ WK36 ที่คำนวณจากเว็บแอปนี้จะ**มากกว่า**ไฟล์ Excel เดิมเล็กน้อย เพราะ Excel เดิมมีบั๊ก (สูตรลากไม่ครบ 7 แถวสุดท้าย) ที่เว็บแอปนี้แก้ไขแล้วตามที่ตกลงไว้
- สูตร "สูญเสียกำไร (บาท)" จงใจไม่ได้รับ tolerance 10% เหมือนคอลัมน์ %/ปริมาณ — ตรงกับพฤติกรรมเดิมของ Excel เป๊ะ (ดู comment ใน `calcEngine.ts`)
- แถวโอนจริง (ABS0000) ที่ไม่มีรหัสโรงงานปลายทาง (~25% ของข้อมูลจริง) คือการขายตรงให้ลูกค้า ไม่ใช่การโอนระหว่างโรงงาน ระบบจะข้ามแถวเหล่านี้โดยอัตโนมัติ ไม่ถือเป็น error
