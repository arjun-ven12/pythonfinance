REGIME_LABELS = {
    "BULL_LOW_VOL",
    "BULL_HIGH_VOL",
    "SIDEWAYS",
    "BEAR_LOW_VOL",
    "BEAR_HIGH_VOL",
    "RISK_OFF",
}


def _safe_float(value, default=None):
    try:
        if value is None or value != value:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_regime_label(value, fallback="SIDEWAYS"):
    label = str(value or fallback).upper().strip()
    return label if label in REGIME_LABELS else fallback


def classify_instrument_type(symbol, metadata=None):
    metadata = metadata or {}
    normalized_symbol = str(symbol or "").upper()
    name = " ".join(
        str(metadata.get(key) or "")
        for key in ("company_name", "shortName", "longName", "display_symbol")
    ).upper()

    if any(keyword in name for keyword in ("ULTRAPRO", "3X", "2X", "LEVERAGED", "BULL 3X", "BEAR 3X")):
        if any(keyword in name for keyword in ("BEAR", "INVERSE", "SHORT")):
            return "INVERSE_ETF"
        return "LEVERAGED_ETF"

    if any(keyword in name for keyword in ("INVERSE", "SHORT ETF", "BEAR ETF")):
        return "INVERSE_ETF"

    if normalized_symbol.endswith(".SI") or any(keyword in name for keyword in ("ETF", "TRUST", "FUND")):
        return "ETF"

    return "SINGLE_STOCK"


def compute_fit_score(candidate=None, envelope=None):
    candidate = candidate or {}
    envelope = envelope or {}
    reasons = []
    dimension_scores = {}
    total_weight = 0
    weighted_score = 0

    def score_dimension(name, passed, weight, detail):
        nonlocal total_weight, weighted_score
        total_weight += weight
        value = 1.0 if passed else 0.0
        dimension_scores[name] = {
            "pass": bool(passed),
            "score": value,
            "detail": detail,
            "weight": weight,
        }
        weighted_score += value * weight
        if not passed:
            reasons.append(detail)

    sector = str(candidate.get("sector") or "UNKNOWN")
    allowed_sectors = [str(item).strip() for item in envelope.get("sectors") or [] if str(item).strip()]
    score_dimension(
        "sector",
        not allowed_sectors or sector in allowed_sectors,
        0.2,
        f"Sector {sector} is outside the strategy envelope.",
    )

    regime = normalize_regime_label(candidate.get("regime") or candidate.get("marketRegime"))
    allowed_regimes = [
        normalize_regime_label(item, item)
        for item in envelope.get("regimes") or []
        if str(item).strip()
    ]
    score_dimension(
        "regime",
        not allowed_regimes or regime in allowed_regimes,
        0.25,
        f"Regime {regime} is outside the validated regime envelope.",
    )

    instrument_type = classify_instrument_type(candidate.get("symbol"), candidate.get("metadata"))
    allowed_instrument_types = [
        str(item).strip().upper()
        for item in envelope.get("instrumentTypes") or []
        if str(item).strip()
    ]
    score_dimension(
        "instrumentType",
        not allowed_instrument_types or instrument_type in allowed_instrument_types,
        0.15,
        f"Instrument type {instrument_type} is outside the allowed instrument set.",
    )

    volatility = _safe_float(candidate.get("volatility"), 0) or 0
    vol_band = envelope.get("volBand") or {}
    vol_min = _safe_float(vol_band.get("min"), 0) or 0
    vol_max = _safe_float(vol_band.get("max"), 1) or 1
    score_dimension(
        "volatility",
        vol_min <= volatility <= vol_max,
        0.2,
        f"Volatility {round(volatility, 4)} is outside the envelope band {round(vol_min, 4)}-{round(vol_max, 4)}.",
    )

    liquidity_floor = _safe_float(envelope.get("liquidityFloor"), 0) or 0
    average_volume = _safe_float(candidate.get("averageVolume"), 0) or 0
    score_dimension(
        "liquidity",
        average_volume >= liquidity_floor,
        0.2,
        f"Average volume {int(average_volume)} is below the liquidity floor {int(liquidity_floor)}.",
    )

    fit_score = round((weighted_score / max(total_weight, 1)) * 100, 2)
    return {
      "fitScore": fit_score,
      "passed": fit_score >= 60,
      "reasons": reasons,
      "dimensions": dimension_scores,
      "instrumentType": instrument_type,
      "sectorContext": sector,
      "regimeAtSignal": regime,
    }


def resolve_regime_overlay(parameters=None, overlays=None, regime_label=None):
    parameters = dict(parameters or {})
    overlays = overlays or {}
    normalized_regime = normalize_regime_label(regime_label)
    override = overlays.get(normalized_regime) or {}
    if not isinstance(override, dict):
        override = {}

    resolved = {**parameters}
    for key, value in override.items():
        numeric = _safe_float(value, None)
        resolved[key] = numeric if numeric is not None else value

    return {
        "parameters": resolved,
        "regime": normalized_regime,
        "overlay": override,
        "applied": bool(override),
    }


def evaluate_instrument_constraints(
    instrument_type,
    envelope=None,
    strategy_context=None,
):
    envelope = envelope or {}
    strategy_context = strategy_context or {}
    warnings = []
    blocked = False
    holding_period_days = int(_safe_float(envelope.get("holdingPeriodDays"), 0) or 0)
    overnight = bool(strategy_context.get("allowOvernight", holding_period_days > 1))

    if instrument_type in {"LEVERAGED_ETF", "INVERSE_ETF"}:
        warnings.append("Leveraged/inverse instruments require shorter holding assumptions.")
        if overnight:
            blocked = True
            warnings.append("Overnight holding is blocked for leveraged/inverse instruments.")

    return {
        "blocked": blocked,
        "warnings": warnings,
        "holdingPeriodDays": holding_period_days,
    }
