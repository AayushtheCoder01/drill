import { Component, type ReactNode } from "react";

/** Stops one broken subtree from taking the whole app down with it.
 *
 *  Drill has no error boundary around its root, so a render crash anywhere —
 *  a pane reading a card that was just deleted, a settings page reading a
 *  project that was just archived — white-screens every view at once. That
 *  has happened for real. This is the cheap local version: wrap the things
 *  that render other people's data, and a crash costs you that panel rather
 *  than the session.
 *
 *  `fallback` is what to show instead. Sheet passes none, because a pane that
 *  cannot render should simply close; settings passes a message, because the
 *  navigation around it still works and vanishing content reads as a hang. */
export default class ErrorGuard extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: Error) {
    console.error("ErrorGuard caught", err);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
