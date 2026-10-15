type ClipboardKeyEvent = Pick<KeyboardEvent,
  'type' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'preventDefault' | 'stopPropagation'>;
type ClipboardEventControl = Pick<Event, 'preventDefault' | 'stopPropagation'>;
interface ClipboardActions { copy(): void; paste(): void; }

function consume(event: ClipboardEventControl): void {
  event.preventDefault();
  // VS Code forwards bubbled keydowns even when their default was prevented.
  // Keep an already handled shortcut from producing a second native paste.
  event.stopPropagation();
}

/** Return false for clipboard shortcuts handled here, as xterm expects. */
export function handleClipboardKey(
  event: ClipboardKeyEvent,
  platform: string,
  actions: ClipboardActions,
): boolean {
  if (event.type !== 'keydown') return true;
  const mac = /Mac|darwin/i.test(platform);
  const clipboardModifier = mac ? event.metaKey : event.ctrlKey && event.shiftKey;
  let action: (() => void) | undefined;
  if (clipboardModifier && event.code === 'KeyC') action = actions.copy;
  else if ((clipboardModifier && event.code === 'KeyV') || (event.shiftKey && event.code === 'Insert')) action = actions.paste;
  if (!action) return true;
  consume(event);
  action();
  return false;
}

/** Route native/context-menu paste through the same host-side paste checks. */
export function handleNativePaste(event: ClipboardEventControl, paste: () => void): void {
  consume(event);
  paste();
}
