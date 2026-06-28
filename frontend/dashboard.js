const API_URL = "https://tongserviceit-nexinvoice.onrender.com/"; // Replace this with your actual Render service deployment URL
const token = localStorage.getItem('token');

if (!token) {
  window.location.href = 'login.html';
}

// Instantiate Socket connection to backend ecosystem
const socket = io(API_URL);

socket.on('invoice_updates', (data) => {
  const alertBox = document.getElementById('liveAlert');
  if(alertBox) {
    alertBox.innerText = `🔔 Real-time event: ${data.invoice_number} generated successfully ($${data.total})`;
    alertBox.style.display = 'block';
  }
});

async function triggerCreateInvoice() {
  try {
    const response = await fetch(`${API_URL}/api/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        customer_id: 1,
        items: [
          { description: 'Cloud Engineering Consultation', qty: 2, price: 150.00 }
        ]
      })
    });
    const result = await response.json();
    console.log('Invoice saved:', result);
  } catch (error) {
    console.error('Submission failed:', error);
  }
}
