export const DOC_LABELS = { QT:'ใบเสนอราคา', IN:'ใบแจ้งหนี้', BN:'ใบวางบิล', RC:'ใบเสร็จรับเงิน', DO:'ใบส่งสินค้า' };
export const STATUS_LABELS = { DRAFT:'แบบร่าง', PENDING:'รอดำเนินการ', APPROVED:'อนุมัติแล้ว', PAID:'ชำระแล้ว', OVERDUE:'เกินกำหนด', CANCELLED:'ยกเลิก' };
export const CUSTOMER_TYPE_LABELS = { general:'บุคคลทั่วไป', private:'บริษัทเอกชน', government:'หน่วยงานราชการ' };
export const ITEM_TYPE_LABELS = { product:'สินค้า/อะไหล่', service:'ค่าแรง/บริการ', travel:'ค่าเดินทาง', other:'อื่น ๆ' };
export const ROLE_LABELS = { admin:'ผู้ดูแลระบบ', staff:'พนักงาน', viewer:'ผู้ตรวจสอบ' };

export function money(value) {
  return new Intl.NumberFormat('th-TH', { style:'currency', currency:'THB', minimumFractionDigits:2 }).format(Number(value || 0));
}
export function number(value) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value || 0));
}
export function dateThai(value, long = false) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', long ? { day:'numeric', month:'long', year:'numeric' } : { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(`${value}T00:00:00`));
}
export function today() { return new Date().toISOString().slice(0,10); }
export function currentMonth() { return new Date().toISOString().slice(0,7); }
export function escapeHtml(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
export function initials(name) {
  const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0,2).map((p) => p[0]).join('').toUpperCase();
}
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

const THAI_NUM = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function readSixDigits(num) {
  const s = String(num).padStart(6,'0');
  let out = '';
  for (let i=0;i<6;i++) {
    const digit = Number(s[i]);
    if (!digit) continue;
    const pos = 5-i;
    if (pos === 1 && digit === 1) out += '';
    else if (pos === 1 && digit === 2) out += 'ยี่';
    else if (pos === 0 && digit === 1 && out) out += 'เอ็ด';
    else out += THAI_NUM[digit];
    out += THAI_POS[pos];
  }
  return out;
}
function readInteger(num) {
  if (num === 0) return 'ศูนย์';
  const groups = [];
  let n = num;
  while (n > 0) { groups.unshift(n % 1_000_000); n = Math.floor(n / 1_000_000); }
  return groups.map((g, i) => {
    const text = readSixDigits(g);
    const millionCount = groups.length - i - 1;
    return text + 'ล้าน'.repeat(millionCount);
  }).join('');
}
export function thaiBahtText(value) {
  const amount = Math.round(Number(value || 0) * 100);
  const baht = Math.floor(amount / 100);
  const satang = amount % 100;
  return `${readInteger(baht)}บาท${satang === 0 ? 'ถ้วน' : `${readInteger(satang)}สตางค์`}`;
}
