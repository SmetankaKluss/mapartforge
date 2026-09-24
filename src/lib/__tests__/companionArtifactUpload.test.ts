import { describe, expect, it, vi } from 'vitest';
import { uploadCompanionArtifactBlob } from '../companionArtifactUpload';

const target = {
  artifactId: 'artifact-1',
  method: 'PUT' as const,
  url: 'https://storage.example/object?signature=private',
  headers: {
    'content-type': 'image/png',
    'if-none-match': '*',
  },
};

describe('uploadCompanionArtifactBlob', () => {
  it('reports the storage host without leaking signed URLs on network failure', async () => {
    await expect(uploadCompanionArtifactBlob(
      'artifact-1',
      new Blob(['png']),
      target,
      vi.fn(async () => { throw new TypeError(`Failed to fetch ${target.url}`); }),
    )).rejects.toThrow(/^artifact_upload_network_failed \(storage\.example\)$/);
  });

  it.each([200, 409, 412])('accepts immutable upload status %s', async status => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    await expect(uploadCompanionArtifactBlob(
      'artifact-1',
      new Blob(['png']),
      target,
      fetcher,
    )).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects missing targets and storage failures', async () => {
    await expect(uploadCompanionArtifactBlob(
      'artifact-1',
      new Blob(['png']),
      undefined,
    )).rejects.toThrow('artifact_upload_target_missing');
    await expect(uploadCompanionArtifactBlob(
      'artifact-1',
      new Blob(['png']),
      target,
      vi.fn(async () => new Response(null, { status: 503 })),
    )).rejects.toThrow('artifact_upload_failed_503');
  });
});
