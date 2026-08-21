import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.models.commitment import Commitment
from app.models.completion import Completion
from app.services.commitments import BlockStatus, completion_satisfies, compute_progress

# A known Friday, used only by the block-boundary test that needs a real
# non-Monday start; every other test picks an arbitrary anchor date since the
# block math doesn't care which weekday it falls on.
A_FRIDAY = date(2020, 1, 3)


def _commitment(
    *,
    activity: str = "running",
    sessions_per_week: int = 1,
    starts_on: date,
    target_value: str | None = None,
    target_unit: str | None = None,
    duration_weeks: int | None = None,
    ended_on: date | None = None,
) -> Commitment:
    return Commitment(
        creator_id=uuid.uuid4(),
        activity=activity,
        target_value=Decimal(target_value) if target_value is not None else None,
        target_unit=target_unit,
        sessions_per_week=sessions_per_week,
        duration_weeks=duration_weeks,
        starts_on=starts_on,
        ended_on=ended_on,
    )


def _completion(
    *,
    activity: str | None = "running",
    on_date: date,
    value: str | None = None,
    unit: str | None = None,
) -> Completion:
    return Completion(
        user_id=uuid.uuid4(),
        activity=activity,
        value=Decimal(value) if value is not None else None,
        unit=unit,
        on_date=on_date,
        source="standalone",
        label="Test",
    )


# Matching


def test_exact_unit_value_above_target_matches() -> None:
    commitment = _commitment(starts_on=date(2026, 1, 5), target_value="15", target_unit="minutes")
    completion = _completion(on_date=date(2026, 1, 5), value="20", unit="minutes")
    assert completion_satisfies(commitment, completion) is True


def test_exact_unit_value_below_target_does_not_match() -> None:
    commitment = _commitment(starts_on=date(2026, 1, 5), target_value="15", target_unit="minutes")
    completion = _completion(on_date=date(2026, 1, 5), value="10", unit="minutes")
    assert completion_satisfies(commitment, completion) is False


def test_cross_unit_with_conversion_factor_matches() -> None:
    commitment = _commitment(
        starts_on=date(2026, 1, 5), target_value="5", target_unit="kilometers"
    )
    completion = _completion(on_date=date(2026, 1, 5), value="3.2", unit="miles")
    assert completion_satisfies(commitment, completion) is True


def test_cross_dimension_does_not_match() -> None:
    commitment = _commitment(
        activity="walking",
        starts_on=date(2026, 1, 5),
        target_value="15",
        target_unit="minutes",
    )
    completion = _completion(activity="walking", on_date=date(2026, 1, 5), value="2", unit="miles")
    assert completion_satisfies(commitment, completion) is False


def test_sets_vs_reps_does_not_match() -> None:
    commitment = _commitment(
        activity="strength_training",
        starts_on=date(2026, 1, 5),
        target_value="3",
        target_unit="sets",
    )
    completion = _completion(
        activity="strength_training", on_date=date(2026, 1, 5), value="10", unit="reps"
    )
    assert completion_satisfies(commitment, completion) is False


def test_valueless_completion_vs_targeted_commitment_does_not_match() -> None:
    commitment = _commitment(starts_on=date(2026, 1, 5), target_value="15", target_unit="minutes")
    completion = _completion(on_date=date(2026, 1, 5))
    assert completion_satisfies(commitment, completion) is False


def test_valueless_completion_vs_no_target_commitment_matches() -> None:
    commitment = _commitment(starts_on=date(2026, 1, 5))
    completion = _completion(on_date=date(2026, 1, 5))
    assert completion_satisfies(commitment, completion) is True


def test_null_activity_completion_matches_nothing() -> None:
    commitment = _commitment(starts_on=date(2026, 1, 5))
    completion = _completion(activity=None, on_date=date(2026, 1, 5))
    assert completion_satisfies(commitment, completion) is False


def test_wrong_activity_does_not_match() -> None:
    commitment = _commitment(
        activity="running", starts_on=date(2026, 1, 5), target_value="1", target_unit="miles"
    )
    completion = _completion(activity="cycling", on_date=date(2026, 1, 5), value="50", unit="miles")
    assert completion_satisfies(commitment, completion) is False


# Blocks


def test_friday_start_gives_a_full_seven_day_first_block() -> None:
    commitment = _commitment(starts_on=A_FRIDAY)
    progress = compute_progress(commitment, [], today=A_FRIDAY)
    assert len(progress.blocks) == 1
    block = progress.blocks[0]
    assert block.starts_on == A_FRIDAY
    assert block.ends_on == A_FRIDAY + timedelta(days=6)


def test_completion_before_starts_on_is_excluded() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on)
    completion = _completion(on_date=starts_on - timedelta(days=1))
    progress = compute_progress(commitment, [completion], today=starts_on)
    assert progress.blocks[0].sessions_done == 0


def test_completion_on_last_day_of_block_counts_there_not_next() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=7)
    completion = _completion(on_date=starts_on + timedelta(days=6))
    progress = compute_progress(commitment, [completion], today=starts_on + timedelta(days=7))
    assert progress.blocks[0].sessions_done == 1
    assert progress.blocks[1].sessions_done == 0


def test_two_completions_same_day_count_as_one_session() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=5)
    completions = [
        _completion(on_date=starts_on, value="1", unit="miles"),
        _completion(on_date=starts_on, value="2", unit="miles"),
    ]
    progress = compute_progress(commitment, completions, today=starts_on)
    assert progress.blocks[0].sessions_done == 1


