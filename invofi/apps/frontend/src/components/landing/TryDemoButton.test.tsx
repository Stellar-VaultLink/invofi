import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { TryDemoButton } from './TryDemoButton';

describe('TryDemoButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the demo label', () => {
    render(<TryDemoButton label="Try the demo" />);
    expect(screen.getByRole('link', { name: /Try the demo/i })).toBeInTheDocument();
  });

  it('links to the portfolio page (seeded demo data lives there)', () => {
    render(<TryDemoButton label="Try the demo" />);
    const link = screen.getByRole('link', { name: /Try the demo/i });
    expect(link).toHaveAttribute('href', '/portfolio');
  });

  it('includes a decorative sparkles icon', () => {
    render(<TryDemoButton label="Try the demo" />);
    const link = screen.getByRole('link', { name: /Try the demo/i });
    expect(link.querySelector('svg')).not.toBeNull();
  });
});
