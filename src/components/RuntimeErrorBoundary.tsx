import React from 'react';
import { Download, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { encodePQWSave } from '../state/saveManager';
import { diagnostics } from '../state/diagnostics';
import { useGameStore } from '../state/gameStore';

interface RuntimeErrorBoundaryProps {
  children: React.ReactNode;
}

interface RuntimeErrorBoundaryState {
  failed: boolean;
  retryKey: number;
  status: string;
}

function downloadText(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export class RuntimeErrorBoundary extends React.Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  private readonly headingRef = React.createRef<HTMLHeadingElement>();
  public state: RuntimeErrorBoundaryState = { failed: false, retryKey: 0, status: '' };

  public static getDerivedStateFromError(): Partial<RuntimeErrorBoundaryState> {
    return { failed: true };
  }

  public componentDidCatch(): void {
    this.headingRef.current?.focus();
  }

  private retry = () => {
    this.setState((state) => ({ failed: false, retryKey: state.retryKey + 1, status: '' }));
  };

  private downloadDiagnostics = () => {
    try {
      downloadText('progquest-diagnostics.json', diagnostics.exportReport(), 'application/json');
      this.setState({ status: 'Diagnostics downloaded. Nothing was uploaded.' });
    } catch (error) {
      diagnostics.record({ code: 'diagnostic_export_failed', severity: 'warning', subsystem: 'diagnostics', operation: 'export', outcome: 'failed', source: 'recovery-ui', error });
      this.setState({ status: 'The browser refused the diagnostic download.' });
    }
  };

  private downloadSave = () => {
    try {
      // Said here rather than discovered later. This screen is reached because something already
      // went wrong, so it is exactly where a character is most likely to be in a state the importer
      // will refuse — and handing over a file that cannot be imported would be the worse failure of
      // the two, because nothing would announce it until the session was gone.
      const encoded = encodePQWSave(useGameStore.getState().character);
      if (!encoded.ok) {
        diagnostics.record({ code: 'save_export_failed', severity: 'warning', subsystem: 'save', operation: 'export', outcome: 'failed', source: 'recovery-ui' });
        this.setState({ status: encoded.error.message });
        return;
      }
      downloadText('progquest-current.pqw', encoded.value, 'text/plain');
      this.setState({ status: 'Current save downloaded.' });
    } catch (error) {
      diagnostics.record({ code: 'save_export_failed', severity: 'warning', subsystem: 'save', operation: 'export', outcome: 'failed', source: 'recovery-ui', error });
      this.setState({ status: 'The current save could not be downloaded.' });
    }
  };

  public render(): React.ReactNode {
    if (!this.state.failed) return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;

    return (
      <main className="recovery-shell">
        <section className="recovery-panel" aria-labelledby="recovery-title">
          <p className="eyebrow">PROGRESS QUEST III RUNTIME RECOVERY</p>
          <h1 id="recovery-title" ref={this.headingRef} tabIndex={-1}>The quest process encountered an enthusiasm.</h1>
          <p className="recovery-code">*** STOP: PQIII_INTERFACE_EXCEPTION ***</p>
          <p>The interface stopped, which is dramatic. Your locally saved characters were not deleted.</p>
          <p>No report has been transmitted. You may download a deliberately boring, redacted diagnostic file.</p>
          <div className="recovery-actions">
            <button className="btn" type="button" onClick={this.retry}><RotateCcw size={16} /> Retry interface</button>
            <button className="btn" type="button" onClick={() => window.location.reload()}><RefreshCw size={16} /> Reload page</button>
            <button className="btn" type="button" onClick={this.downloadSave}><Save size={16} /> Download current save</button>
            <button className="btn" type="button" onClick={this.downloadDiagnostics}><Download size={16} /> Download diagnostics</button>
          </div>
          <p className="recovery-status" role="status">{this.state.status}</p>
        </section>
      </main>
    );
  }
}
