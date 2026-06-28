import { Injectable, Logger, StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { optionalEnv } from '@signalkit/config';

/**
 * Filesystem export storage.
 *
 * Base directory is controlled by EXPORT_STORAGE_PATH (production: mounted
 * Docker volume at /var/lib/signalkit/exports). Falls back to the local dev
 * path .signalkit/exports when the env var is absent.
 *
 * The interface is S3-compatible by design — replace write/read/stream with
 * S3/MinIO calls when you add object-storage support.
 */
@Injectable()
export class ExportStorageService {
  private readonly logger = new Logger(ExportStorageService.name);
  readonly baseDir: string;

  constructor() {
    this.baseDir = optionalEnv(
      'EXPORT_STORAGE_PATH',
      path.join(process.cwd(), '.signalkit', 'exports'),
    );
    this.ensureDir(this.baseDir);
    this.logger.log(`Export storage: ${this.baseDir}`);
  }

  /** Write a buffer to storage. Returns the stable storage key. */
  async write(workspaceId: string, jobId: string, fileName: string, data: Buffer): Promise<string> {
    const dir = path.join(this.baseDir, workspaceId, jobId);
    this.ensureDir(dir);
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, data);
    this.logger.debug(`Export saved: ${filePath} (${data.length} bytes)`);
    return `${workspaceId}/${jobId}/${fileName}`;
  }

  /** Read a buffer from storage by storage key. */
  async read(storageKey: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, storageKey);
    return fs.promises.readFile(filePath);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await fs.promises.access(path.join(this.baseDir, storageKey));
      return true;
    } catch {
      return false;
    }
  }

  /** Return a StreamableFile for download. */
  async stream(storageKey: string): Promise<StreamableFile> {
    const filePath = path.join(this.baseDir, storageKey);
    const stream = fs.createReadStream(filePath);
    return new StreamableFile(stream);
  }

  sha256(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
