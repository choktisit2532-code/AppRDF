# NexInvoice Full-Stack Starter — TongServiceIT

โปรเจกต์นี้รวม Backend, Frontend และ Database SQL ไว้ใน ZIP เดียว

## โครงสร้าง

```text
NexInvoice-FullStack/
├── backend/
├── frontend/
└── database/
```

## 1) สร้างฐานข้อมูล Supabase

เปิด Supabase > SQL Editor แล้วรัน:

```text
database/001_initial_schema.sql
```

## 2) ตั้งค่า Backend

```bash
cd backend
cp .env.example .env
npm install
```

แก้ `.env`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres
DATABASE_SSL=true
JWT_SECRET=change-this-to-a-random-string-at-least-32-characters
JWT_EXPIRES_IN=8h
FRONTEND_ORIGIN=http://localhost:5500
TRUST_PROXY=0
```

สร้าง Admin:

```bash
npm run create-admin -- "TongServiceIT Admin" "your@email.com" "your-strong-password"
```

รัน Backend:

```bash
npm run dev
```

ตรวจสอบ:

```text
http://localhost:3000/health
```

## 3) รัน Frontend

ไฟล์ `frontend/config.js` ตั้งค่า Backend URL:

```js
window.NEXINVOICE_CONFIG = {
  API_BASE_URL: 'http://localhost:3000',
  SOCKET_URL: 'http://localhost:3000'
};
```

รันด้วย static server เช่น:

```bash
cd frontend
python3 -m http.server 5500
```

แล้วเปิด:

```text
http://localhost:5500
```

## ฟังก์ชันที่มี

- Login JWT
- Role admin / staff / viewer
- เพิ่มและดูรายชื่อลูกค้า
- สร้างเอกสารหลายประเภท
- คำนวณยอดฝั่ง Backend
- VAT ปิดไว้เป็นค่าเริ่มต้น
- Snapshot ข้อมูลร้าน
- ลายเซ็น none / blank / digital
- ดูรายการเอกสาร
- แก้ข้อมูลร้านสำหรับ Admin
- Socket.IO แจ้งเอกสารใหม่
- Audit logs

## Deploy

### Render Backend

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- เพิ่ม Environment Variables ตาม `.env.example`

### Vercel Frontend

- Root Directory: `frontend`
- Framework Preset: Other
- Build Command: เว้นว่าง
- Output Directory: `.`
- แก้ URL ใน `frontend/config.js` ให้เป็น URL ของ Render
- ตั้ง `FRONTEND_ORIGIN` บน Render ให้ตรงกับ URL ของ Vercel

## ความปลอดภัย

- ห้าม commit `.env`
- ห้ามใส่ `DATABASE_URL` ใน Frontend
- ลายเซ็นควรอยู่ใน Private Storage
- Frontend แสดงยอดประมาณการเท่านั้น Backend จะคำนวณยอดจริงใหม่
