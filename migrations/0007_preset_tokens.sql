ALTER TABLE presets ADD COLUMN token_hash TEXT;

DROP INDEX presets_by_sharer;
ALTER TABLE presets DROP COLUMN ip_hash;
