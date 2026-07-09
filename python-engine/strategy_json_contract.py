import json
from pathlib import Path


CONTRACT_PATH = Path(__file__).resolve().parents[1] / "shared" / "strategyJson.contract.json"


def load_strategy_json_contract():
    with CONTRACT_PATH.open("r", encoding="utf-8") as contract_file:
        return json.load(contract_file)


STRATEGY_JSON_CONTRACT = load_strategy_json_contract()


class StrategyJsonValidationError(ValueError):
    pass


RULE_OBJECT_KEYS = {"operator", "children", "indicator", "comparator", "value", "raw"}
INDICATOR_VALUE_KEYS = {"kind", "indicator"}
TOP_LEVEL_KEYS = {"schemaVersion", "metadata", "executable", "research", "evidence"}
EXECUTABLE_KEYS = set(STRATEGY_JSON_CONTRACT["requiredExecutableFields"]) | {"allocationMatrix"}


def _validate_rule_node(node, path, contract):
    if not isinstance(node, dict):
        raise StrategyJsonValidationError(f"{path} must be an object.")

    for key in node.keys():
        if key not in RULE_OBJECT_KEYS:
            raise StrategyJsonValidationError(f"{path}.{key} is unsupported.")

    operator = str(node.get("operator", "")).upper()
    if operator in set(contract["allowed"]["logicalOperators"]):
        children = node.get("children") or []
        if not isinstance(children, list) or len(children) == 0:
            raise StrategyJsonValidationError(f"{path}.{operator} must include child rules.")
        for index, child in enumerate(children):
            _validate_rule_node(child, f"{path}.children[{index}]", contract)
        return

    indicator = str(node.get("indicator", "")).upper()
    comparator = str(node.get("comparator", "")).upper()
    if indicator not in set(contract["allowed"]["indicators"]):
        raise StrategyJsonValidationError(
            f"{path}.indicator is unsupported: {indicator or 'missing'}."
        )
    if comparator not in set(contract["allowed"]["comparators"]):
        raise StrategyJsonValidationError(
            f"{path}.comparator is unsupported: {comparator or 'missing'}."
        )

    value = node.get("value")
    if isinstance(value, dict) and ("kind" in value or "indicator" in value):
        for key in value.keys():
            if key not in INDICATOR_VALUE_KEYS:
                raise StrategyJsonValidationError(f"{path}.value.{key} is unsupported.")
        if value.get("kind") != "indicator":
            raise StrategyJsonValidationError(
                f"{path}.value.kind is unsupported: {value.get('kind')}."
            )
        rhs_indicator = str(value.get("indicator", "")).upper()
        if rhs_indicator not in set(contract["allowed"]["indicators"]):
            raise StrategyJsonValidationError(
                f"{path}.value.indicator is unsupported: {rhs_indicator or 'missing'}."
            )


def validate_strategy_json(strategy_json):
    if not isinstance(strategy_json, dict):
        raise StrategyJsonValidationError("strategyJson must be an object.")

    for key in strategy_json.keys():
        if key not in TOP_LEVEL_KEYS:
            raise StrategyJsonValidationError(f"strategyJson.{key} is unsupported.")

    schema_version = strategy_json.get("schemaVersion")
    expected_version = STRATEGY_JSON_CONTRACT["schemaVersion"]
    if schema_version and schema_version != expected_version:
        raise StrategyJsonValidationError(
            f"Unsupported strategyJson schemaVersion: {schema_version}."
        )

    executable = strategy_json.get("executable")
    if not isinstance(executable, dict):
        raise StrategyJsonValidationError("strategyJson.executable is required.")

    for key in executable.keys():
        if key not in EXECUTABLE_KEYS:
            raise StrategyJsonValidationError(f"strategyJson.executable.{key} is unsupported.")

    for field in STRATEGY_JSON_CONTRACT["requiredExecutableFields"]:
        if field not in executable:
            raise StrategyJsonValidationError(
                f"strategyJson.executable.{field} is required by {expected_version}."
            )

    entry_rules = executable.get("entryRules")
    if not isinstance(entry_rules, list) or len(entry_rules) == 0:
        raise StrategyJsonValidationError("Strategy DSL requires at least one entry rule.")

    all_rules = []
    for key in ("entryRules", "exitRules", "riskRules"):
        rules = executable.get(key)
        if not isinstance(rules, list):
            raise StrategyJsonValidationError(f"strategyJson.executable.{key} must be a list.")
        all_rules.extend(rules)

    for index, rule in enumerate(all_rules):
        _validate_rule_node(rule, f"executable.rules[{index}]", STRATEGY_JSON_CONTRACT)

    return {
        "isValid": True,
        "schemaVersion": expected_version,
        "warnings": [
            f"{note.get('field')}: {note.get('label')}"
            for note in strategy_json.get("metadata", {}).get("designNotes", [])
        ],
    }
