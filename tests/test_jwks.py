import uuid

import pytest
import respx
from httpx import Response

import tests.conftest as conftest
from app.config import get_settings
from app.deps import _HttpxPyJWKClient
from tests.conftest import make_token


def _use_real_fetch_data(monkeypatch: pytest.MonkeyPatch) -> None:
    """conftest.py fakes _HttpxPyJWKClient.fetch_data for the whole session so other
    tests never hit the network. These tests want the real method body instead - only
    the actual HTTP call (intercepted by respx) should be fake - so restore it here;
    monkeypatch reverts to the session-wide fake automatically after the test.
    """
    monkeypatch.setattr(_HttpxPyJWKClient, "fetch_data", conftest.real_jwks_fetch_data)


@respx.mock
def test_fetch_data_populates_jwk_set_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    _use_real_fetch_data(monkeypatch)
    route = respx.get(get_settings().SUPABASE_JWKS_URL).mock(
        return_value=Response(200, json=conftest._fake_jwks())
    )
    client = _HttpxPyJWKClient(get_settings().SUPABASE_JWKS_URL, lifespan=600)

    data = client.fetch_data()

    assert route.called
    assert data == conftest._fake_jwks()
    assert client.jwk_set_cache is not None
    assert client.jwk_set_cache.get() is not None


@respx.mock
def test_get_signing_key_from_jwt_reuses_warm_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """A second lookup within the cache's lifespan should be served from
    jwk_set_cache rather than hitting the JWKS endpoint again.
    """
    _use_real_fetch_data(monkeypatch)
    route = respx.get(get_settings().SUPABASE_JWKS_URL).mock(
        return_value=Response(200, json=conftest._fake_jwks())
    )
    client = _HttpxPyJWKClient(get_settings().SUPABASE_JWKS_URL, lifespan=600)
    token = make_token(uuid.uuid4(), "cache-check@example.com")

    client.get_signing_key_from_jwt(token)
    client.get_signing_key_from_jwt(token)

    assert route.call_count == 1
