import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExplorerLink } from './ExplorerLink';

describe('ExplorerLink', () => {
  it('renders a contract link with the correct href', () => {
    render(<ExplorerLink type="contract" value="abc123" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/contract/abc123',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('renders an account link', () => {
    render(<ExplorerLink type="account" value="GABCDEF123456" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/account/GABCDEF123456',
    );
  });

  it('renders a transaction link', () => {
    render(<ExplorerLink type="tx" value="txhash" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/tx/txhash',
    );
  });

  it('renders children instead of the raw value', () => {
    render(<ExplorerLink type="contract" value="abc123">View</ExplorerLink>);
    expect(screen.getByRole('link')).toHaveTextContent('View');
  });

  it('applies a custom className', () => {
    render(<ExplorerLink type="contract" value="abc123" className="font-mono" />);
    expect(screen.getByRole('link')).toHaveClass('font-mono');
  });

  it('defaults title to "View on Stellar Expert"', () => {
    render(<ExplorerLink type="contract" value="abc123" />);
    expect(screen.getByRole('link')).toHaveAttribute('title', 'View on Stellar Expert');
  });

  it('accepts a custom title', () => {
    render(<ExplorerLink type="contract" value="abc123" title="Check it out" />);
    expect(screen.getByRole('link')).toHaveAttribute('title', 'Check it out');
  });
});