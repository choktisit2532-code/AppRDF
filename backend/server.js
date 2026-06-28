import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { app } from './src/app.js';
import { env } from './src/config/env.js';
import { pool, verifyDatabaseConnection } from './src/config/db.js';

try {
  const connectedAt = await verifyDatabaseConnection();
  console.log(`Database connected at ${connectedAt.toISOString?.() ?? connectedAt}`);
} catch (error) {
  console.error('Cannot connect to PostgreSQL:', error);
  process.exit(1);
}

const httpServer = http.createServer(app);
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map((v) => v.trim());
const io = new SocketIOServer(httpServer, { cors: { origin: allowedOrigins, methods: ['GET','POST'] } });
app.set('io', io);
io.on('connection', (socket) => console.log(`Socket connected: ${socket.id}`));

httpServer.listen(env.PORT, () => console.log(`NexInvoice API running on port ${env.PORT}`));

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  io.close();
  httpServer.close(async () => { await pool.end(); process.exit(0); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
