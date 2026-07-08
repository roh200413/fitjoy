import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = BACKEND_DIR / ".env"


def parse_env_file(path=ENV_PATH):
    values = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value

    return values


ENV_VALUES = parse_env_file()


def get_env(key, default=None):
    return os.getenv(key, ENV_VALUES.get(key, default))


def get_int_env(key, default):
    try:
        return int(get_env(key, default))
    except (TypeError, ValueError):
        return default


def get_bool_env(key, default=False):
    value = str(get_env(key, str(default))).strip().lower()
    return value in {"1", "true", "yes", "on"}


def get_list_env(key, default=None):
    value = get_env(key)
    if value is None:
        return default or []
    if value.strip() == "*":
        return ["*"]
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    backend_host = get_env("BACKEND_HOST", "0.0.0.0")
    backend_port = get_int_env("BACKEND_PORT", 8011)
    backend_reload = get_bool_env("BACKEND_RELOAD", True)
    cors_origins = get_list_env("CORS_ORIGINS", ["*"])


settings = Settings()
