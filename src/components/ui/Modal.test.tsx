import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal footer', () => {
  it('lets its buttons wrap onto a second line on a narrow screen, so none is pushed off the edge', () => {
    render(<Modal open onClose={() => {}} title="Log reading" footer={<><button>Cancel</button><button>Log &amp; bill ₦10,000</button><button>Log reading</button></>}>body</Modal>);

    const footer = screen.getByText('Cancel').parentElement!;
    expect(footer.className).toContain('flex-wrap');
    expect(footer.className).toContain('justify-end');          // still right-aligned when they fit on one line
    expect(screen.getAllByRole('button')).toHaveLength(4);      // the close icon and the three footer buttons
  });

  it('closes from the close icon and from Escape', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">body</Modal>);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
