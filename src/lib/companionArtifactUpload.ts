export type CompanionArtifactUploadTarget = {
  artifactId: string;
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
};

export async function uploadCompanionArtifactBlob(
  artifactId: string,
  blob: Blob,
  target: CompanionArtifactUploadTarget | undefined,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!target || target.artifactId !== artifactId) {
    throw new Error('artifact_upload_target_missing');
  }
  const response = await fetcher(target.url, {
    method: target.method,
    headers: target.headers,
    body: blob,
  });
  if (!response.ok && response.status !== 409 && response.status !== 412) {
    throw new Error(`artifact_upload_failed_${response.status}`);
  }
}
