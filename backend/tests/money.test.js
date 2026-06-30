const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateDocumentTotals } = require('../src/utils/money');

const privateCustomer = {
    withholding_enabled: true,
    withholding_rate: '3',
    withholding_basis: 'full',
    withholding_threshold: '1000',
    receipt_transfer_fee: '20'
};

test('service-first receipt calculates withholding and transfer fee', () => {
    const result = calculateDocumentTotals({
        items: [
            { line_type: 'item', item_type: 'product', description: 'อุปกรณ์', quantity: '1', unit: 'ชุด', unit_price: '1490' },
            { line_type: 'item', item_type: 'service', description: 'ค่าแรงติดตั้ง', quantity: '1', unit: 'งาน', unit_price: '1000' }
        ],
        discount: 0,
        customer: privateCustomer,
        documentType: 'RC'
    });
    assert.equal(result.grandTotal, '2490.00');
    assert.equal(result.withholdingAmount, '74.70');
    assert.equal(result.transferFee, '20.00');
    assert.equal(result.netTotal, '2395.30');
});

test('section and note lines do not affect total', () => {
    const result = calculateDocumentTotals({
        items: [
            { line_type: 'section', description: 'ออฟฟิศหลัก', text_style: 'bold' },
            { line_type: 'note', description: 'หมายเหตุ', text_style: 'warning' },
            { line_type: 'item', item_type: 'service', description: 'ซ่อม', quantity: 1, unit: 'งาน', unit_price: 500 }
        ],
        discount: 0,
        customer: { ...privateCustomer, withholding_threshold: '9999' },
        documentType: 'QT'
    });
    assert.equal(result.grandTotal, '500.00');
    assert.equal(result.withholdingAmount, '0.00');
});
