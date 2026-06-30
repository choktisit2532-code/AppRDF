import { request, getToken, clearToken, API_BASE_URL } from './api.js';
import { initTheme } from './theme.js';
import {
  DOC_LABELS, STATUS_LABELS, CUSTOMER_TYPE_LABELS, ITEM_TYPE_LABELS,
  ROLE_LABELS, money, dateThai, today, currentMonth, escapeHtml,
  initials, debounce
} from './utils.js';

initTheme();

if (!getToken()) location.replace('./index.html');

const state = {
  user: null,
  settings: null,
  customers: [],
  products: [],
  currentView: 'dashboard'
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}
function showGlobalError(error) {
  const box = $('#global-alert');
  box.textContent = error.message || String(error);
  box.className = 'alert alert-danger';
  box.classList.remove('hidden');
  setTimeout(() => box.classList.add('hidden'), 7000);
}
function setBusy(button, busy, busyText = 'กำลังบันทึก...') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
    refreshIcons();
  }
}

const viewMeta = {
  dashboard: ['แดชบอร์ดควบคุม', 'ภาพรวมรายได้ เอกสาร และงานค้าง'],
  documents: ['คลังเอกสาร', 'จัดการใบเสนอราคา ใบแจ้งหนี้ ใบวางบิล ใบเสร็จ และใบส่งสินค้า'],
  customers: ['รายชื่อลูกค้า', 'ข้อมูลลูกค้าและกฎการหัก ณ ที่จ่าย'],
  products: ['สินค้าและบริการ', 'คลังรายการมาตรฐาน ค่าแรง อะไหล่ และค่าใช้จ่าย'],
  reports: ['รายงานการเงิน', 'สรุปรายได้สินค้า ค่าแรง ภาษี และยอดรับสุทธิ'],
  settings: ['ตั้งค่าระบบ', 'ข้อมูลร้านค้า เลขเอกสาร และผู้ใช้งาน']
};

