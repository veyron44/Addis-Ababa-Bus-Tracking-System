import { Component, type ReactNode } from 'react';

interface State { error: string | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40,
          fontFamily: 'monospace',
          background: '#fee2e2',
          minHeight: '100vh',
          color: '#991b1b',
        }}>
          <h2>⚠ App crashed</h2>
          <p>Open the browser console (F12 → Console) for full details.</p>
          <pre style={{ background: '#fff', padding: 16, borderRadius: 8, overflowX: 'auto' }}>
            {this.state.error}
          </pre>
          <button
            style={{ marginTop: 16, padding: '8px 20px', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
