import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

describe('Modal for keyboard and screen-reader users', () => {
  it('is announced as a modal dialog named by its title', () => {
    render(<Modal open onClose={() => {}} title="Turn off Maintenance?">body</Modal>);

    const dialog = screen.getByRole('dialog', { name: 'Turn off Maintenance?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has no name to point at when it has no title, rather than a dangling reference', () => {
    render(<Modal open onClose={() => {}}>body</Modal>);

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-labelledby');
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Modal open onClose={() => {}} title="T"><button>Inside</button></Modal>);

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('gives focus back to what opened it when it closes', () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open it</button><Modal open={open} onClose={() => setOpen(false)} title="T"><button>Inside</button></Modal></>;
    }
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside: from the last control it wraps to the first, and Shift+Tab from the first wraps to the last', () => {
    render(<Modal open onClose={() => {}} title="T" footer={<><button>Cancel</button><button>Turn off</button></>}>body</Modal>);
    const close = screen.getByRole('button', { name: 'Close' });
    const turnOff = screen.getByRole('button', { name: 'Turn off' });

    turnOff.focus();
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(false);        // default prevented: we move focus ourselves
    expect(close).toHaveFocus();

    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(turnOff).toHaveFocus();
  });

  it('lets Tab move normally between controls in the middle', () => {
    render(<Modal open onClose={() => {}} title="T" footer={<><button>Cancel</button><button>Turn off</button></>}>body</Modal>);
    screen.getByRole('button', { name: 'Close' }).focus();

    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);          // not intercepted
  });

  it('pulls focus back in if it somehow ended up outside the dialog', () => {
    render(<><button>Behind</button><Modal open onClose={() => {}} title="T"><button>Inside</button></Modal></>);
    screen.getByRole('button', { name: 'Behind' }).focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('skips disabled controls when wrapping', () => {
    render(<Modal open onClose={() => {}} title="T" footer={<><button>Cancel</button><button disabled>Not yet</button></>}>body</Modal>);
    screen.getByRole('button', { name: 'Cancel' }).focus();

    fireEvent.keyDown(document, { key: 'Tab' });                            // Cancel is the last enabled control

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('does not take focus again when the page re-renders with a new onClose', () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="T"><input aria-label="Name" /></Modal>);
    const input = screen.getByLabelText('Name');
    input.focus();

    rerender(<Modal open onClose={() => {}} title="T"><input aria-label="Name" /></Modal>);

    expect(input).toHaveFocus();
  });
});
