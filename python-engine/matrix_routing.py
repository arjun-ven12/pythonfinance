from strategy_conditioning import normalize_regime_label


def normalize_matrix_key(sector, regime):
    return f"{str(sector or 'UNKNOWN').strip()}::{str(regime or 'UNKNOWN').strip()}"


def _normalize_allocation_matrix(source):
    if not source:
        return {}

    if isinstance(source, list):
        normalized = {}
        for cell in source:
            if not isinstance(cell, dict):
                continue
            key = cell.get("key") or normalize_matrix_key(cell.get("sector"), cell.get("regime"))
            normalized[key] = cell
        return normalized

    if isinstance(source, dict):
        if "cells" in source and isinstance(source["cells"], list):
            return _normalize_allocation_matrix(source["cells"])
        if "allocationMatrix" in source and isinstance(source["allocationMatrix"], (dict, list)):
            return _normalize_allocation_matrix(source["allocationMatrix"])
        if "executable" in source and isinstance(source["executable"], dict):
            return _normalize_allocation_matrix(source["executable"].get("allocationMatrix"))
        return source

    return {}


def resolve_allocation_matrix_cell(allocation_matrix, sector, regime_label):
    matrix = _normalize_allocation_matrix(allocation_matrix)
    if not isinstance(matrix, dict):
        return None

    normalized_sector = str(sector or "UNKNOWN").strip()
    normalized_regime = normalize_regime_label(regime_label)
    for key in (
        f"{normalized_sector}::{normalized_regime}",
        f"*::{normalized_regime}",
        f"{normalized_sector}::*",
        "*::*",
    ):
        cell = matrix.get(key)
        if cell:
            if isinstance(cell, dict):
                return {"key": key, **cell}
            return {"key": key, "value": cell}
    return None


def resolve_routed_strategy_config(strategy_config, sector, regime_label):
    if not strategy_config:
        return strategy_config, None

    strategy_json = (
        strategy_config.get("strategyJson")
        or strategy_config.get("strategy_json")
        or strategy_config.get("executable")
        or strategy_config
    )
    routing_cell = resolve_allocation_matrix_cell(strategy_json, sector, regime_label)
    if not routing_cell:
        return strategy_config, None

    strategy_map = (
        strategy_config.get("allocation_matrix_strategy_configs")
        or strategy_config.get("allocationMatrixStrategyConfigs")
        or {}
    )
    routed_config = strategy_map.get(routing_cell.get("key"))
    if routed_config:
        return routed_config, routing_cell

    return strategy_config, routing_cell
