// Download manager for Minecraft instances, libraries, and mods

export interface DownloadProgress {
  phase: string;
  progress: number;
  current?: string;
  total?: number;
  downloaded?: number;
}

export interface DownloadableFile {
  url: string;
  path: string;
  size?: number;
  sha1?: string;
}

const MOJANG_META = 'https://launchermeta.mojang.com';
const MOJANG_ASSETS = 'https://resources.download.minecraft.net';

// Get version manifest
export async function getVersionManifest(): Promise<{
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string }>;
}> {
  const response = await fetch(`${MOJANG_META}/mc/game/version_manifest_v2.json`);
  return response.json();
}

// Get version details
export async function getVersionDetails(versionUrl: string): Promise<{
  id: string;
  libraries: Array<{
    name: string;
    downloads?: {
      artifact?: { url: string; path: string; size: number; sha1: string };
      classifiers?: Record<string, { url: string; path: string; size: number; sha1: string }>;
    };
    natives?: Record<string, string>;
  }>;
  mainClass: string;
  assetIndex: { id: string; url: string; sha1: string; totalSize: number };
  downloads: {
    client: { url: string; size: number; sha1: string };
    server?: { url: string; size: number; sha1: string };
  };
}> {
  const response = await fetch(versionUrl);
  return response.json();
}

// Get asset index
export async function getAssetIndex(assetUrl: string): Promise<{
  objects: Record<string, { hash: string; size: number }>;
}> {
  const response = await fetch(assetUrl);
  return response.json();
}

// Extract downloadable files from version details
export function extractLibraries(
  versionDetails: Awaited<ReturnType<typeof getVersionDetails>>,
  nativesPlatform: string
): DownloadableFile[] {
  const files: DownloadableFile[] = [];

  for (const lib of versionDetails.libraries) {
    // Skip libraries with rules that exclude this platform
    if (lib.downloads?.artifact) {
      files.push({
        url: lib.downloads.artifact.url,
        path: `libraries/${lib.downloads.artifact.path}`,
        size: lib.downloads.artifact.size,
        sha1: lib.downloads.artifact.sha1,
      });
    }

    // Add natives for this platform
    if (lib.downloads?.classifiers) {
      const nativeKey = `natives-${nativesPlatform}`;
      const classifier = lib.downloads.classifiers[nativeKey];
      if (classifier) {
        files.push({
          url: classifier.url,
          path: `libraries/${classifier.path}`,
          size: classifier.size,
          sha1: classifier.sha1,
        });
      }
    }
  }

  return files;
}

// Extract asset files
export function extractAssets(
  assetIndex: Awaited<ReturnType<typeof getAssetIndex>>
): DownloadableFile[] {
  const files: DownloadableFile[] = [];

  for (const [, obj] of Object.entries(assetIndex.objects)) {
    const hash = obj.hash;
    const prefix = hash.slice(0, 2);
    files.push({
      url: `${MOJANG_ASSETS}/${prefix}/${hash}`,
      path: `assets/objects/${prefix}/${hash}`,
      size: obj.size,
      sha1: hash,
    });
  }

  return files;
}

// Get all files needed for an instance
export async function getInstanceFiles(
  version: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{
  client: DownloadableFile;
  libraries: DownloadableFile[];
  assets: DownloadableFile[];
  natives: DownloadableFile[];
}> {
  onProgress?.({ phase: 'Fetching version manifest...', progress: 0 });

  // Get version manifest
  const manifest = await getVersionManifest();
  const versionInfo = manifest.versions.find(v => v.id === version);

  if (!versionInfo) {
    throw new Error(`Version ${version} not found`);
  }

  onProgress?.({ phase: 'Fetching version details...', progress: 10 });

  // Get version details
  const versionDetails = await getVersionDetails(versionInfo.url);
  const nativesPlatform = process.platform === 'win32' ? 'windows' :
                            process.platform === 'darwin' ? 'macos' : 'linux';

  onProgress?.({ phase: 'Extracting libraries...', progress: 20 });

  // Extract libraries
  const libraries = extractLibraries(versionDetails, nativesPlatform);

  onProgress?.({ phase: 'Fetching asset index...', progress: 30 });

  // Get assets
  const assetIndex = await getAssetIndex(versionDetails.assetIndex.url);
  const assets = extractAssets(assetIndex);

  onProgress?.({ phase: 'Preparing download...', progress: 40 });

  // Client JAR
  const client: DownloadableFile = {
    url: versionDetails.downloads.client.url,
    path: `versions/${version}/${version}.jar`,
    size: versionDetails.downloads.client.size,
    sha1: versionDetails.downloads.client.sha1,
  };

  // Extract natives
  const natives: DownloadableFile[] = libraries.filter(f =>
    f.path.includes(`natives-${nativesPlatform}`)
  );

  return { client, libraries, assets, natives };
}

// Get mod dependencies from Modrinth
export async function getModDependencies(
  projectId: string,
  minecraftVersion: string,
  loader: string
): Promise<Array<{ project_id: string; dependency_type: string }>> {
  try {
    const response = await fetch(
      `https://api.modrinth.com/v2/project/${projectId}/dependencies?\
game_versions=["${minecraftVersion}"]&loaders=["${loader}"]`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.dependencies || [];
  } catch {
    return [];
  }
}

// Resolve full dependency tree
export async function resolveDependencies(
  projectId: string,
  minecraftVersion: string,
  loader: string,
  visited: Set<string> = new Set()
): Promise<string[]> {
  if (visited.has(projectId)) return [];
  visited.add(projectId);

  const deps = await getModDependencies(projectId, minecraftVersion, loader);
  const required: string[] = [];

  for (const dep of deps) {
    if (dep.dependency_type === 'required') {
      required.push(dep.project_id);
      const subDeps = await resolveDependencies(
        dep.project_id,
        minecraftVersion,
        loader,
        visited
      );
      required.push(...subDeps);
    }
  }

  return required;
}

// Format bytes
export function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// Calculate total size
export function calculateTotalSize(files: DownloadableFile[]): number {
  return files.reduce((sum, f) => sum + (f.size || 0), 0);
}
