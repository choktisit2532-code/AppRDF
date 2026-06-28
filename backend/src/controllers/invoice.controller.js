const db = require('../config/db');
const puppeteer = require('puppeteer');

exports.createInvoice = async (req, res) => {
  const { customer_id, items, tax_rate = 0.07 } = req.body;
  const io = req.app.get('io');
  
  try {
    // 1. Automatic unique invoice number generation
    const invNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // 2. Strict backend calculations
    let subtotal = 0;
    const computedItems = items.map(item => {
      const itemSubtotal = item.qty * item.price;
      subtotal += itemSubtotal;
      return { ...item, subtotal: itemSubtotal };
    });
    
    const tax = subtotal * tax_rate;
    const grandTotal = subtotal + tax;

    // 3. Database Transaction Isolation
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const [invResult] = await connection.query(
        'INSERT INTO invoices (invoice_number, customer_id, total, date) VALUES (?, ?, ?, NOW())',
        [invNumber, customer_id, grandTotal]
      );
      const invoiceId = invResult.insertId;

      for (let item of computedItems) {
        await connection.query(
          'INSERT INTO invoice_items (invoice_id, description, qty, price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [invoiceId, item.description, item.qty, item.price, item.subtotal]
        );
      }

      // Audit Logging
      await connection.query(
        'INSERT INTO audit_logs (user_id, action, timestamp) VALUES (?, ?, NOW())',
        [req.user.id, `Created Invoice: ${invNumber}`]
      );

      await connection.commit();
      connection.release();

      // 4. Emit Real-time WebSocket Updates
      io.emit('invoice_updates', { action: 'create', invoice_number: invNumber, total: grandTotal });

      res.status(201).json({ success: true, invoiceId, invoiceNumber: invNumber, grandTotal });
    } catch (txErr) {
      await connection.rollback();
      connection.release();
      throw txErr;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.generatePDF = async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch target invoice details from DB
    const [[invoice]] = await db.query('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!invoice) return res.status(404).json({ error: 'Invoice identity parameters not found.' });

    const htmlContent = `
      <html>
        <head><style>body { font-family: Arial, sans-serif; padding: 40px; } .header{font-size:24px; font-weight:bold;}</style></head>
        <body>
          <div class="header">NEXINVOICE SYSTEM</div>
          <p>Invoice Number: ${invoice.invoice_number}</p>
          <p>Date: ${invoice.date}</p>
          <h3>Grand Total: $${invoice.total}</h3>
        </body>
      </html>`;

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.page();
    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.contentType("application/pdf");
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};