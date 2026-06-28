BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'staff', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name VARCHAR(255) NOT NULL DEFAULT 'TongServiceIT',
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  tax_id VARCHAR(50),

  logo_storage_path TEXT,
  signature_storage_path TEXT,
  signer_name VARCHAR(255),
  signer_position VARCHAR(255),

  is_vat_registered BOOLEAN NOT NULL DEFAULT FALSE,
  default_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO company_settings (
  id,
  company_name,
  is_vat_registered,
  default_tax_rate
)
VALUES (1, 'TongServiceIT', FALSE, 0)
ON CONFLICT (id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS document_number_seq START 1;

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,

  document_type VARCHAR(30) NOT NULL CHECK (
    document_type IN (
      'repair_order',
      'quotation',
      'invoice',
      'receipt',
      'delivery_note',
      'billing_note',
      'deposit_receipt',
      'credit_adjustment'
    )
  ),

  document_number VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  customer_id BIGINT REFERENCES customers(id) ON DELETE RESTRICT,
  related_document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,

  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  currency CHAR(3) NOT NULL DEFAULT 'THB',

  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),

  tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),

  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),

  notes TEXT,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),

  signature_mode VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (signature_mode IN ('none', 'digital', 'blank')),

  -- Seller snapshot: เอกสารเก่าไม่เปลี่ยนตามข้อมูลร้านปัจจุบัน
  seller_name VARCHAR(255) NOT NULL,
  seller_address TEXT,
  seller_phone VARCHAR(50),
  seller_email VARCHAR(255),
  seller_tax_id VARCHAR(50),
  seller_logo_storage_path TEXT,
  seller_signature_storage_path TEXT,
  signer_name VARCHAR(255),
  signer_position VARCHAR(255),

  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_items (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS document_relations (
  id BIGSERIAL PRIMARY KEY,
  source_document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relation_type VARCHAR(30) NOT NULL CHECK (
    relation_type IN (
      'converted_to',
      'payment_for',
      'delivery_for',
      'billing_includes',
      'adjusts'
    )
  ),
  UNIQUE (source_document_id, target_document_id, relation_type)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_customer_id
  ON documents(customer_id);

CREATE INDEX IF NOT EXISTS idx_documents_type_status
  ON documents(document_type, status);

CREATE INDEX IF NOT EXISTS idx_documents_issue_date
  ON documents(issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_document_items_document_id
  ON document_items(document_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION generate_document_number(doc_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  sequence_value BIGINT;
BEGIN
  sequence_value := nextval('document_number_seq');

  RETURN UPPER(doc_prefix)
    || '-'
    || TO_CHAR(CURRENT_DATE, 'YYYYMM')
    || '-'
    || LPAD(sequence_value::TEXT, 6, '0');
END;
$$;

COMMIT;
