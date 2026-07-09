import json
import math
from datetime import date, datetime
from numbers import Integral, Real


def sanitize_json_value(value):
    if value is None or isinstance(value, (str, bool)):
        return value

    if isinstance(value, Integral):
        return int(value)

    if isinstance(value, Real):
        number = float(value)
        return number if math.isfinite(number) else None

    if isinstance(value, dict):
        return {
            str(key): sanitize_json_value(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple, set)):
        return [sanitize_json_value(item) for item in value]

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    item_method = getattr(value, "item", None)

    if callable(item_method):
        try:
            return sanitize_json_value(item_method())
        except (TypeError, ValueError):
            pass

    return str(value)


def dump_json_strict(data, file, indent=None):
    sanitized = sanitize_json_value(data)
    json.dump(sanitized, file, indent=indent, allow_nan=False)
    return sanitized


def dumps_json_strict(data, **kwargs):
    return json.dumps(
        sanitize_json_value(data),
        allow_nan=False,
        **kwargs,
    )