async function switchView(name) {
  if (name === 'settings' && state.user?.role !== 'admin') return;
  state.currentView = name;
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${name}`));
  $$('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === name));
  $('#page-title').textContent = viewMeta[name][0];
  $('#page-subtitle').textContent = viewMeta[name][1];
  $('#sidebar').classList.remove('open');
  $('#user-menu').classList.add('hidden');

  try {
    if (name === 'dashboard') await loadDashboard();
    if (name === 'documents') await loadDocuments();
    if (name === 'customers') await loadCustomers();
    if (name === 'products') await loadProducts();
    if (name === 'reports') await loadReport();
    if (name === 'settings') await Promise.all([loadSettings(), loadUsers()]);
  } catch (error) { showGlobalError(error); }
}

function applyRole() {
  const isAdmin = state.user.role === 'admin';
  const canWrite = ['admin', 'staff'].includes(state.user.role);
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin));
  $$('.writer-only').forEach((el) => el.classList.toggle('hidden', !canWrite));
  $('#current-user-name').textContent = state.user.name;
  $('#current-user-role').textContent = ROLE_LABELS[state.user.role];
  $('#user-avatar').textContent = initials(state.user.name);
}

async function loadInitialData() {
  const [me, settings, customers, products] = await Promise.all([
    request('/auth/me'),
    request('/settings'),
    request('/customers?limit=200&page=1'),
    request('/products?limit=200&page=1')
  ]);
  state.user = me.user;
  state.settings = settings.data;
  state.customers = customers.data;
  state.products = products.data;
  applyRole();
  applyBrand();
  renderCustomerOptions();
  ensureProductDatalist();
  await loadDashboard();
}

function applyBrand() {
  $('#sidebar-shop-name').textContent = state.settings?.shop_name_en || state.settings?.shop_name_th || 'Tong Service IT';
  if (state.settings?.logo_url) $('#sidebar-logo').src = state.settings.logo_url;
}

async function loadDashboard() {
  const result = await request('/dashboard');
  $('#stat-income').textContent = money(result.stats.monthly_income);
  $('#stat-outstanding').textContent = money(result.stats.outstanding);
  $('#stat-withholding').textContent = money(result.stats.yearly_withholding);
  $('#stat-fee').textContent = money(result.stats.yearly_transfer_fee);

  const overdue = $('#overdue-list');
  if (!result.overdue.length) {
    overdue.className = 'empty-state';
    overdue.innerHTML = '<i data-lucide="badge-check"></i><strong>ไม่มีงานค้าง</strong><span>เอกสารทั้งหมดอยู่ในสถานะปกติ</span>';
  } else {
    overdue.className = '';
    overdue.innerHTML = result.overdue.map((doc) => `
      <div class="overdue-item"><div><strong>${escapeHtml(doc.document_number)}</strong><div>${escapeHtml(doc.customer_name)}</div></div><div><small>ครบกำหนด ${dateThai(doc.due_date)}</small><strong>${money(doc.grand_total)}</strong></div></div>
    `).join('');
  }

  const recent = $('#recent-documents');
  recent.innerHTML = result.recent.length ? result.recent.map((doc) => `
    <tr><td><strong>${escapeHtml(doc.document_number)}</strong></td><td>${escapeHtml(doc.customer_name)}</td><td><span class="type-badge">${DOC_LABELS[doc.document_type]}</span></td><td>${money(doc.grand_total)}</td><td><span class="status-badge status-${doc.status}">${STATUS_LABELS[doc.status]}</span></td></tr>
  `).join('') : '<tr><td colspan="5" class="table-empty">ยังไม่มีเอกสาร</td></tr>';
  refreshIcons();
}

function renderCustomerOptions() {
  const select = $('#doc-customer');
  select.innerHTML = '<option value="">เลือกลูกค้า</option>' + state.customers.filter((c) => c.active).map((c) => `<option value="${c.id}">${escapeHtml(c.name)} · ${CUSTOMER_TYPE_LABELS[c.customer_type]}</option>`).join('');
}

async function loadCustomers(search = '') {
  const result = await request(`/customers?limit=200&page=1&search=${encodeURIComponent(search)}`);
  state.customers = result.data;
  $('#customer-count').textContent = `${result.pagination.total} รายการ`;
  $('#customers-table').innerHTML = result.data.length ? result.data.map((c) => `
    <tr><td><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.code || '')}</small></td><td>${CUSTOMER_TYPE_LABELS[c.customer_type]}</td><td>${escapeHtml(c.tax_id || '-')}</td><td>${escapeHtml(c.phone || '-')}</td><td>${c.withholding_enabled ? `${Number(c.withholding_rate)}% · ${c.withholding_basis === 'service' ? 'เฉพาะบริการ' : 'ยอดรวม'}` : 'ไม่หัก'}</td></tr>
  `).join('') : '<tr><td colspan="5" class="table-empty">ยังไม่มีข้อมูลลูกค้า</td></tr>';
  renderCustomerOptions();
}

async function loadProducts(search = '') {
  const result = await request(`/products?limit=200&page=1&search=${encodeURIComponent(search)}`);
  state.products = result.data;
  $('#product-count').textContent = `${result.pagination.total} รายการ`;
  $('#products-table').innerHTML = result.data.length ? result.data.map((p) => `
    <tr><td>${escapeHtml(p.sku || '-')}</td><td><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.category || '')}</small></td><td>${ITEM_TYPE_LABELS[p.item_type]}</td><td>${escapeHtml(p.unit)}</td><td>${money(p.price)}</td></tr>
  `).join('') : '<tr><td colspan="5" class="table-empty">ยังไม่มีสินค้า/บริการ</td></tr>';
  ensureProductDatalist();
}

function ensureProductDatalist() {
  let list = $('#product-master-list');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'product-master-list';
    document.body.appendChild(list);
  }
  list.innerHTML = state.products.filter((p) => p.active).map((p) => `<option value="${escapeHtml(p.name)}" data-id="${p.id}">${escapeHtml(p.sku || '')} · ${money(p.price)}</option>`).join('');
}

async function loadDocuments() {
  const search = $('#document-search').value.trim();
  const type = $('#document-type-filter').value;
  const status = $('#document-status-filter').value;
  const params = new URLSearchParams({ limit:'100', page:'1', search });
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  const result = await request(`/documents?${params}`);
  $('#documents-table').innerHTML = result.data.length ? result.data.map((d) => {
    const canWrite = ['admin','staff'].includes(state.user.role);
    const payButton = canWrite && ['PENDING','APPROVED','OVERDUE'].includes(d.status) && ['IN','BN'].includes(d.document_type)
      ? `<button class="table-button" data-status-id="${d.id}" data-status="PAID">ชำระแล้ว</button>` : '';
    return `<tr>
      <td><strong>${escapeHtml(d.document_number)}</strong></td><td>${dateThai(d.document_date)}</td><td>${escapeHtml(d.customer_name)}</td><td><span class="type-badge">${DOC_LABELS[d.document_type]}</span></td><td>${money(d.grand_total)}</td><td>${money(d.net_total)}</td><td><span class="status-badge status-${d.status}">${STATUS_LABELS[d.status]}</span></td><td><div class="table-actions"><button class="table-button" data-print-id="${d.id}">พิมพ์</button>${payButton}</div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="table-empty">ยังไม่มีเอกสาร <button class="link-button writer-only" data-open-document>สร้างเอกสารฉบับแรก</button></td></tr>';
  bindDynamicDocumentButtons();
}

