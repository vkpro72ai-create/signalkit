/**
 * Downloads + native share sheet for pack deliverables (PDF, ZIP bundles) and
 * locally-generated files (backlog/prompt Markdown built from `pack.metadata`).
 *
 * "Open" and "Share" both resolve to: download to cache (if not already
 * cached) → invoke the native share sheet. On iOS the share sheet previews
 * the file (functions as "Open"); on Android it lets the user pick a viewer
 * or save location.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getApiToken, packApi, exportJobApi } from './api';

async function downloadToCache(url: string, fileName: string): Promise<string> {
  const dest = `${FileSystem.cacheDirectory}${fileName}`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;

  const token = getApiToken();
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) {
    throw new Error(`Download failed (HTTP ${result.status}).`);
  }
  return result.uri;
}

async function share(uri: string, mimeType?: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, {
    mimeType,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
  });
}

/** Downloads a remote export artifact (PDF/ZIP) and opens the native share sheet. */
export async function openOrShareRemoteFile(url: string, fileName: string, mimeType?: string): Promise<void> {
  const uri = await downloadToCache(url, fileName);
  await share(uri, mimeType);
}

/** Writes a locally-built string (e.g. a backlog Markdown file) to cache and shares it. */
export async function shareTextAsFile(content: string, fileName: string, mimeType = 'text/markdown'): Promise<void> {
  const dest = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(dest, content, { encoding: FileSystem.EncodingType.UTF8 });
  await share(dest, mimeType);
}

export type ExportJobStatus = {
  id: string;
  type: string;
  status: string;
  fileName?: string;
};

/**
 * Finds a `ready` export job of the given type for the pack, or creates one
 * and polls until it's ready. `onStatus` is called on every poll so the
 * caller can show an inline spinner/status label.
 */
export async function getOrCreateReadyExport(
  wsId: string,
  packId: string,
  type: string,
  onStatus?: (status: string) => void,
): Promise<ExportJobStatus> {
  const existing = await packApi.exports(wsId, packId);
  const ready = existing.find((j) => j.type === type && j.status === 'ready');
  if (ready) return ready;

  let current: ExportJobStatus | undefined = existing.find((j) => j.type === type && (j.status === 'queued' || j.status === 'processing'));
  if (!current) {
    const created = await exportJobApi.create(wsId, packId, { type });
    current = { id: created.id, type, status: created.status };
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    onStatus?.(current.status);
    if (current.status === 'ready') return current;
    if (current.status === 'failed') throw new Error('Export generation failed.');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const list = await packApi.exports(wsId, packId);
    const match = list.find((j) => j.id === current!.id);
    if (match) current = match;
  }

  throw new Error('Export timed out — try again in a moment.');
}

/** Convenience: create/reuse a ready export of `type`, then open/share it. */
export async function openOrShareExport(
  wsId: string,
  packId: string,
  type: string,
  mimeType: string,
  onStatus?: (status: string) => void,
): Promise<void> {
  const job = await getOrCreateReadyExport(wsId, packId, type, onStatus);
  const url = exportJobApi.downloadUrl(wsId, job.id);
  await openOrShareRemoteFile(url, job.fileName ?? `export.${mimeType === 'application/pdf' ? 'pdf' : 'zip'}`, mimeType);
}
