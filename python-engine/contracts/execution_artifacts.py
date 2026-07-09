from json_utils import sanitize_json_value


def build_execution_artifacts(
    scan_results=None,
    alerts=None,
    proposed_orders=None,
    metadata=None,
    diagnostics=None,
):
    """Build the scanner stdout contract.

    Camel-case keys are the forward contract. Snake-case keys are emitted during
    the transition so existing Node persistence keeps working.
    """
    payload = {
        "scanResults": scan_results or {},
        "alerts": alerts or [],
        "proposedOrders": proposed_orders or {"orders": []},
        "metadata": metadata or {},
        "diagnostics": diagnostics or {},
        "scan_results": scan_results or {},
        "proposed_orders": proposed_orders or {"orders": []},
    }
    return sanitize_json_value(payload)
