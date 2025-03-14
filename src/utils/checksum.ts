import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Verifies a file's checksum
 */
export async function verifyFileChecksum(
  filePath: string,
  expectedHash: string,
  algorithm: string = 'sha256'
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        const fileHash = hash.digest('hex');
        resolve(fileHash === expectedHash);
      });

      stream.on('error', (error) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}
