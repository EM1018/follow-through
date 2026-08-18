import { renderRouter, screen } from 'expo-router/testing-library';

import { TabsLayout } from './TabsLayout';

describe('bottom tab bar', () => {
  it('shows four tabs with the expected labels', async () => {
    renderRouter(
      {
        _layout: TabsLayout,
        index: () => null,
        log: () => null,
        goals: () => null,
        profile: () => null,
      },
      { initialUrl: '/' },
    );

    expect(await screen.findByText('Schedule')).toBeTruthy();
    expect(screen.getByText('Log')).toBeTruthy();
    expect(screen.getByText('Goals')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
  });
});
