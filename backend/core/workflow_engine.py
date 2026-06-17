import asyncio
import logging
from typing import List, Dict, Any
from backend.database.db import SessionLocal
from backend.core.timezone import ist_now
from sqlalchemy import text
from backend.core.alarm_manager import alarm_manager
import uuid

logger = logging.getLogger(__name__)

class WorkflowEngine:
    """
    Centralized WorkflowEngine that orchestrates tasks across machines.
    """
    def __init__(self):
        self._running = False
        self._poll_interval = 2.0  # Seconds between polls
    
    async def start(self):
        """Starts the background engine loop."""
        if self._running:
            return
        self._running = True
        logger.info("[WorkflowEngine] Started background engine loop.")
        asyncio.create_task(self._engine_loop())
        
    async def stop(self):
        """Stops the engine loop."""
        self._running = False
        logger.info("[WorkflowEngine] Stopping background engine loop.")

    def start_workflow(self, name: str, steps: List[Dict[str, Any]]) -> str:
        """
        Creates a new workflow and its steps in the database.
        Returns the new workflow_id.
        """
        session = SessionLocal()
        try:
            workflow_id = session.execute(text("""
                INSERT INTO workflows (name, status, started_at)
                VALUES (:name, 'running', :now)
                RETURNING workflow_id
            """), {"name": name, "now": ist_now()}).fetchone()[0]
            
            for i, step in enumerate(steps):
                session.execute(text("""
                    INSERT INTO workflow_steps (workflow_id, step_order, machine_id, action, parameters, status)
                    VALUES (:wf_id, :order, :machine_id, :action, :params, 'pending')
                """), {
                    "wf_id": workflow_id,
                    "order": i + 1,
                    "machine_id": step.get("machine_id"),
                    "action": step.get("action"),
                    "params": str(step.get("parameters", {}).copy()).replace("'", '"') # Simple JSON dump for demo
                })
            session.commit()
            logger.info(f"[WorkflowEngine] Started new workflow: {workflow_id} ({name})")
            return str(workflow_id)
        except Exception as e:
            session.rollback()
            logger.error(f"[WorkflowEngine] Failed to start workflow: {e}")
            raise
        finally:
            session.close()

    async def _engine_loop(self):
        """Main background loop polling for pending steps of running workflows."""
        while self._running:
            try:
                self._process_next_steps()
            except Exception as e:
                logger.error(f"[WorkflowEngine] Engine loop error: {e}")
            await asyncio.sleep(self._poll_interval)

    def _process_next_steps(self):
        session = SessionLocal()
        try:
            # Find running workflows
            workflows = session.execute(text("""
                SELECT workflow_id, name FROM workflows WHERE status = 'running'
            """)).fetchall()
            
            for wf in workflows:
                wf_id = wf[0]
                # Find the next pending step
                step = session.execute(text("""
                    SELECT step_id, step_order, machine_id, action, parameters
                    FROM workflow_steps
                    WHERE workflow_id = :wf_id AND status = 'pending'
                    ORDER BY step_order ASC
                    LIMIT 1
                """), {"wf_id": wf_id}).fetchone()
                
                if not step:
                    # No pending steps, are there any running?
                    running_steps = session.execute(text("""
                        SELECT 1 FROM workflow_steps WHERE workflow_id = :wf_id AND status = 'running'
                    """), {"wf_id": wf_id}).fetchone()
                    
                    if not running_steps:
                        # Workflow completed
                        session.execute(text("""
                            UPDATE workflows SET status = 'completed', completed_at = :now WHERE workflow_id = :wf_id
                        """), {"now": ist_now(), "wf_id": wf_id})
                        session.commit()
                        logger.info(f"[WorkflowEngine] Workflow {wf_id} completed.")
                    continue
                
                # Check if we should execute this step
                step_id, step_order, machine_id, action, parameters = step
                self._execute_step(session, wf_id, step_id, machine_id, action, parameters)
                
        except Exception as e:
            logger.error(f"[WorkflowEngine] Error processing next steps: {e}")
        finally:
            session.close()

    def _execute_step(self, session, workflow_id: uuid.UUID, step_id: uuid.UUID, machine_id: str, action: str, parameters: Dict[str, Any]):
        """
        Executes a single step in the workflow.
        Integrates with AlarmManager for error handling.
        """
        logger.info(f"[WorkflowEngine] Executing step {step_id}: {action} on {machine_id}")
        
        # Mark step as running
        session.execute(text("""
            UPDATE workflow_steps SET status = 'running', started_at = :now WHERE step_id = :step_id
        """), {"now": ist_now(), "step_id": step_id})
        session.commit()
        
        try:
            # TODO: Dispatch the command to the actual machine controller
            # For this foundational release, we simulate the action execution.
            if action == "fail_test":
                raise RuntimeError("Simulated machine failure for testing")
                
            # Simulate success
            session.execute(text("""
                UPDATE workflow_steps SET status = 'completed', completed_at = :now WHERE step_id = :step_id
            """), {"now": ist_now(), "step_id": step_id})
            session.commit()
            
        except Exception as e:
            logger.error(f"[WorkflowEngine] Step {step_id} failed: {e}")
            session.rollback()
            
            # Mark step and workflow as failed
            session.execute(text("""
                UPDATE workflow_steps SET status = 'failed', error_msg = :error WHERE step_id = :step_id
            """), {"error": str(e), "step_id": step_id})
            
            session.execute(text("""
                UPDATE workflows SET status = 'failed', error_msg = :error WHERE workflow_id = :wf_id
            """), {"error": str(e), "wf_id": workflow_id})
            session.commit()
            
            # Raise an alarm via the Centralized AlarmManager
            alarm_manager.raise_alarm(
                machine_id=machine_id,
                title=f"Workflow Step Failed: {action}",
                severity="critical",
                payload={"error": str(e), "workflow_id": str(workflow_id), "step_id": str(step_id)}
            )

# Expose global instance
workflow_engine = WorkflowEngine()
