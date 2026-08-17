from fastapi import APIRouter, Depends

from app.deps import CurrentUser, get_current_user
from app.schemas.activity import ActivitiesResponse, ActivityInfo, UnitInfo
from app.services.activities import ACTIVITY_UNITS, DISPLAY_NAMES, UNIT_DIMENSION, Activity, Unit

router = APIRouter(tags=["activities"])


@router.get("/activities", response_model=ActivitiesResponse)
async def list_activities(
    current_user: CurrentUser = Depends(get_current_user),
) -> ActivitiesResponse:
    """Static vocabulary, read straight off app/services/activities.py - no
    database access, so nothing here can drift from what POST /completions
    and the CHECK constraints actually enforce.
    """
    return ActivitiesResponse(
        activities=[
            ActivityInfo(
                activity=activity,
                display_name=DISPLAY_NAMES[activity],
                units=sorted(ACTIVITY_UNITS[activity].permitted),
                default_unit=ACTIVITY_UNITS[activity].default,
            )
            for activity in Activity
        ],
        units=[UnitInfo(unit=unit, dimension=UNIT_DIMENSION[unit]) for unit in Unit],
    )
