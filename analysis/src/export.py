class ModeConflictError(Exception):
    pass

def export_period_results(rows):
    raise NotImplementedError("export_period_results: not implemented (T31)")

def reconcile_billed_calls(model_calls, ledger_entries):
    raise NotImplementedError("reconcile_billed_calls: not implemented (T31)")

def export_branch_lineage(branch):
    raise NotImplementedError("export_branch_lineage: not implemented (T31)")

def canonical_export(rows):
    raise NotImplementedError("canonical_export: not implemented (T31)")

def validate_mode_consistency(report):
    raise NotImplementedError("validate_mode_consistency: not implemented (T31)")
