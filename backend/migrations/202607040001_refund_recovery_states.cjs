exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
    ALTER TABLE refunds ADD CONSTRAINT refunds_status_check
      CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'manual_review', 'cancelled'));

    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;
    ALTER TABLE returns ADD CONSTRAINT returns_status_check
      CHECK (status IN (
        'pending', 'approved', 'rejected', 'received', 'refund_processing',
        'refunded', 'manual_review', 'cancelled'
      ));
  `);
};

exports.down = async (knex) => {
  await knex.raw(`
    UPDATE returns SET status = 'approved' WHERE status = 'manual_review';
    UPDATE refunds SET status = 'failed' WHERE status = 'manual_review';

    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;
    ALTER TABLE returns ADD CONSTRAINT returns_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'received', 'refund_processing', 'refunded', 'cancelled'));

    ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
    ALTER TABLE refunds ADD CONSTRAINT refunds_status_check
      CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled'));
  `);
};
