"use client";

import { Component, type ReactNode } from "react";

type RootErrorBoundaryProps = {
  readonly children: ReactNode;
};

type RootErrorBoundaryState = {
  readonly failed: boolean;
};

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main
          className="grid min-h-screen place-items-center bg-[#080b10] p-4 text-[#f2ead8]"
          role="alert"
        >
          <section className="grid max-w-md gap-3 rounded-lg border border-[#3b4351] bg-[#111821] p-5">
            <p className="m-0 text-sm uppercase text-[#aab2c0]">UI boundary</p>
            <h1 className="m-0 text-2xl">The run view failed.</h1>
            <p className="m-0 leading-6 text-[#c7cfda]">
              Reload the client to return to the title screen. Engine state and
              persisted artifacts are not modified by this boundary.
            </p>
            <button
              className="min-h-11 rounded-md border border-[#d6a84f] bg-[#151b24] px-4 text-left text-[#f2ead8]"
              type="button"
              onClick={() => globalThis.location.reload()}
            >
              Reload client
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
