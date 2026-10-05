import pytest
from httpx import AsyncClient

from app.deps import CurrentUser, get_current_user
from app.main import app


@pytest.mark.asyncio
async def test_set_timezone_is_200_and_persisted(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"timezone": "America/Los_Angeles"})
    assert response.status_code == 200, response.text
    assert response.json()["timezone"] == "America/Los_Angeles"

    again = await client.get("/me")
    assert again.json()["timezone"] == "America/Los_Angeles"


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_timezone", ["Mars/Olympus", "PST"])
async def test_invalid_timezone_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], bad_timezone: str
) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"timezone": bad_timezone})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_set_username_is_200_and_stored_lowercase(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"username": "sam"})
    assert response.status_code == 200, response.text
    assert response.json()["username"] == "sam"


@pytest.mark.asyncio
async def test_mixed_case_username_is_stored_as_typed(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"username": "Jordan_R"})
    assert response.status_code == 200, response.text
    assert response.json()["username"] == "Jordan_R"


@pytest.mark.asyncio
async def test_claiming_taken_username_is_409(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    app.dependency_overrides[get_current_user] = lambda: second_user
    taken = await client.patch("/me", json={"username": "sam"})
    assert taken.status_code == 200, taken.text

    app.dependency_overrides[get_current_user] = lambda: me
    response = await client.patch("/me", json={"username": "sam"})
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_claiming_taken_username_different_case_is_409(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    app.dependency_overrides[get_current_user] = lambda: second_user
    taken = await client.patch("/me", json={"username": "sam"})
    assert taken.status_code == 200, taken.text

    app.dependency_overrides[get_current_user] = lambda: me
    response = await client.patch("/me", json={"username": "SAM"})
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_username_capitalization_is_stored_and_returned_unchanged(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"username": "TestUser"})
    assert response.status_code == 200, response.text
    assert response.json()["username"] == "TestUser"

    again = await client.get("/me")
    assert again.json()["username"] == "TestUser"


@pytest.mark.asyncio
@pytest.mark.parametrize("other_casing", ["testuser", "TESTUSER"])
async def test_claiming_taken_mixed_case_username_in_another_casing_is_409(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser, other_casing: str
) -> None:
    client, me = authed_client
    app.dependency_overrides[get_current_user] = lambda: second_user
    taken = await client.patch("/me", json={"username": "TestUser"})
    assert taken.status_code == 200, taken.text

    app.dependency_overrides[get_current_user] = lambda: me
    response = await client.patch("/me", json={"username": other_casing})
    assert response.status_code == 409
    assert response.json() == {"detail": "Username is already taken"}


@pytest.mark.asyncio
async def test_changing_only_the_capitalization_of_own_username_is_200(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    first = await client.patch("/me", json={"username": "sam"})
    assert first.status_code == 200, first.text

    # Same lower(username) key on the same row - an UPDATE never conflicts
    # with the row it is updating, so this is a display change, not a 409.
    second = await client.patch("/me", json={"username": "Sam"})
    assert second.status_code == 200, second.text
    assert second.json()["username"] == "Sam"


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_username", ["ab", "jordan-r", "jordan r", "a" * 21])
async def test_bad_username_format_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], bad_username: str
) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"username": bad_username})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_empty_body_is_422(authed_client: tuple[AsyncClient, CurrentUser]) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_unknown_field_is_422(authed_client: tuple[AsyncClient, CurrentUser]) -> None:
    client, _me = authed_client
    response = await client.patch("/me", json={"username": "sam", "email": "new@example.com"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_changing_an_existing_username_is_200(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    first = await client.patch("/me", json={"username": "sam"})
    assert first.status_code == 200, first.text

    second = await client.patch("/me", json={"username": "samuel"})
    assert second.status_code == 200, second.text
    assert second.json()["username"] == "samuel"


@pytest.mark.asyncio
async def test_get_me_returns_username_and_timezone(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    await client.patch("/me", json={"username": "sam", "timezone": "America/Los_Angeles"})

    response = await client.get("/me")
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "sam"
    assert body["timezone"] == "America/Los_Angeles"
