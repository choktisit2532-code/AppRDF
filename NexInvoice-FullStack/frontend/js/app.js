const config = window.NEXINVOICE_CONFIG;
const state = { token: localStorage.getItem('nexinvoice_token'), user: null, customers: [], documents: [] };
const $ = (s) => document.querySelector(s);
const money = (v) => new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(Number(v||0));
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function api(path,{method='GET',body}={}){
  const res=await fetch(`${config.API_BASE_URL}${path}`,{method,headers:{'Content-Type':'application/json',...(state.token?{Authorization:`Bearer ${state.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=await res.json().catch(()=>({}));
  if(!res.ok){ if(res.status===401) logout(false); throw new Error(json?.error?.message||'เกิดข้อผิดพลาด'); }
  return json.data;
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),2600)}
function showApp(){ $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#userLabel').textContent=`${state.user.name} (${state.user.role})`; }
function logout(show=true){localStorage.removeItem('nexinvoice_token');state.token=null;state.user=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden');if(show)toast('ออกจากระบบแล้ว')}
function showPage(name){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(`#page-${name}`).classList.remove('hidden');document.querySelectorAll('.nav-btn[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('#pageTitle').textContent={'dashboard':'Dashboard','documents':'เอกสาร','create-document':'สร้างเอกสาร','customers':'ลูกค้า','settings':'ตั้งค่าร้าน'}[name]||name;if(name==='settings')loadSettings();if(name==='create-document')populateCustomerSelect();}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{const data=await api('/api/auth/login',{method:'POST',body:{email:$('#loginEmail').value,password:$('#loginPassword').value}});state.token=data.token;state.user=data.user;localStorage.setItem('nexinvoice_token',data.token);showApp();await loadAll();}catch(err){$('#loginError').textContent=err.message}});
$('#logoutButton').addEventListener('click',()=>logout());
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));

async function loadAll(){await Promise.all([loadCustomers(),loadDocuments()]);renderDashboard();connectSocket()}
async function loadCustomers(){state.customers=await api('/api/customers?limit=100');renderCustomers();populateCustomerSelect()}
async function loadDocuments(){const result=await api('/api/documents?limit=100');state.documents=Array.isArray(result)?result:result.data||[];renderDocuments()}
function renderCustomers(){const el=$('#customersTable');if(!state.customers.length){el.innerHTML='<div class="empty">ยังไม่มีลูกค้า</div>';return}el.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>ชื่อ</th><th>โทรศัพท์</th><th>อีเมล</th></tr></thead><tbody>${state.customers.map(c=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone||'-')}</td><td>${escapeHtml(c.email||'-')}</td></tr>`).join('')}</tbody></table></div>`}
function renderDocuments(){const el=$('#documentsTable');const rows=state.documents;if(!rows.length){el.innerHTML='<div class="empty">ยังไม่มีเอกสาร</div>';return}el.innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>เลขเอกสาร</th><th>ประเภท</th><th>ลูกค้า</th><th>วันที่</th><th>สถานะ</th><th>ยอดรวม</th></tr></thead><tbody>${rows.map(d=>`<tr><td>${escapeHtml(d.documentNumber)}</td><td>${escapeHtml(d.documentType)}</td><td>${escapeHtml(d.customerName||'-')}</td><td>${escapeHtml(String(d.issueDate||'').slice(0,10))}</td><td><span class="badge">${escapeHtml(d.status)}</span></td><td>${money(d.grandTotal)}</td></tr>`).join('')}</tbody></table></div>`;$('#recentDocuments').innerHTML=el.innerHTML}
function renderDashboard(){$('#statDocuments').textContent=state.documents.length;$('#statCustomers').textContent=state.customers.length;$('#statTotal').textContent=money(state.documents.reduce((s,d)=>s+Number(d.grandTotal||0),0));renderDocuments()}
function populateCustomerSelect(){const el=$('#documentCustomer');if(!el)return;el.innerHTML='<option value="">เลือกลูกค้า</option>'+state.customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}

$('#customerForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await api('/api/customers',{method:'POST',body:Object.fromEntries(f.entries())});e.currentTarget.reset();await loadCustomers();renderDashboard();toast('เพิ่มลูกค้าแล้ว')}catch(err){toast(err.message)}});

function addItem(values={description:'',quantity:1,unitPrice:0}){const row=document.createElement('div');row.className='items-grid';row.innerHTML=`<div class="field"><label>รายละเอียด</label><input class="item-description" required value="${escapeHtml(values.description)}"></div><div class="field"><label>จำนวน</label><input class="item-quantity" type="number" min="0.001" step="0.001" required value="${values.quantity}"></div><div class="field"><label>ราคาต่อหน่วย</label><input class="item-price" type="number" min="0" step="0.01" required value="${values.unitPrice}"></div><button type="button" class="btn btn-danger remove-item">×</button>`;row.querySelector('.remove-item').onclick=()=>{row.remove();updatePreview()};row.querySelectorAll('input').forEach(i=>i.addEventListener('input',updatePreview));$('#itemsContainer').appendChild(row);updatePreview()}
function updatePreview(){const subtotal=[...document.querySelectorAll('.items-grid')].reduce((s,r)=>s+Number(r.querySelector('.item-quantity').value||0)*Number(r.querySelector('.item-price').value||0),0);const discount=Number($('#discountAmount').value||0);$('#previewSubtotal').textContent=money(subtotal);$('#previewDiscount').textContent=money(discount);$('#previewTotal').textContent=money(Math.max(0,subtotal-discount))}
$('#addItemButton').addEventListener('click',()=>addItem());$('#discountAmount').addEventListener('input',updatePreview);addItem();document.querySelector('#documentForm [name=issueDate]').value=new Date().toISOString().slice(0,10);

$('#documentForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const items=[...document.querySelectorAll('.items-grid')].map(r=>({description:r.querySelector('.item-description').value,quantity:Number(r.querySelector('.item-quantity').value),unitPrice:Number(r.querySelector('.item-price').value)}));const body={documentType:f.get('documentType'),customerId:Number(f.get('customerId')),issueDate:f.get('issueDate'),dueDate:f.get('dueDate')||null,discountAmount:Number(f.get('discountAmount')||0),signatureMode:f.get('signatureMode'),notes:f.get('notes')||null,items};try{const doc=await api('/api/documents',{method:'POST',body});toast(`สร้าง ${doc.documentNumber} แล้ว`);e.currentTarget.reset();$('#itemsContainer').innerHTML='';addItem();document.querySelector('#documentForm [name=issueDate]').value=new Date().toISOString().slice(0,10);await loadDocuments();renderDashboard();showPage('documents')}catch(err){toast(err.message)}});

async function loadSettings(){try{const s=await api('/api/company-settings');const f=$('#settingsForm');for(const [k,v] of Object.entries(s)){if(f.elements[k])f.elements[k].value=v??''}f.elements.isVatRegistered.value=String(s.isVatRegistered);if(state.user.role!=='admin')f.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true)}catch(err){toast(err.message)}}
$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const body=Object.fromEntries(f.entries());body.isVatRegistered=body.isVatRegistered==='true';body.defaultTaxRate=Number(body.defaultTaxRate||0);try{await api('/api/company-settings',{method:'PATCH',body});toast('บันทึกข้อมูลร้านแล้ว')}catch(err){toast(err.message)}});

let socket;
function connectSocket(){if(socket||!window.io)return;socket=window.io(config.SOCKET_URL);socket.on('document:created',async()=>{await loadDocuments();renderDashboard();toast('มีเอกสารใหม่')});socket.on('document:status-updated',async()=>{await loadDocuments();renderDashboard()})}

(async function init(){if(!state.token)return;try{const data=await api('/api/auth/me');state.user=data.user;showApp();await loadAll()}catch{logout(false)}})();
