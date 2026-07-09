import os

from json_utils import dump_json_strict, sanitize_json_value
from runtime_state import get_runtime_path, require_user_id


DEBUG_RUNTIME_ENV = "DEBUG_WRITE_RUNTIME_JSON"


def runtime_debug_enabled():
    return str(os.getenv(DEBUG_RUNTIME_ENV, "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def write_runtime(user_id, artifact_type, payload):
    """Optionally mirror execution artifacts to runtime JSON.

    Runtime writes are diagnostics only. They are disabled unless
    DEBUG_WRITE_RUNTIME_JSON=true.
    """
    require_user_id(user_id)

    if not runtime_debug_enabled():
        return None

    path = get_runtime_path(user_id, artifact_type)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with open(temp_path, "w", encoding="utf-8") as file:
        dump_json_strict(sanitize_json_value(payload), file, indent=2)
    temp_path.replace(path)
    return path
