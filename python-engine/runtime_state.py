import json
import os
import re
from pathlib import Path


PYTHON_ENGINE_DIR = Path(__file__).resolve().parent
RUNTIME_ROOT = Path(
    os.getenv("PYTHON_ENGINE_RUNTIME_ROOT", PYTHON_ENGINE_DIR / "runtime")
)
USERS_ROOT = RUNTIME_ROOT / "users"
SAFE_USER_ID = re.compile(r"^[A-Za-z0-9._-]+$")

RUNTIME_FILENAMES = {
    "portfolio": "portfolio_state.json",
    "paper_trades": "paper_trades.json",
    "scan_results": "scan_results.json",
    "settings": "settings.json",
    "safety": "safety.json",
    "strategy": "strategy.json",
    "alerts": "alerts.json",
    "proposed_orders": "proposed_orders.json",
    "engine_status": "engine_status.json",
    "scheduler_log": "scheduler_runs.log",
}


def require_user_id(user_id):
    value = str(user_id or "").strip()

    if not value:
        raise ValueError("userId is required for Python runtime state.")

    if not SAFE_USER_ID.fullmatch(value):
        raise ValueError("userId contains unsupported characters.")

    return value


def get_user_runtime_dir(user_id, create=True):
    directory = USERS_ROOT / require_user_id(user_id)

    if create:
        directory.mkdir(parents=True, exist_ok=True)

    return directory


def get_runtime_path(user_id, state_name, create_parent=True):
    try:
        filename = RUNTIME_FILENAMES[state_name]
    except KeyError as error:
        raise ValueError(f"Unknown runtime state name: {state_name}") from error

    return get_user_runtime_dir(user_id, create=create_parent) / filename


def read_runtime_json(user_id, state_name, fallback=None):
    path = get_runtime_path(user_id, state_name, create_parent=False)

    if not path.exists():
        return fallback

    with open(path) as file:
        return json.load(file)


def write_runtime_json(user_id, state_name, data):
    path = get_runtime_path(user_id, state_name)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")

    with open(temp_path, "w") as file:
        json.dump(data, file, indent=2)

    temp_path.replace(path)
    return path