def test_two_completions_different_days_count_as_two_sessions() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=5)
    completions = [
        _completion(on_date=starts_on),
        _completion(on_date=starts_on + timedelta(days=1)),
    ]
    progress = compute_progress(commitment, completions, today=starts_on + timedelta(days=1))
    assert progress.blocks[0].sessions_done == 2


def test_block_containing_today_short_of_target_is_in_progress() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=5)
    completion = _completion(on_date=starts_on)
    progress = compute_progress(
        commitment, [completion], today=starts_on + timedelta(days=3)
    )
    assert progress.blocks[0].status == BlockStatus.IN_PROGRESS


def test_past_block_short_of_target_is_missed() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=5)
    completion = _completion(on_date=starts_on)
    progress = compute_progress(commitment, [completion], today=starts_on + timedelta(days=7))
    assert progress.blocks[0].status == BlockStatus.MISSED


def test_future_blocks_are_not_emitted() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, duration_weeks=4)
    progress = compute_progress(commitment, [], today=starts_on)
    assert len(progress.blocks) == 1
    assert progress.blocks[0].index == 0
    assert progress.weeks_total == 4


# Streaks and shape


def test_ongoing_goal_twelve_weeks_returns_last_eight_blocks_but_full_streak() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=1)
    # One qualifying completion per week, weeks 0 through 11 (12 blocks total) -
    # `today` sits on the first day of block 11, the last one emitted.
    completions = [_completion(on_date=starts_on + timedelta(days=7 * week)) for week in range(12)]
    today = starts_on + timedelta(days=7 * 11)
    progress = compute_progress(commitment, completions, today=today)
    assert len(progress.blocks) == 8
    assert progress.longest_streak == 12


def test_in_progress_block_does_not_break_current_streak() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=1)
    completions = [
        _completion(on_date=starts_on),
        _completion(on_date=starts_on + timedelta(days=7)),
    ]
    progress = compute_progress(commitment, completions, today=starts_on + timedelta(days=14))
    assert progress.blocks[-1].status == BlockStatus.IN_PROGRESS
    assert progress.current_streak == 2


def test_missed_block_resets_current_streak_to_zero() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=1)
    completions = [_completion(on_date=starts_on)]  # block 1 gets nothing -> missed
    progress = compute_progress(commitment, completions, today=starts_on + timedelta(days=14))
    assert progress.blocks[1].status == BlockStatus.MISSED
    assert progress.current_streak == 0


def test_fixed_length_goal_weeks_total_equals_duration_weeks() -> None:
    starts_on = date(2026, 1, 5)
    commitment = _commitment(starts_on=starts_on, duration_weeks=6)
    progress = compute_progress(commitment, [], today=starts_on)
    assert progress.weeks_total == 6


# Ending a goal


def test_ended_mid_week_drops_the_open_block_and_weeks_total_counts_complete_only() -> None:
    starts_on = date(2026, 1, 5)  # block 0: Jan 5-11
    commitment = _commitment(starts_on=starts_on, ended_on=starts_on + timedelta(days=3))
    progress = compute_progress(commitment, [], today=starts_on + timedelta(days=3))
    assert progress.blocks == []
    assert progress.weeks_total == 0


def test_ended_on_exact_last_day_of_a_block_emits_that_block() -> None:
    starts_on = date(2026, 1, 5)  # block 0 ends Jan 11
    ended_on = starts_on + timedelta(days=6)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=1, ended_on=ended_on)
    completion = _completion(on_date=starts_on)  # hits the target so it's PASSED, not dropped
    progress = compute_progress(commitment, [completion], today=ended_on)
    assert len(progress.blocks) == 1
    assert progress.blocks[0].ends_on == ended_on
    assert progress.weeks_total == 1


def test_ending_a_fixed_length_goal_early_behaves_the_same_as_ongoing() -> None:
    starts_on = date(2026, 1, 5)
    ended_on = starts_on + timedelta(days=6)
    commitment = _commitment(
        starts_on=starts_on, sessions_per_week=1, duration_weeks=8, ended_on=ended_on
    )
    completion = _completion(on_date=starts_on)
    progress = compute_progress(commitment, [completion], today=ended_on)
    assert len(progress.blocks) == 1
    assert progress.weeks_total == 1


def test_ended_commitment_has_no_in_progress_block_even_when_today_is_mid_block() -> None:
    """today lands squarely inside what would have been the next block, which
    would normally be IN_PROGRESS - but the goal ended before that block
    started, so it must never be emitted at all, let alone as in-progress.
    """
    starts_on = date(2026, 1, 5)
    ended_on = starts_on + timedelta(days=6)  # ends right at the close of block 0
    commitment = _commitment(starts_on=starts_on, sessions_per_week=5, ended_on=ended_on)
    progress = compute_progress(commitment, [], today=starts_on + timedelta(days=10))
    assert all(block.status != BlockStatus.IN_PROGRESS for block in progress.blocks)


def test_ended_short_block_is_missed_not_dropped_when_it_actually_completed() -> None:
    """Ending exactly on a block's last day without having hit the target:
    the block is still emitted (ends_on <= ended_on holds), just as MISSED
    rather than IN_PROGRESS.
    """
    starts_on = date(2026, 1, 5)
    ended_on = starts_on + timedelta(days=6)
    commitment = _commitment(starts_on=starts_on, sessions_per_week=5, ended_on=ended_on)
    progress = compute_progress(commitment, [], today=ended_on)
    assert len(progress.blocks) == 1
    assert progress.blocks[0].status == BlockStatus.MISSED
