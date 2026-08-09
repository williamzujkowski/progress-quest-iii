// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Caseload } from '../../components/Caseload';
import { EMPTY_CASELOAD } from '../../state/caseload';
import { useGameStore } from '../../state/gameStore';

afterEach(cleanup);

describe('docket summary panel', () => {
  it('stays away entirely until something has been filed', () => {
    useGameStore.setState({ caseload: EMPTY_CASELOAD });
    const { container } = render(<Caseload />);
    // Five zeroes read as a broken panel rather than a young one.
    expect(container.innerHTML).toBe('');
  });

  it('reports only the kinds actually assigned, in the engine order', () => {
    useGameStore.setState({ caseload: { kinds: { placate: 3, exterminate: 41 }, targets: {}, targetActs: {} } });
    render(<Caseload />);

    const rows = screen.getByRole('list', { name: 'Docket summary' });
    const labels = [...rows.children].map((row) => row.querySelector('.equip-slot')?.textContent);
    // exterminate precedes placate in the engine's own ordering, whatever order the tally holds.
    expect(labels).toEqual(['Extermination writs closed', 'Placation accords reached']);
    expect(screen.getByText('41')).toBeTruthy();
    // A kind with no cases is a category this hero has not been assigned, not a zero to report.
    expect(screen.queryByText('Deliveries acknowledged')).toBeNull();
  });

  it('names the most frequently filed against', () => {
    useGameStore.setState({ caseload: { kinds: { fetch: 5 }, targets: { Kobold: 14, Imp: 2 }, targetActs: { Kobold: { first: 2, last: 6 } } } });
    render(<Caseload />);

    expect(screen.getByText('Most frequently filed against')).toBeTruthy();
    expect(screen.getByText(/Kobold/)).toBeTruthy();
    expect(screen.getByText('14')).toBeTruthy();
  });
});