function bindDynamicDocumentButtons() {
  $$('[data-print-id]').forEach((button) => button.addEventListener('click', () => window.open(`./print.html?id=${button.dataset.printId}`, '_blank', 'noopener')));
  $$('[data-status-id]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(`ยืนยันเปลี่ยนสถานะเป็น ${STATUS_LABELS[button.dataset.status]}?`)) return;
    try {
      await request(`/documents/${button.dataset.statusId}/status`, { method:'PATCH', body:JSON.stringify({ status:button.dataset.status }) });
      showToast('อัปเดตสถานะแล้ว');
      await Promise.all([loadDocuments(), loadDashboard()]);
    } catch (error) { showGlobalError(error); }
  }));
  $$('[data-open-document]').forEach((button) => button.addEventListener('click', openDocumentModal));
}

function resetCustomerDefaults() {
  const type = $('#customer-type').value;
  const defaults = {
    general: { enabled:false, threshold:0, fee:0, basis:'none' },
    private: { enabled:true, threshold:1000, fee:20, basis:'full' },
    government: { enabled:true, threshold:10000, fee:0, basis:'full' }
  }[type];
  $('#customer-withholding-enabled').checked = defaults.enabled;
  $('#customer-threshold').value = defaults.threshold;
  $('#customer-transfer-fee').value = defaults.fee;
  $('#customer-withholding-basis').value = defaults.basis;
}

$('#customer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  try {
    await request('/customers', { method:'POST', body:JSON.stringify({
      code: $('#customer-code').value,
      name: $('#customer-name').value,
      customer_type: $('#customer-type').value,
      tax_id: $('#customer-tax-id').value,
      branch_name: $('#customer-branch').value,
      address: $('#customer-address').value,
      phone: $('#customer-phone').value,
      email: $('#customer-email').value,
      withholding_enabled: $('#customer-withholding-enabled').checked,
      withholding_rate: $('#customer-withholding-rate').value,
      withholding_basis: $('#customer-withholding-basis').value,
      withholding_threshold: $('#customer-threshold').value,
      receipt_transfer_fee: $('#customer-transfer-fee').value,
      active: true
    }) });
    event.currentTarget.reset();
    $('#customer-type').value = 'general';
    $('#customer-withholding-rate').value = '3';
    resetCustomerDefaults();
    await loadCustomers();
    showToast('เพิ่มลูกค้าสำเร็จ');
  } catch (error) { showGlobalError(error); }
  finally { setBusy(button, false); }
});
$('#customer-type').addEventListener('change', resetCustomerDefaults);
$('#customer-search').addEventListener('input', debounce((e) => loadCustomers(e.target.value).catch(showGlobalError), 350));

