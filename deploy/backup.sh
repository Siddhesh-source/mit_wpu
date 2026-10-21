#!/usr/bin/env bash
# Nightly backup: consistent SQLite copy + sealed PDFs, keep 14 days. Optional upload to S3 if BACKUP_S3_BUCKET is set
# (needs the AWS CLI and an instance role allowed to s3:PutObject on that bucket).
set -euo pipefail
DIR=/var/backups/paperless
STAMP=$(date +%F)
sqlite3 /var/lib/paperless/app.sqlite ".backup '$DIR/app-$STAMP.sqlite'"
tar -czf "$DIR/storage-$STAMP.tgz" -C /var/lib/paperless storage
find "$DIR" -type f -mtime +14 -delete
if [ -n "${BACKUP_S3_BUCKET:-}" ] && command -v aws >/dev/null; then
  aws s3 cp "$DIR/app-$STAMP.sqlite" "s3://$BACKUP_S3_BUCKET/paperless/" --only-show-errors
  aws s3 cp "$DIR/storage-$STAMP.tgz" "s3://$BACKUP_S3_BUCKET/paperless/" --only-show-errors
fi
