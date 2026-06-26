export type CommandLogger = (event: string, fields?: Record<string, unknown>) => void;

export * from './findYdotoolPath';
export * from './findYdotooldPath';
export * from './findPkexecPath';
export * from './writePrimarySelectionText';
export * from './probeYdotoolConnection';
export * from './sendYdotoolPasteShortcut';
export * from './stopYdotooldDaemon';
export * from './startYdotooldDirect';
export * from './startYdotooldWithPkexec';
