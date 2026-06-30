const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canEditDocument,
    canCancelDocument,
    canSoftDeleteDocument
} = require('../src/utils/document-lifecycle');

test('staff can edit and delete pending documents', () => {
    assert.equal(canEditDocument('staff', 'PENDING'), true);
    assert.equal(canSoftDeleteDocument('staff', 'PENDING'), true);
});

test('staff cannot edit approved documents', () => {
    assert.equal(canEditDocument('staff', 'APPROVED'), false);
    assert.equal(canCancelDocument('staff', 'APPROVED'), false);
});

test('admin can edit and cancel approved documents', () => {
    assert.equal(canEditDocument('admin', 'APPROVED'), true);
    assert.equal(canCancelDocument('admin', 'APPROVED'), true);
});

test('paid documents cannot be edited, cancelled or deleted', () => {
    assert.equal(canEditDocument('admin', 'PAID'), false);
    assert.equal(canCancelDocument('admin', 'PAID'), false);
    assert.equal(canSoftDeleteDocument('admin', 'PAID'), false);
});

test('soft-deleted documents cannot be modified again', () => {
    const deletedAt = new Date().toISOString();
    assert.equal(canEditDocument('admin', 'PENDING', deletedAt), false);
    assert.equal(canCancelDocument('admin', 'PENDING', deletedAt), false);
    assert.equal(canSoftDeleteDocument('admin', 'PENDING', deletedAt), false);
});
