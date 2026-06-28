import "dotenv/config";
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { pool, verifyDatabaseConnection } from './src/config/db.js';

// 1. ตรวจสอบการเชื่อมต่อฐานข้อมูล
try {
  const connectedAt = await verifyDatabaseConnection();
  // ป้องกันกรณี connectedAt เป็น null หรือ undefined
  const timeString = connectedAt && typeof connectedAt.toISOString === 'function' 
    ? connectedAt.toISOString() 
    : (connectedAt ?? new Date().toISOString());
    
  console.log(`Database connected at ${timeString}`);
} catch (error) {
  console.error('Cannot connect to PostgreSQL:', error);
  process.exit(1);
}

// 2. ตั้งค่า Server และ Socket.IO
const httpServer = http.createServer(app);
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map((v) => v.trim());

const io = new SocketIOServer(httpServer, { 
  cors: { 
    origin: allowedOrigins, 
    methods: ['GET', 'POST'] 
  } 
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

// 3. เริ่มทำงาน Server
httpServer.listen(env.PORT, () => {
  console.log(`NexInvoice API running on port ${env.PORT}`);
});

// 4. ระบบ Graceful Shutdown แบบปลอดภัย
async function shutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown...`);

  // ตั้ง Timeout บังคับปิดกรณีที่ Connection เคลียร์ไม่หมดภายใน 10 วินาที
  const forceExitTimeout = setTimeout(() => {
    console.error('Forcing shutdown due to timeout...');
    process.exit(1);
  }, 10000);

  try {
    // ปิดการรับ Connection ใหม่ของ Socket.IO
    console.log('Closing Socket.IO server...');
    io.close(); 

    // ปิด HTTP Server (หยุดรับ Request ใหม่)
    console.log('Closing HTTP server...');
    await new Promise((resolve, reject) => {
      httpServer.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // ปิด Database Connection Pool หลังจาก Server ปิดแล้ว
    console.log('Closing Database pool...');
    await pool.end();

    console.log('Shutdown complete. Goodbye!');
    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// ดักจับสัญญาณปิดระบบ
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
