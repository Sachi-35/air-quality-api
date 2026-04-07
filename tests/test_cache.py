"""Unit tests for the in-memory cache."""
import time
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import services.cache as cache


def setup_function():
    cache.clear()


def test_set_and_get():
    cache.set("key1", {"data": 42})
    result = cache.get("key1")
    assert result == {"data": 42}


def test_miss_returns_none():
    assert cache.get("nonexistent") is None


def test_ttl_expiry():
    cache.set("short", "value", ttl=1)
    assert cache.get("short") == "value"
    time.sleep(1.1)
    assert cache.get("short") is None


def test_invalidate():
    cache.set("to_delete", "bye")
    cache.invalidate("to_delete")
    assert cache.get("to_delete") is None


def test_invalidate_missing_key_no_error():
    cache.invalidate("does_not_exist")  # Should not raise


def test_clear():
    cache.set("a", 1)
    cache.set("b", 2)
    cache.clear()
    assert cache.get("a") is None
    assert cache.get("b") is None


def test_overwrite():
    cache.set("key", "first")
    cache.set("key", "second")
    assert cache.get("key") == "second"


def test_different_types_stored():
    cache.set("list_key", [1, 2, 3])
    cache.set("dict_key", {"nested": True})
    cache.set("int_key", 99)
    assert cache.get("list_key") == [1, 2, 3]
    assert cache.get("dict_key") == {"nested": True}
    assert cache.get("int_key") == 99