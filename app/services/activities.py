from dataclasses import dataclass
from enum import StrEnum


class Activity(StrEnum):
    RUNNING = "running"
    WALKING = "walking"
    CYCLING = "cycling"
    SWIMMING = "swimming"
    STRENGTH_TRAINING = "strength_training"
    CARDIO = "cardio"
    STRETCHING_MOBILITY = "stretching_mobility"
    OTHER = "other"


class Unit(StrEnum):
    MINUTES = "minutes"
    HOURS = "hours"
    MILES = "miles"
    KILOMETERS = "kilometers"
    SESSIONS = "sessions"
    SETS = "sets"
    REPS = "reps"


class Dimension(StrEnum):
    TIME = "time"
    DISTANCE = "distance"
    COUNT = "count"


UNIT_DIMENSION: dict[Unit, Dimension] = {
    Unit.MINUTES: Dimension.TIME,
    Unit.HOURS: Dimension.TIME,
    Unit.MILES: Dimension.DISTANCE,
    Unit.KILOMETERS: Dimension.DISTANCE,
    Unit.SESSIONS: Dimension.COUNT,
    Unit.SETS: Dimension.COUNT,
    Unit.REPS: Dimension.COUNT,
}


@dataclass(frozen=True)
class ActivityUnits:
    permitted: frozenset[Unit]
    default: Unit


ACTIVITY_UNITS: dict[Activity, ActivityUnits] = {
    Activity.RUNNING: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.MILES, Unit.KILOMETERS}),
        default=Unit.MILES,
    ),
    Activity.WALKING: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.MILES, Unit.KILOMETERS}),
        default=Unit.MILES,
    ),
    Activity.CYCLING: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.MILES, Unit.KILOMETERS}),
        default=Unit.MILES,
    ),
    Activity.SWIMMING: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.MILES, Unit.KILOMETERS}),
        default=Unit.MINUTES,
    ),
    Activity.STRENGTH_TRAINING: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.SESSIONS, Unit.SETS, Unit.REPS}),
        default=Unit.SESSIONS,
    ),
    Activity.CARDIO: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.SESSIONS}),
        default=Unit.MINUTES,
    ),
    Activity.STRETCHING_MOBILITY: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS}),
        default=Unit.MINUTES,
    ),
    Activity.OTHER: ActivityUnits(
        permitted=frozenset({Unit.MINUTES, Unit.HOURS, Unit.SESSIONS}),
        default=Unit.SESSIONS,
    ),
}


DISPLAY_NAMES: dict[Activity, str] = {
    Activity.RUNNING: "Running",
    Activity.WALKING: "Walking",
    Activity.CYCLING: "Cycling",
    Activity.SWIMMING: "Swimming",
    Activity.STRENGTH_TRAINING: "Strength training",
    Activity.CARDIO: "Cardio",
    Activity.STRETCHING_MOBILITY: "Stretching/mobility",
    Activity.OTHER: "Other",
}