$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  try {
    await request('/products', { method:'POST', body:JSON.stringify({
      sku: $('#product-sku').value,
      name: $('#product-name').value,
      item_type: $('#product-type').value,
      unit: $('#product-unit').value,
      price: $('#product-price').value,
      category: $('#product-category').value,
      active: true
    }) });
    event.currentTarget.reset();
    $('#product-unit').value = 'งาน';
    $('#product-price').value = '0';
    await loadProducts();
    showToast('เพิ่มสินค้า/บริการสำเร็จ');
  } catch (error) { showGlobalError(error); }
  finally { setBusy(button, false); }
});
$('#product-search').addEventListener('input', debounce((e) => loadProducts(e.target.value).catch(showGlobalError), 350));

const allowedTypesByCustomer = {
  general: ['QT','RC'],
  private: ['QT','IN','BN','RC','DO'],
  government: ['QT','RC','DO']
};
function selectedCustomer() {
  return state.customers.find((c) => String(c.id) === $('#doc-customer').value);
}
function updateAllowedDocumentTypes() {
  const customer = selectedCustomer();
  if (!customer) return;
  const allowed = allowedTypesByCustomer[customer.customer_type];
  $$('#doc-type option').forEach((option) => { option.disabled = !allowed.includes(option.value); });
  if (!allowed.includes($('#doc-type').value)) $('#doc-type').value = allowed[0];
}

