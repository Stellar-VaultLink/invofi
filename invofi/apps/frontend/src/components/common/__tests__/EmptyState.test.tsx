import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { EmptyState, type EmptyStateVariant } from '@/components/common/EmptyState';

const variants: EmptyStateVariant[] = ['no-invoices', 'no-offers', 'no-positions', 'no-results'];

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={FileText} title="No invoices" description="Create your first one" />);
    expect(screen.getByText('No invoices')).toBeInTheDocument();
    expect(screen.getByText('Create your first one')).toBeInTheDocument();
  });

  it('falls back to the lucide icon when no variant is set', () => {
    render(<EmptyState icon={FileText} title="Nothing here" description="desc" />);
    // The circle container renders only in the icon fallback branch
    const container = document.querySelector('.rounded-full');
    expect(container).not.toBeNull();
    // No illustration svg should be rendered
    expect(document.querySelector('svg[role="img"]')).toBeNull();
  });

  it.each(variants)('renders an inline brand illustration for variant %s', (variant) => {
    const { container } = render(
      <EmptyState variant={variant} title="Empty" description="Nothing to show" />
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // aria-label comes from the variant label map
    expect(svg).toHaveAttribute('aria-label');
    // The hexagon polygon (brand mark) is present
    expect(container.querySelector('polygon')).not.toBeNull();
  });

  it('renders the action node when provided', () => {
    render(
      <EmptyState
        variant="no-invoices"
        title="No invoices"
        description="desc"
        action={<button>Create invoice</button>}
      />
    );
    expect(screen.getByRole('button', { name: /create invoice/i })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState variant="no-results" title="No results" description="desc" className="custom-class" />
    );
    expect(container.firstElementChild).toHaveClass('custom-class');
  });
});
