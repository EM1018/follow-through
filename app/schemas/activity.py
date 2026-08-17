from pydantic import BaseModel, ConfigDict

from app.services.activities import Activity, Dimension, Unit


class ActivityInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activity: Activity
    display_name: str
    units: list[Unit]
    default_unit: Unit


class UnitInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit: Unit
    dimension: Dimension


class ActivitiesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activities: list[ActivityInfo]
    units: list[UnitInfo]