function openDocumentModal() {
  $('#document-form').reset();
  $('#doc-date').value = today();
  $('#doc-discount').value = '0';
  $('#doc-type').value = 'QT';
  $('#document-items').innerHTML = '';
  addDocumentLine('item');
  $('#document-form-error').classList.add('hidden');
  $('#document-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  updateAllowedDocumentTypes();
  loadSourceDocuments().catch(showGlobalError);
  updateDocumentPreview();
  refreshIcons();
}
function closeDocumentModal() {
  $('#document-modal').classList.add('hidden');
  document.body.style.overflow = '';
}
$$('[data-close-document]').forEach((el) => el.addEventListener('click', closeDocumentModal));
$$('[data-open-document]').forEach((el) => el.addEventListener('click', openDocumentModal));
$('#quick-create').addEventListener('click', openDocumentModal);

function addDocumentLine(lineType = 'item', data = {}) {
  const row = document.createElement('div');
  row.className = `document-line ${lineType}-line`;
  row.dataset.lineType = lineType;
  row.dataset.productId = data.product_id || '';

  if (lineType === 'item') {
    row.innerHTML = `
      <select class="line-type"><option value="item">คิดเงิน</option><option value="section">หัวข้อ</option><option value="note">หมายเหตุ</option></select>
      <select class="line-item-type"><option value="service">ค่าแรง</option><option value="product">สินค้า</option><option value="travel">เดินทาง</option><option value="other">อื่น ๆ</option></select>
      <input class="line-description" list="product-master-list" placeholder="รายละเอียดสินค้า/บริการ" value="${escapeHtml(data.description || '')}">
      <input class="line-quantity" type="number" min="0.01" step="0.01" value="${data.quantity || 1}" aria-label="จำนวน">
      <input class="line-unit" value="${escapeHtml(data.unit || 'งาน')}" aria-label="หน่วย">
      <input class="line-price" type="number" min="0" step="0.01" value="${data.unit_price || 0}" aria-label="ราคา">
      <button class="remove-line" type="button" aria-label="ลบ">×</button>`;
    $('.line-item-type', row).value = data.item_type || 'service';
  } else {
    row.innerHTML = `
      <select class="line-type"><option value="${lineType}">${lineType === 'section' ? 'หัวข้อ' : 'หมายเหตุ'}</option><option value="item">คิดเงิน</option><option value="${lineType === 'section' ? 'note' : 'section'}">${lineType === 'section' ? 'หมายเหตุ' : 'หัวข้อ'}</option></select>
      <input class="line-description" placeholder="${lineType === 'section' ? 'ชื่อหัวข้อ เช่น ออฟฟิศหลัก' : 'ข้อความหมายเหตุ'}" value="${escapeHtml(data.description || '')}">
      <select class="line-style"><option value="${lineType === 'section' ? 'bold' : 'normal'}">${lineType === 'section' ? 'ตัวหนา' : 'ปกติ'}</option><option value="warning">ข้อความเตือน</option><option value="bold">ตัวหนา</option></select>
      <button class="remove-line" type="button" aria-label="ลบ">×</button>`;
  }

  $('.remove-line', row).addEventListener('click', () => { row.remove(); updateDocumentPreview(); });
  $('.line-type', row).addEventListener('change', (event) => {
    const replacementType = event.target.value;
    const description = $('.line-description', row)?.value || '';
    row.remove();
    addDocumentLine(replacementType, { description });
    updateDocumentPreview();
  });
  $$('input,select', row).forEach((input) => input.addEventListener('input', updateDocumentPreview));
  if (lineType === 'item') {
    $('.line-description', row).addEventListener('change', () => {
      const product = state.products.find((p) => p.name === $('.line-description', row).value);
      if (product) {
        row.dataset.productId = product.id;
        $('.line-item-type', row).value = product.item_type;
        $('.line-unit', row).value = product.unit;
        $('.line-price', row).value = product.price;
        updateDocumentPreview();
      }
    });
  }
  $('#document-items').appendChild(row);
  updateDocumentPreview();
}

$('#add-item').addEventListener('click', () => addDocumentLine('item'));
$('#add-section').addEventListener('click', () => addDocumentLine('section'));
$('#add-note').addEventListener('click', () => addDocumentLine('note'));

function collectDocumentItems() {
  return $$('.document-line', $('#document-items')).map((row) => {
    const lineType = row.dataset.lineType;
    if (lineType !== 'item') {
      return { line_type:lineType, description:$('.line-description', row).value, text_style:$('.line-style', row).value };
    }
    return {
      line_type:'item',
      item_type:$('.line-item-type', row).value,
      product_id: row.dataset.productId ? Number(row.dataset.productId) : null,
      description:$('.line-description', row).value,
      quantity:$('.line-quantity', row).value,
      unit:$('.line-unit', row).value,
      unit_price:$('.line-price', row).value,
      text_style:'normal'
    };
  }).filter((item) => item.description.trim());
}

function updateDocumentPreview() {
  let product = 0, service = 0, other = 0;
  $$('.document-line.item-line', $('#document-items')).forEach((row) => {
    const total = (Number($('.line-quantity', row)?.value) || 0) * (Number($('.line-price', row)?.value) || 0);
    const type = $('.line-item-type', row)?.value;
    if (type === 'product') product += total;
    else if (type === 'service') service += total;
    else other += total;
  });
  const subtotal = product + service + other;
  const total = Math.max(subtotal - (Number($('#doc-discount').value) || 0), 0);
  $('#preview-product').textContent = money(product);
  $('#preview-service').textContent = money(service);
  $('#preview-subtotal').textContent = money(subtotal);
  $('#preview-total').textContent = money(total);
}
$('#doc-discount').addEventListener('input', updateDocumentPreview);

async function loadSourceDocuments() {
  updateAllowedDocumentTypes();
  const customerId = $('#doc-customer').value;
  const targetType = $('#doc-type').value;
  const box = $('#source-documents-box');
  const list = $('#source-documents-list');
  list.innerHTML = '';
  if (!customerId || targetType === 'QT') { box.classList.add('hidden'); return; }
  const result = await request(`/documents/sources?target_type=${targetType}&customer_id=${customerId}`);
  if (!result.data.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  list.innerHTML = result.data.map((d) => `<label class="source-option"><input type="checkbox" value="${d.id}"> <strong>${escapeHtml(d.document_number)}</strong> · ${money(d.grand_total)}</label>`).join('');
}
$('#doc-customer').addEventListener('change', () => loadSourceDocuments().catch(showGlobalError));
$('#doc-type').addEventListener('change', () => loadSourceDocuments().catch(showGlobalError));

$('#document-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#save-document');
  const errorBox = $('#document-form-error');
  errorBox.classList.add('hidden');
  setBusy(button, true);
  try {
    const sourceIds = $$('#source-documents-list input:checked').map((input) => Number(input.value));
    const items = collectDocumentItems();
    const result = await request('/documents', { method:'POST', body:JSON.stringify({
      document_type: $('#doc-type').value,
      document_date: $('#doc-date').value,
      due_date: $('#doc-due-date').value || null,
      customer_id: Number($('#doc-customer').value),
      discount: $('#doc-discount').value || 0,
      remarks: $('#doc-remarks').value,
      payment_terms: $('#doc-payment-terms').value,
      delivery_days: $('#doc-delivery-days').value ? Number($('#doc-delivery-days').value) : null,
      quotation_validity_days: $('#doc-validity-days').value ? Number($('#doc-validity-days').value) : null,
      source_document_ids: sourceIds,
      items
    }) });
    closeDocumentModal();
    showToast(`สร้าง ${result.data.document_number} สำเร็จ`);
    await Promise.all([loadDashboard(), loadDocuments()]);
    if (confirm('สร้างเอกสารสำเร็จ ต้องการเปิดหน้าพิมพ์หรือไม่?')) window.open(`./print.html?id=${result.data.id}`, '_blank', 'noopener');
  } catch (error) {
    errorBox.textContent = error.details?.length ? `${error.message}: ${error.details.map((d) => d.message).join(', ')}` : error.message;
    errorBox.classList.remove('hidden');
  } finally { setBusy(button, false); }
});

