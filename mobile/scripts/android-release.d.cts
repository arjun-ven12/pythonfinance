export interface AndroidMetadata { version: string; versionCode: number; applicationId: string; apk: string }
export function metadata(version: string, tag?: string): AndroidMetadata;
export function backendOrigin(value: unknown): string;
export function publicAddress(address: string): boolean;
export function probeBackend(value: unknown, dependencies?: { lookup?: (host: string, options: { all: boolean }) => Promise<{ address: string }[]>; fetcher?: (url: string, options?: RequestInit) => Promise<unknown> }): Promise<boolean>;
export function unsignedRelease(source: string): string;
export function pinnedWrapper(source: string): string;
export function signingFingerprint(value: unknown): string;
export function inspectBadging(output: string, expected: AndroidMetadata): void;
export function inspectCertificate(output: string, expected: string): void;
