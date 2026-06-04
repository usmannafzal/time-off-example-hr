"use client";

/**
 * Section-level error boundary (TRD §5.4): one global boundary in AppShell and
 * one around each major section, so an error in one section does not crash the
 * whole page.
 */

import { Component, type ReactNode } from "react";
import { Button, Notice } from "@/components/ui/primitives";

interface Props {
  /** Human label for the failing section, e.g. "Balances". */
  section: string;
  children: ReactNode;
  /** Optional reset hook (e.g. refetch) invoked on "Try again". */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Notice tone="error">
          <div className="flex flex-col gap-2">
            <span>
              <strong>{this.props.section}</strong> failed to load. The rest of
              the page is still usable.
            </span>
            <div>
              <Button variant="secondary" onClick={this.handleReset}>
                Try again
              </Button>
            </div>
          </div>
        </Notice>
      );
    }
    return this.props.children;
  }
}