async function loadReport() {
  const month = $('#report-month').value || currentMonth();
  $('#report-month').value = month;
  const result = await request(`/reports/monthly?month=${month}`);
  const label = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month:'long', year:'numeric' }).format(new Date(`${month}-01T00:00:00`));
  $('#report-month-label').textContent = label;
  $('#report-product-total').textContent = money(result.summary.product_total);
  $('#report-service-total').textContent = money(result.summary.service_total);
  $('#report-received-total').textContent = money(result.summary.received_total);
  $('#report-withholding-total').textContent = money(result.summary.withholding_total);
  $('#report-table').innerHTML = result.documents.length ? result.documents.map((d) => `<tr><td>${dateThai(d.document_date)}</td><td>${escapeHtml(d.document_number)}</td><td>${escapeHtml(d.customer_name)}</td><td>${DOC_LABELS[d.document_type]}</td><td>${money(d.grand_total)}</td><td>${money(d.withholding_amount)}</td><td>${money(d.transfer_fee)}</td><td>${money(d.net_total)}</td></tr>`).join('') : '<tr><td colspan="8" class="table-empty">ไม่มีข้อมูลในเดือนนี้</td></tr>';
}
$('#load-report').addEventListener('click', () => loadReport().catch(showGlobalError));
$('#print-report').addEventListener('click', () => { document.body.classList.add('print-mode-report'); window.print(); });
window.addEventListener('afterprint', () => document.body.classList.remove('print-mode-report'));

function renderNumberingSettings(config) {
  const types = ['QT','IN','BN','RC','DO'];
  $('#numbering-settings').innerHTML = types.map((type) => {
    const c = config[type] || { prefix:type,digits:3,period:'BYYMM',separator:'-' };
    return `<div class="numbering-row" data-numbering-type="${type}"><strong>${type}</strong><label>Prefix<input class="num-prefix" value="${escapeHtml(c.prefix)}"></label><label>หลัก<input class="num-digits" type="number" min="1" max="8" value="${c.digits}"></label><label>รอบเลข<select class="num-period"><option value="BYYMM">ปี พ.ศ.+เดือน</option><option value="BYY">ปี พ.ศ.</option><option value="MMBYY">เดือน+ปี พ.ศ.</option><option value="NONE">ต่อเนื่อง</option></select></label><label>คั่น<input class="num-separator" value="${escapeHtml(c.separator ?? '-')}"></label></div>`;
  }).join('');
  $$('[data-numbering-type]').forEach((row) => { $('.num-period', row).value = config[row.dataset.numberingType]?.period || 'BYYMM'; });
}

