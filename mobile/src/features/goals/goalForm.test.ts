import {
  buildGoalCreatePayload,
  canSaveGoal,
  defaultGoalForm,
  goalSummarySentence,
  isAmountValueDisabled,
  type GoalForm,
} from './goalForm';

function form(overrides: Partial<GoalForm>): GoalForm {
  return { ...defaultGoalForm(), ...overrides };
}

describe('goalSummarySentence', () => {
  it('builds a sentence for a targeted goal', () => {
    const sentence = goalSummarySentence(
      form({
        activity: 'running',
        amount: { kind: 'set', value: '2', unit: 'miles' },
        sessionsPerWeek: 2,
        duration: { kind: 'weeks', weeks: 2 },
      }),
    );
    expect(sentence).toBe('Run at least 2 miles, 2 times a week, for 2 weeks.');
  });

  it('builds a sentence for an untargeted goal', () => {
    const sentence = goalSummarySentence(
      form({
        activity: 'strength_training',
        amount: { kind: 'none' },
        sessionsPerWeek: 4,
        duration: { kind: 'ongoing' },
      }),
    );
    expect(sentence).toBe('Strength train 4 times a week, ongoing.');
  });

  it('builds a sentence for an ongoing goal', () => {
    const sentence = goalSummarySentence(
      form({
        activity: 'walking',
        amount: { kind: 'none' },
        sessionsPerWeek: 3,
        duration: { kind: 'ongoing' },
      }),
    );
    expect(sentence).toBe('Walk 3 times a week, ongoing.');
  });

  it('is null before an activity is picked -- the one row with no default', () => {
    expect(goalSummarySentence(form({ activity: null }))).toBeNull();
  });

  it('treats a chosen unit with a blank value the same as no target', () => {
    const sentence = goalSummarySentence(
      form({
        activity: 'running',
        amount: { kind: 'set', value: '', unit: 'miles' },
        sessionsPerWeek: 2,
        duration: { kind: 'weeks', weeks: 2 },
      }),
    );
    expect(sentence).toBe('Run 2 times a week, for 2 weeks.');
  });
});

describe('canSaveGoal', () => {
  it('is disabled with no activity picked', () => {
    expect(canSaveGoal(form({ activity: null }))).toBe(false);
  });

  it('is enabled once an activity is picked, regardless of the other (defaulted) fields', () => {
    expect(canSaveGoal(form({ activity: 'running' }))).toBe(true);
  });
});

describe('isAmountValueDisabled', () => {
  it('is disabled while "Set one" is chosen but no unit yet', () => {
    expect(isAmountValueDisabled({ amount: { kind: 'set', value: '', unit: null } })).toBe(true);
  });

  it('is enabled once a unit is chosen', () => {
    expect(isAmountValueDisabled({ amount: { kind: 'set', value: '', unit: 'miles' } })).toBe(false);
  });

  it('is enabled (irrelevant) when no target is chosen at all', () => {
    expect(isAmountValueDisabled({ amount: { kind: 'none' } })).toBe(false);
  });
});

describe('buildGoalCreatePayload', () => {
  it('sends null target_value/target_unit for "No target"', () => {
    const payload = buildGoalCreatePayload(
      form({ activity: 'running', amount: { kind: 'none' } }),
    );
    expect(payload.target_value).toBeNull();
    expect(payload.target_unit).toBeNull();
  });

  it('sends the numeric target for "Set one"', () => {
    const payload = buildGoalCreatePayload(
      form({ activity: 'running', amount: { kind: 'set', value: '3.5', unit: 'miles' } }),
    );
    expect(payload.target_value).toBe(3.5);
    expect(payload.target_unit).toBe('miles');
  });

  it('sends null duration_weeks for an ongoing goal', () => {
    const payload = buildGoalCreatePayload(form({ activity: 'running', duration: { kind: 'ongoing' } }));
    expect(payload.duration_weeks).toBeNull();
  });
});
