const Decimal = require('decimal.js');

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

function decimal(value = 0) {
    return new Decimal(value || 0);
}

function money(value = 0) {
    return decimal(value).toDecimalPlaces(2);
}

function calculateDocumentTotals({ items, discount = 0, customer, documentType }) {
    const calculatedItems = [];
    let productSubtotal = decimal(0);
    let serviceSubtotal = decimal(0);
    let otherSubtotal = decimal(0);

    items.forEach((item, index) => {
        if (item.line_type !== 'item') {
            calculatedItems.push({
                sort_order: index + 1,
                line_type: item.line_type,
                item_type: null,
                product_id: null,
                description: item.description.trim(),
                quantity: null,
                unit: null,
                unit_price: null,
                line_total: '0.00',
                text_style: item.text_style || (item.line_type === 'section' ? 'bold' : 'normal')
            });
            return;
        }

        const quantity = decimal(item.quantity);
        const unitPrice = money(item.unit_price);
        const lineTotal = quantity.mul(unitPrice).toDecimalPlaces(2);
        const type = item.item_type;

        if (type === 'product') productSubtotal = productSubtotal.add(lineTotal);
        else if (type === 'service') serviceSubtotal = serviceSubtotal.add(lineTotal);
        else otherSubtotal = otherSubtotal.add(lineTotal);

        calculatedItems.push({
            sort_order: index + 1,
            line_type: 'item',
            item_type: type,
            product_id: item.product_id || null,
            description: item.description.trim(),
            quantity: quantity.toFixed(2),
            unit: (item.unit || 'งาน').trim(),
            unit_price: unitPrice.toFixed(2),
            line_total: lineTotal.toFixed(2),
            text_style: item.text_style || 'normal'
        });
    });

    const subtotal = productSubtotal.add(serviceSubtotal).add(otherSubtotal).toDecimalPlaces(2);
    const discountValue = money(discount);
    if (discountValue.gt(subtotal)) {
        throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');
    }

    const grandTotal = subtotal.minus(discountValue).toDecimalPlaces(2);
    let withholdingRate = decimal(0);
    let withholdingBase = decimal(0);

    if (
        customer.withholding_enabled &&
        decimal(grandTotal).gt(customer.withholding_threshold || 0) &&
        customer.withholding_basis !== 'none'
    ) {
        withholdingRate = decimal(customer.withholding_rate || 0);
        if (customer.withholding_basis === 'service') {
            withholdingBase = Decimal.max(serviceSubtotal.minus(discountValue), 0);
        } else {
            withholdingBase = grandTotal;
        }
    }

    const withholdingAmount = withholdingBase
        .mul(withholdingRate)
        .div(100)
        .toDecimalPlaces(2);
    const transferFee = documentType === 'RC'
        ? money(customer.receipt_transfer_fee || 0)
        : decimal(0);
    const netTotal = Decimal.max(
        grandTotal.minus(withholdingAmount).minus(transferFee),
        0
    ).toDecimalPlaces(2);

    return {
        items: calculatedItems,
        productSubtotal: productSubtotal.toFixed(2),
        serviceSubtotal: serviceSubtotal.toFixed(2),
        otherSubtotal: otherSubtotal.toFixed(2),
        subtotal: subtotal.toFixed(2),
        discount: discountValue.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        withholdingRate: withholdingRate.toFixed(2),
        withholdingBase: withholdingBase.toFixed(2),
        withholdingAmount: withholdingAmount.toFixed(2),
        transferFee: transferFee.toFixed(2),
        netTotal: netTotal.toFixed(2)
    };
}

module.exports = { decimal, money, calculateDocumentTotals };
