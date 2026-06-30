const ALLOWED_DOCUMENT_TYPES = {
    general: ['QT', 'RC'],
    private: ['QT', 'IN', 'BN', 'RC', 'DO'],
    government: ['QT', 'RC', 'DO']
};

function assertDocumentTypeAllowed(customerType, documentType) {
    return (ALLOWED_DOCUMENT_TYPES[customerType] || []).includes(documentType);
}

function allowedSourceTypes(customerType, targetType) {
    if (targetType === 'BN') return ['IN'];
    if (targetType === 'IN' || targetType === 'DO') return ['QT'];
    if (targetType === 'RC') {
        return customerType === 'private' ? ['QT', 'IN'] : ['QT'];
    }
    return [];
}

module.exports = { ALLOWED_DOCUMENT_TYPES, assertDocumentTypeAllowed, allowedSourceTypes };
