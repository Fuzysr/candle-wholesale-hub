const AUTH_CHANGED_EVENT = "cwh:auth-changed";
const AUTH_CHANNEL = "cwh:auth-channel";
const channel =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(AUTH_CHANNEL);

channel?.addEventListener("message", (event: MessageEvent<boolean>) => {
  window.dispatchEvent(
    new CustomEvent<boolean>(AUTH_CHANGED_EVENT, { detail: event.data }),
  );
});

/** Notify React state that server-managed auth cookies may have changed. */
export const notifyAuthChanged = (authenticated: boolean): void => {
  window.dispatchEvent(
    new CustomEvent<boolean>(AUTH_CHANGED_EVENT, { detail: authenticated }),
  );
  channel?.postMessage(authenticated);
};

export const onAuthChanged = (handler: (authenticated: boolean) => void): (() => void) => {
  const listener = (event: Event) => {
    handler((event as CustomEvent<boolean>).detail);
  };
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
};
