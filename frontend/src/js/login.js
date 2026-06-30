import { request, setToken, getToken } from './api.js';
import { initTheme } from './theme.js';

initTheme();

if (getToken()) {
  request('/auth/me').then(() => location.replace('./app.html')).catch(() => {});
}

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const button = document.getElementById('login-button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
      })
    });
    setToken(result.token);
    location.replace('./app.html');
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'เข้าสู่ระบบ';
  }
});
