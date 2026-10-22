import {
  buildGoalCreatePayload,
  canSaveGoal,
  defaultGoalForm,
  goalSummarySentence,
  isAmountValueDisabled,
  isChallengeForm,
  withSendTo,
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

describe('Send to', () => {
  it('a new form is a goal', () => {
    expect(isChallengeForm(defaultGoalForm())).toBe(false);
  });

  it('a username makes it a challenge; whitespace alone does not', () => {
    expect(isChallengeForm({ sendTo: 'Sam' })).toBe(true);
    expect(isChallengeForm({ sendTo: '   ' })).toBe(false);
  });

  it('keeps the username exactly as typed', () => {
    expect(withSendTo(defaultGoalForm(), 'Jordan_R').sendTo).toBe('Jordan_R');
  });

  it('moves an Ongoing duration to weeks when the form becomes a challenge', () => {
    const ongoing = { ...defaultGoalForm(), duration: { kind: 'ongoing' } as const };
    expect(withSendTo(ongoing, 'sam').duration).toEqual({ kind: 'weeks', weeks: 2 });
  });

  it('leaves a chosen week count alone', () => {
    const sixWeeks = { ...defaultGoalForm(), duration: { kind: 'weeks', weeks: 6 } as const };
    expect(withSendTo(sixWeeks, 'sam').duration).toEqual({ kind: 'weeks', weeks: 6 });
  });

  it('clearing the field turns it back into a goal, keeping the weeks', () => {
    const challenge = withSendTo({ ...defaultGoalForm(), duration: { kind: 'weeks', weeks: 5 } }, 'sam');
    const back = withSendTo(challenge, '');
    expect(isChallengeForm(back)).toBe(false);
    expect(back.duration).toEqual({ kind: 'weeks', weeks: 5 });
  });
});

describe('goalSummarySentence for a challenge', () => {
  it('names the recipient, as typed', () => {
    const challenge = withSendTo(form({ activity: 'running', sessionsPerWeek: 3 }), '  Sam ');
    expect(goalSummarySentence(challenge)).toBe('Run 3 times a week, for 2 weeks, with Sam.');
  });

  it('names the recipient after a target too', () => {
    const challenge = withSendTo(
      form({ activity: 'running', sessionsPerWeek: 3, amount: { kind: 'set', value: '2', unit: 'miles' } }),
      'Sam',
    );
    expect(goalSummarySentence(challenge)).toMatch(/^Run at least 2 .+, 3 times a week, for 2 weeks, with Sam\.$/);
  });

  it('leaves a goal without a recipient clause', () => {
    expect(goalSummarySentence(form({ activity: 'running', sessionsPerWeek: 3 }))).toBe('Run 3 times a week, for 2 weeks.');
  });
});

describe('buildGoalCreatePayload for a challenge', () => {
  it('leaves recipient_username out entirely for a goal', () => {
    expect(buildGoalCreatePayload(form({ activity: 'running' }))).not.toHaveProperty('recipient_username');
  });

  it('sends recipient_username for a challenge, with its case exactly as typed', () => {
    const payload = buildGoalCreatePayload(withSendTo(form({ activity: 'running' }), 'Jordan_R'));
    expect(payload.recipient_username).toBe('Jordan_R');
  });

  it('trims surrounding spaces, which a username can never contain', () => {
    expect(buildGoalCreatePayload(withSendTo(form({ activity: 'running' }), '  Sam ')).recipient_username).toBe('Sam');
  });

  it('always sends a challenge with a week count, never Ongoing', () => {
    const ongoing = form({ activity: 'running', duration: { kind: 'ongoing' } });
    expect(buildGoalCreatePayload(withSendTo(ongoing, 'sam')).duration_weeks).toBe(2);
  });
});