async function loadSettings() {
  const result = await request('/settings');
  state.settings = result.data;
  const s = result.data;
  $('#setting-shop-th').value = s.shop_name_th || '';
  $('#setting-shop-en').value = s.shop_name_en || '';
  $('#setting-owner').value = s.shop_owner || '';
  $('#setting-address').value = s.shop_address || '';
  $('#setting-tax-id').value = s.shop_tax_id || '';
  $('#setting-phone').value = s.shop_phone || '';
  $('#setting-email').value = s.shop_email || '';
  $('#setting-scb').value = s.scb_bank_details || '';
  $('#setting-ktb').value = s.ktb_bank_details || '';
  $('#setting-logo-url').value = s.logo_url || '';
  $('#setting-signature-url').value = s.saved_signature_url || '';
  $('#feature-realtime').checked = Boolean(s.feature_flags?.realtime);
  $('#feature-auto-backup').checked = Boolean(s.feature_flags?.automatic_backup);
  $('#feature-email').checked = Boolean(s.feature_flags?.email_notifications);
  renderNumberingSettings(s.numbering_config || {});
  applyBrand();
}

function collectNumberingConfig() {
  const config = {};
  $$('[data-numbering-type]').forEach((row) => {
    config[row.dataset.numberingType] = {
      prefix: $('.num-prefix', row).value,
      digits: Number($('.num-digits', row).value),
      period: $('.num-period', row).value,
      separator: $('.num-separator', row).value
    };
  });
  return config;
}

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  try {
    const result = await request('/settings', { method:'PUT', body:JSON.stringify({
      shop_name_th: $('#setting-shop-th').value,
      shop_name_en: $('#setting-shop-en').value,
      shop_owner: $('#setting-owner').value,
      shop_address: $('#setting-address').value,
      shop_tax_id: $('#setting-tax-id').value,
      shop_phone: $('#setting-phone').value,
      shop_email: $('#setting-email').value,
      scb_bank_details: $('#setting-scb').value,
      ktb_bank_details: $('#setting-ktb').value,
      logo_url: $('#setting-logo-url').value,
      saved_signature_url: $('#setting-signature-url').value,
      numbering_config: collectNumberingConfig(),
      feature_flags: {
        realtime: $('#feature-realtime').checked,
        automatic_backup: $('#feature-auto-backup').checked,
        email_notifications: $('#feature-email').checked
      }
    }) });
    state.settings = result.data;
    applyBrand();
    showToast('บันทึกการตั้งค่าแล้ว');
  } catch (error) { showGlobalError(error); }
  finally { setBusy(button, false); }
});

async function loadUsers() {
  if (state.user.role !== 'admin') return;
  const result = await request('/users');
  $('#users-table').innerHTML = result.data.map((u) => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${ROLE_LABELS[u.role]}</td><td>${u.active ? '<span class="status-badge status-PAID">ใช้งาน</span>' : '<span class="status-badge status-CANCELLED">ปิด</span>'}</td></tr>`).join('');
}
$('#user-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true);
  try {
    await request('/users', { method:'POST', body:JSON.stringify({
      name: $('#new-user-name').value,
      email: $('#new-user-email').value,
      password: $('#new-user-password').value,
      role: $('#new-user-role').value
    }) });
    event.currentTarget.reset();
    await loadUsers();
    showToast('เพิ่มผู้ใช้งานแล้ว');
  } catch (error) { showGlobalError(error); }
  finally { setBusy(button, false); }
});

$('#backup-button').addEventListener('click', async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/backup/export`, { headers:{ Authorization:`Bearer ${getToken()}` } });
    if (!response.ok) throw new Error('สำรองข้อมูลไม่สำเร็จ');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tong-billing-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลดข้อมูลสำรองแล้ว');
  } catch (error) { showGlobalError(error); }
});

$$('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#document-filter-button').addEventListener('click', () => loadDocuments().catch(showGlobalError));
$('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#user-menu-button').addEventListener('click', () => $('#user-menu').classList.toggle('hidden'));
$('#logout-button').addEventListener('click', () => { clearToken(); location.replace('./index.html'); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#document-modal').classList.contains('hidden')) closeDocumentModal();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#document-search').focus(); switchView('documents'); }
});

refreshIcons();
loadInitialData().catch((error) => {
  if (error.status === 401) { clearToken(); location.replace('./index.html'); }
  else showGlobalError(error);
});
