import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaginationControls } from '@/components/portfolio/PaginationControls';

function renderControls(overrides: Partial<Parameters<typeof PaginationControls>[0]> = {}) {
  const props = {
    page: 1,
    total: 55,
    pageSize: 10,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<PaginationControls {...props} />) };
}

describe('PaginationControls', () => {
  it('shows the item range and page-size selector', () => {
    renderControls();
    expect(screen.getByText('1–10 of 55')).toBeInTheDocument();
    expect(screen.getByLabelText('Page size')).toBeInTheDocument();
  });

  it('shows nothing but a count when there are no items', () => {
    renderControls({ total: 0 });
    expect(screen.getByText('0 positions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Page size')).not.toBeInTheDocument();
  });

  it('disables prev on the first page and next on the last page', () => {
    const { props } = renderControls({ page: 1 });
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with an exact page number when clicked', () => {
    const { props } = renderControls({ page: 2, total: 55 });
    fireEvent.click(screen.getByText('3'));
    expect(props.onPageChange).toHaveBeenCalledWith(3);
  });

  it('calls onPageSizeChange with the new size', () => {
    const { props } = renderControls();
    const select = screen.getByLabelText('Page size') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '50' } });
    expect(props.onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('renders a compact window for many pages', () => {
    renderControls({ page: 30, total: 1000, pageSize: 10 });
    // first + last page always visible in compact mode
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    // current page + neighbours
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });
});