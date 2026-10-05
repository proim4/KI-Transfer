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
- โอนจริง (ABS0000) อัปโหลดได้หลายไฟล์ต่อ Week และทุกไฟล์รวมกัน (ระบบต้นทาง Export ได้สูงสุด 5,000 แถว/ไฟล์ — ไฟล์ที่มี 5,000 แถวพอดีจะขึ้นคำเตือน) ไฟล์ชื่อซ้ำจะแทนที่ไฟล์เดิม และไฟล์ที่ข้อมูลซ้ำกับไฟล์ที่อัปโหลดแล้ว ≥ 90% จะถูกปฏิเสธเพื่อกันนับซ้ำ
- % โอนเทียบแผน Weekly/Daily: โอนจริงของเส้นทางถูกใช้กับแผน Weekly ก่อน ส่วนที่เหลือเท่านั้นที่นับให้ Daily (เดิมนับโอนจริงก้อนเดียวกันให้ทั้งสองช่องทาง) — % Total ไม่เปลี่ยน
- โอนจริงต่างวันจากแผน ±1 วัน (เส้นทาง + กลุ่มสินค้าตรง แต่วันที่ไม่มีแผน) จะ**ไม่ถูกนับจนกว่าผู้ใช้กดยืนยัน**ที่ Dashboard — ระหว่างรอจะแสดง "รอยืนยัน" และหลังยืนยันจะแสดง "รวมโอนจริงวันที่ … ยืนยันโดย …" ในช่องหมายเหตุของแถวแผน
- เส้นทางที่มีหลายราคาในวันเดียวกัน: โอนจริงของเส้นทางเป็นยอดเดียว ระบบแบ่งให้แต่ละราคาตามสัดส่วนแผน (`actual_alloc`) — ยอดรวม โอนจริง/โอนเกินแผน/กำไร/สูญเสีย และ % เมื่อ Filter บางราคา จึงไม่นับซ้ำ
- การประมวลผลใหม่แทนที่ผลลัพธ์ทั้ง Week ใน transaction เดียว (`replace_week_results`) และ**คงหมายเหตุของผู้ใช้ไว้**
- เมื่อเปิด `require_login` ข้อมูลทุกตารางเข้าถึงได้เฉพาะผู้ใช้ที่ login และสถานะ active (`can_access_data()`, migration 0019); ตารางผลลัพธ์แก้ได้เฉพาะหมายเหตุ และแก้โอนจริงได้ผ่านหน้าปรับค่า (มี log) เท่านั้น
- Upload ตรวจว่าวันที่ในไฟล์อยู่ใน Week ที่เลือก (±1 วัน) และไฟล์ BDR130 ที่มีวันที่ซ้ำกับไฟล์ที่อัปแล้วจะถูกปฏิเสธ
