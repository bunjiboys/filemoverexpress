package workflow

// ReconcileRun applies the restart-reconciliation rules to one loaded run (format doc
// "Restart reconciliation"). A run persisted as PENDING, RUNNING, or PAUSED was
// interrupted by the shutdown and its in-flight jobs did not survive (jobs are in-memory
// today), so it is marked FAILED and its non-terminal steps are fixed up: the step that
// was RUNNING becomes FAILED, every other non-terminal step becomes SKIPPED. A run already
// in a terminal state (SUCCEEDED/FAILED/CANCELLED) is left untouched. It returns whether
// the run was changed, so the caller rewrites the store record exactly once.
//
// This "interrupted => terminal, never auto-resume" rule is intentionally conservative: a
// workflow can perform large or destructive transfers, so silently resuming half a run
// across a restart (with no surviving job state) would be unsafe.
func ReconcileRun(run *WorkflowRun) bool {
	reconciled, changed := reconcileRunStatus(run.Status)
	if !changed {
		return false
	}
	run.Status = reconciled
	for i := range run.Steps {
		run.Steps[i].Status = reconcileStepStatus(run.Steps[i].Status)
	}
	return true
}

// ReconcileAll reconciles every loaded run and returns the subset that changed (so the
// caller persists only those). The engine calls this on startup over RunStore.List().
func ReconcileAll(runs []*WorkflowRun) []*WorkflowRun {
	var changed []*WorkflowRun
	for _, run := range runs {
		if ReconcileRun(run) {
			changed = append(changed, run)
		}
	}
	return changed
}

// reconcileRunStatus maps a persisted run status to its reconciled status, reporting
// whether it changed. Non-terminal (PENDING/RUNNING/PAUSED) all reconcile to FAILED;
// terminal states are returned unchanged.
func reconcileRunStatus(status RunStatus) (RunStatus, bool) {
	if status.Terminal() {
		return status, false
	}
	return RunFailed, true
}

// reconcileStepStatus fixes up a step's status within an interrupted run: a step that was
// RUNNING is marked FAILED (it was mid-execution when the daemon stopped), any other
// non-terminal step is marked SKIPPED, and an already-terminal step is left unchanged.
func reconcileStepStatus(status StepStatus) StepStatus {
	if status.Terminal() {
		return status
	}
	if status == StepRunning {
		return StepFailed
	}
	return StepSkipped
}
