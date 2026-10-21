-- Signature boxes belong to a step and, when several people sign the same step in parallel, to one role in it.
-- NULL role = whoever signs that step (documents for signature, where every step has one person).
ALTER TABLE sign_fields ADD COLUMN role TEXT;
