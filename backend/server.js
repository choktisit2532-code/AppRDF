const http = require('http');
const app = require('./src/app');
const { Server } = require('socket.io');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.IO with CORS fallback
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Attach Socket.IO to global request object
app.set('io', io);

io.on('connection', (socket) => {
  console.log(`📡 Client connected: ${socket.id}`);
  socket.on('disconnect', () => console.log('📡 Client disconnected'));
});

server.listen(PORT, () => {
  console.log(`🚀 NexInvoice Backend Engine running on port ${PORT}`);
});