const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const invoiceRoutes = require('./routes/invoice.routes');

const app = express();

app.use(cors());
app.use(express.json());

// Base Route
app.get('/', (req, res) => res.json({ status: "NexInvoice API Operational", version: "1.0.0" }));

// Route Registration
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);

// Error Handler Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

module.exports = app;