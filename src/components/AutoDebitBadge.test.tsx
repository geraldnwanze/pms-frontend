import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AutoDebitBadge } from './AutoDebitBadge';

describe('AutoDebitBadge', () => {
  it.each([
    ['processing', 'Charging…'],
    ['manual', 'Auto-debit failed'],
    ['paid', 'Paid by auto-debit'],
    ['partial', 'Part-paid by auto-debit'],
  ] as const)('labels %s', (state, label) => {
    render(<AutoDebitBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows the date for scheduled and retrying states, with a plain fallback without one', () => {
    const { rerender } = render(<AutoDebitBadge state="scheduled" info={{ dueDate: '2026-11-20', nextAttemptOn: null, lastReason: null }} />);
    expect(screen.getByText(/^Charges /)).toBeInTheDocument();
    rerender(<AutoDebitBadge state="scheduled" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    rerender(<AutoDebitBadge state="retrying" info={{ dueDate: null, nextAttemptOn: '2026-11-21', lastReason: null }} />);
    expect(screen.getByText(/^Retry /)).toBeInTheDocument();
    rerender(<AutoDebitBadge state="retrying" />);
    expect(screen.getByText('Retrying')).toBeInTheDocument();
  });

  it('puts the failure reason in the tooltip', () => {
    render(<AutoDebitBadge state="retrying" info={{ dueDate: null, nextAttemptOn: null, lastReason: 'Insufficient funds' }} />);
    expect(screen.getByText('Retrying').closest('span[title]')).toHaveAttribute('title', expect.stringContaining('Last reason: Insufficient funds'));
  });
});
