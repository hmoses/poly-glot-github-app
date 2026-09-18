import hashlib
import time
import re
from typing import Optional, Dict, Any

MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

def slugify(text):
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text

def hash_content(content, algorithm='sha256'):
    h = hashlib.new(algorithm)
    if isinstance(content, str):
        content = content.encode('utf-8')
    h.update(content)
    return h.hexdigest()

def retry(func, max_attempts=MAX_RETRIES, delay=1.0, backoff=2.0):
    attempt = 0
    last_error = None
    while attempt < max_attempts:
        try:
            return func()
        except Exception as e:
            last_error = e
            time.sleep(delay * (backoff ** attempt))
            attempt += 1
    raise last_error

def deep_merge(base, override):
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result

def truncate(text, max_length=100, suffix='...'):
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix
