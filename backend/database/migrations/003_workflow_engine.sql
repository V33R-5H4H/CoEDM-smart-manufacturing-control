-- ============================================================
-- WORKFLOW ENGINE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS workflows (
    workflow_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT         NOT NULL,
    status        TEXT         NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    error_msg     TEXT
);

CREATE TABLE IF NOT EXISTS workflow_steps (
    step_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id   UUID         NOT NULL REFERENCES workflows(workflow_id) ON DELETE CASCADE,
    step_order    INTEGER      NOT NULL,
    machine_id    TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    action        TEXT         NOT NULL,
    parameters    JSONB        DEFAULT '{}',
    status        TEXT         NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    error_msg     TEXT,
    UNIQUE (workflow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'workflows_updated_at'
    ) THEN
        CREATE TRIGGER workflows_updated_at
        BEFORE UPDATE ON workflows
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;
