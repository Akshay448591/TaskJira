import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';

function ProblemChild() {
  throw new Error('Test crash in child component');
}

function GoodChild() {
  return <div>Application content active</div>;
}

describe('ErrorBoundary Component', () => {
  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Application content active')).toBeInTheDocument();
  });

  it('catches render errors and displays fallback UI with error message', () => {
    // Suppress console.error output during deliberate test crash
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Application Exception')).toBeInTheDocument();
    expect(screen.getByText(/Test crash in child component/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();

    spy.mockRestore();
  });
});
