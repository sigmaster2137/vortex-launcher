import { memo, useState, useCallback, useEffect, useRef } from 'react';
import {
  Search, Download, Box, Palette, Layers, Grid3X3, List,
  Loader2, X, ChevronDown, DownloadCloud, Check, AlertCircle, Trash2
} from 'lucide-react';

type ContentType = 'mod' | 'shader' | 'resourcepack';

interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  author: string;
  downloads: number;
  follows: number;
  date_created: string;
  date_modified: string;
  latest_version: string;
  categories: string[];
  project_type: string;
  loader?: string[];
  game_versions?: string[];
}

interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: {
    id: string;
    url: string;
    filename: string;
    size: number;
  }[];
  dependencies: Array<{ project_id: string; dependency_type: string }>;
}

interface ContentItem {
  id: string;
  slug: string;
  name: string;
  author: string;
  description: string;
  icon: string | null;
  downloads: number;
  follows: number;
  categories: string[];
  projectType: string;
  loaders: string[];
  gameVersions: string[];
  latestVersion: string;
}

interface ContentBrowserProps {
  selectedInstance?: { id: string; name: string; version: string; modloader: string } | null;
  onInstall?: (item: ContentItem, version: ModrinthVersion, dependencies: string[]) => Promise<void>;
}

const MODRINTH_API = 'https://api.modrinth.com/v2';

const categoryLabels: Record<string, string> = {
  'adventure': 'Adventure',
  'cursed': 'Cursed',
  'decoration': 'Decoration',
  'equipment': 'Equipment',
  'food': 'Food',
  'library': 'Library',
  'magic': 'Magic',
  'optimization': 'Optimization',
  'storage': 'Storage',
  'technology': 'Technology',
  'transportation': 'Transportation',
  'utility': 'Utility',
  'worldgen': 'World Gen',
};

function formatDownloads(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${Math.floor(num / 1000)}K`;
  return String(num);
}

async function searchModrinth(
  query: string,
  type: ContentType,
  page: number = 0,
  filters?: { loaders?: string[]; versions?: string[] }
): Promise<{ items: ContentItem[]; total: number }> {
  const facets: string[][] = [[`project_type:${type}`]];

  // Only filter by specific loaders (not vanilla)
  if (filters?.loaders?.length && filters.loaders.length > 0) {
    // For Forge, also include "neoforge" as many mods support both
    const expandedLoaders = [...filters.loaders];
    if (filters.loaders.includes('forge') && !expandedLoaders.includes('neoforge')) {
      expandedLoaders.push('neoforge');
    }
    facets.push(expandedLoaders.map(l => `categories:${l}`));
  }
  if (filters?.versions?.length) {
    facets.push(filters.versions.map(v => `versions:${v}`));
  }

  const params = new URLSearchParams({
    query: query || '',
    facets: JSON.stringify(facets),
    index: 'relevance',
    offset: String(page * 20),
    limit: '20',
  });

  const response = await fetch(`${MODRINTH_API}/search?${params}`);
  if (!response.ok) throw new Error('Failed to fetch');

  const data = await response.json();
  const items: ContentItem[] = data.hits.map((hit: ModrinthProject) => ({
    id: hit.id,
    slug: hit.slug,
    name: hit.title,
    author: hit.author,
    description: hit.description,
    icon: hit.icon_url,
    downloads: hit.downloads,
    follows: hit.follows,
    categories: hit.categories,
    projectType: hit.project_type,
    loaders: hit.loader || [],
    gameVersions: hit.game_versions || [],
    latestVersion: hit.latest_version,
  }));

  return { items, total: data.total_hits };
}


async function getProjectDependencies(projectId: string): Promise<string[]> {
  try {
    const response = await fetch(`${MODRINTH_API}/project/${projectId}/dependencies`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.dependencies || [])
      .filter((d: { dependency_type: string }) => d.dependency_type === 'required')
      .map((d: { project_id: string }) => d.project_id);
  } catch {
    return [];
  }
}

export const ContentBrowser = memo(function ContentBrowser({ selectedInstance, onInstall }: ContentBrowserProps) {
  const [contentType, setContentType] = useState<ContentType>('mod');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [installedContent, setInstalledContent] = useState<Set<string>>(new Set());
  const searchTimeoutRef = useRef<number>();

  // Build filters based on content type and instance
  const getFilters = useCallback(() => {
    if (!selectedInstance) return undefined;

    const filters: { loaders?: string[]; versions?: string[] } = {
      versions: [selectedInstance.version],
    };

    // Mods need loader filtering
    if (contentType === 'mod') {
      if (selectedInstance.modloader !== 'vanilla') {
        // Expand Forge to include NeoForge (many mods support both)
        const loaders = [selectedInstance.modloader];
        if (selectedInstance.modloader === 'forge') {
          loaders.push('neoforge');
        }
        filters.loaders = loaders;
      }
    }
    // Shaders work with Iris (Fabric/Quilt) or Oculus (Forge/NeoForge)
    else if (contentType === 'shader') {
      if (selectedInstance.modloader === 'fabric' || selectedInstance.modloader === 'quilt') {
        filters.loaders = ['fabric', 'quilt', 'iris']; // Iris shaders
      } else if (selectedInstance.modloader === 'forge' || selectedInstance.modloader === 'neoforge') {
        // For Forge, don't filter by loader in search - shaders often don't specify loader
        // Filter only by version, then check compatibility in version selection
        delete filters.loaders;
      }
      // Vanilla doesn't support shaders by default
    }
    // Resource packs are loader-agnostic - they work on all loaders
    // Don't filter by loader, just by version
    else if (contentType === 'resourcepack') {
      // Resource packs work everywhere - no loader filter needed
      delete filters.loaders;
    }

    return filters;
  }, [selectedInstance, contentType]);

  const performSearch = useCallback(async (query: string, pageNum: number = 0) => {
    setLoading(true);
    try {
      const filters = getFilters();
      const result = await searchModrinth(query, contentType, pageNum, filters);
      setItems(prev => pageNum === 0 ? result.items : [...prev, ...result.items]);
      setTotal(result.total);
      setPage(pageNum);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [contentType, getFilters]);

  useEffect(() => {
    let mounted = true;
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = window.setTimeout(() => {
      if (mounted) performSearch(search, 0);
    }, 400);
    return () => {
      mounted = false;
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search, contentType, performSearch, selectedInstance]);

  useEffect(() => {
    const installedItems = localStorage.getItem('vortex_installed_content');
    if (installedItems) {
      setInstalled(new Set(JSON.parse(installedItems)));
    }
  }, []);

  // Load installed content for current instance
  useEffect(() => {
    let mounted = true;
    
    const loadInstalledContent = async () => {
      if (!selectedInstance || typeof window === 'undefined' || !window.electron) {
        if (mounted) setInstalledContent(new Set());
        return;
      }

      try {
        const electron = window.electron;
        if (!electron) return;
        const result = await electron.listInstalledContent(selectedInstance.id, contentType);
        if (mounted) {
          if (result.success && result.items) {
            const contentNames = new Set(result.items.map(item => item.name));
            setInstalledContent(contentNames);
          } else {
            setInstalledContent(new Set());
          }
        }
      } catch (error) {
        console.error('Failed to load installed content:', error);
        if (mounted) setInstalledContent(new Set());
      }
    };

    loadInstalledContent();
    return () => { mounted = false; };
  }, [selectedInstance, contentType]);

  const handleLoadMore = useCallback(() => {
    if (!loading && items.length < total) {
      performSearch(search, page + 1);
    }
  }, [loading, items.length, total, search, page, performSearch]);

  const handleInstallClick = useCallback(async (item: ContentItem) => {
    console.log('=== INSTALL CLICK START ===');
    console.log('Install clicked for:', item.name);
    console.log('selectedInstance:', selectedInstance);
    console.log('onInstall:', onInstall);
    console.log('installing state:', installing);
    
    setInstalling(item.id);
    console.log('Set installing to:', item.id);
    
    try {
      let latestVersion = null;
      
      // Try to use latest_version from search results first
      if (item.latestVersion) {
        console.log('Trying to fetch version by ID from search:', item.latestVersion);
        try {
          const response = await fetch(`${MODRINTH_API}/version/${item.latestVersion}`);
          console.log('Version by ID response status:', response.status);
          if (response.ok) {
            latestVersion = await response.json();
            console.log('Got version from search latest_version:', latestVersion);
          }
        } catch (e) {
          console.log('Failed to fetch version by ID, will try fallback:', e);
        }
      }
      
      // Fallback: fetch all versions from project
      if (!latestVersion) {
        console.log('Fallback: fetching all versions for project:', item.id);
        try {
          const versionsResponse = await fetch(`${MODRINTH_API}/project/${item.id}/version`);
          console.log('All versions response status:', versionsResponse.status);
          
          if (versionsResponse.ok) {
            const allVersions = await versionsResponse.json();
            console.log('All versions count:', allVersions?.length);
            
            if (allVersions && allVersions.length > 0) {
              latestVersion = allVersions[0]; // First one is usually latest
              console.log('Using first version from list:', latestVersion);
            }
          }
        } catch (e) {
          console.error('Fallback also failed:', e);
        }
      }
      
      if (!latestVersion) {
        console.error('Could not fetch any version for', item.name);
        alert('Failed to fetch version information. Please try again.');
        return;
      }
      
      console.log('Latest version files:', latestVersion.files);
      console.log('Version files count:', latestVersion.files?.length);
      
      if (!latestVersion.files || !Array.isArray(latestVersion.files) || latestVersion.files.length === 0) {
        console.error('No files found in version for', item.name);
        alert('No files found in version');
        return;
      }
      
      // Get dependencies
      console.log('Fetching dependencies...');
      const depIds = await getProjectDependencies(item.id);
      console.log('Dependencies:', depIds);
      
      if (onInstall) {
        console.log('Calling onInstall with:', { item, latestVersion, depIds });
        await onInstall(item, latestVersion, depIds);
        console.log('onInstall completed successfully');
        
        // Auto-install dependencies
        if (depIds && Array.isArray(depIds) && depIds.length > 0) {
          console.log('Auto-installing dependencies:', depIds);
          for (const depId of depIds) {
            try {
              console.log('Fetching dependency project:', depId);
              const depResponse = await fetch(`${MODRINTH_API}/project/${depId}`);
              if (!depResponse.ok) {
                console.error('Failed to fetch dependency project:', depId);
                continue;
              }
              const depProject = await depResponse.json();
              console.log('Dependency project:', depProject);
              
              let depVersion = null;
              
              // Try latest_version from dependency project
              if (depProject.latest_version) {
                try {
                  const depVerResponse = await fetch(`${MODRINTH_API}/version/${depProject.latest_version}`);
                  if (depVerResponse.ok) {
                    depVersion = await depVerResponse.json();
                  }
                } catch (e) {
                  console.log('Failed to fetch dep version by ID, trying fallback');
                }
              }
              
              // Fallback for dependency
              if (!depVersion) {
                try {
                  const depVersionsResponse = await fetch(`${MODRINTH_API}/project/${depId}/version`);
                  if (depVersionsResponse.ok) {
                    const depVersions = await depVersionsResponse.json();
                    if (depVersions && Array.isArray(depVersions) && depVersions.length > 0) {
                      depVersion = depVersions[0];
                    }
                  }
                } catch (e) {
                  console.error('Dependency version fallback failed:', e);
                }
              }
              
              if (depVersion && depVersion.files && Array.isArray(depVersion.files) && depVersion.files.length > 0) {
                console.log('Installing dependency:', depProject.title);
                await onInstall({ 
                  id: depId, 
                  name: depProject.title, 
                  projectType: item.projectType 
                } as ContentItem, depVersion, []);
              }
            } catch (depError) {
              console.error('Failed to install dependency:', depId, depError);
            }
          }
        }
      } else {
        console.error('onInstall callback not provided');
        alert('Install callback not available');
      }

      // Reload installed content to update downloaded status
      if (selectedInstance && typeof window !== 'undefined' && window.electron) {
        const electron = window.electron;
        if (!electron) return;
        const result = await electron.listInstalledContent(selectedInstance.id, contentType);
        if (result.success && result.items && Array.isArray(result.items)) {
          const contentNames = new Set(result.items.map((i: any) => i.name));
          setInstalledContent(contentNames);
        }
      }

    } catch (error) {
      console.error('Install failed:', error);
      alert('Install failed: ' + String(error));
    } finally {
      console.log('=== INSTALL CLICK END ===');
      setInstalling(null);
    }
  }, [onInstall, installed, selectedInstance, contentType, installing]);

  const contentTypes: { type: ContentType; label: string; icon: typeof Box }[] = [
    { type: 'mod', label: 'Mods', icon: Box },
    { type: 'shader', label: 'Shaders', icon: Palette },
    { type: 'resourcepack', label: 'Resource Packs', icon: Layers },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Content Browser</h2>
            <p className="text-gray-500 text-sm mt-1">
              {selectedInstance
                ? `Browsing for ${selectedInstance.name} (${selectedInstance.version}, ${selectedInstance.modloader})`
                : 'Search Modrinth for mods, shaders, and resource packs'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
            >
              <List size={20} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
            >
              <Grid3X3 size={20} />
            </button>
          </div>
        </div>

        {selectedInstance && (
          <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
            <Check size={18} className="text-emerald-400" />
            <div className="flex-1">
              <p className="text-emerald-400 font-medium text-sm">
                Filtered to: {selectedInstance.version}
                {selectedInstance.modloader !== 'vanilla' && ` + ${selectedInstance.modloader}`}
                {contentType === 'shader' && selectedInstance.modloader !== 'vanilla' && (
                  <span className="text-gray-400 font-normal ml-2">
                    (requires {selectedInstance.modloader === 'fabric' || selectedInstance.modloader === 'quilt' ? 'Iris' : 'Oculus'} mod)
                  </span>
                )}
              </p>
            </div>
            <p className="text-gray-500 text-sm">
              {total.toLocaleString()} results
            </p>
          </div>
        )}

        <div className="flex gap-3 mb-4">
          {contentTypes.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setContentType(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                contentType === type
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[#1e1e32] text-gray-400 hover:text-white border border-transparent hover:border-white/10'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${contentTypes.find(t => t.type === contentType)?.label.toLowerCase()}...`}
            className="w-full pl-10 pr-10 py-3 bg-[#1e1e32] text-white rounded-xl border border-transparent focus:border-emerald-500/50 outline-none transition-colors text-base"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {!selectedInstance && contentType === 'mod' && (
          <p className="text-amber-400/80 text-sm mt-3 flex items-center gap-2">
            <AlertCircle size={14} />
            Select an instance to filter by version and loader
          </p>
        )}

        {!loading && total > 0 && (
          <p className="text-gray-500 text-sm mt-4">
            {total.toLocaleString()} results
            {selectedInstance && installedContent.size > 0 && (
              <span className="text-emerald-400"> • {installedContent.size} installed</span>
            )}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={32} className="text-emerald-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16 px-6">
            <div className="w-20 h-20 rounded-2xl bg-[#1e1e32] flex items-center justify-center mb-4">
              {(() => {
                const Icon = contentTypes.find(t => t.type === contentType)?.icon || Box;
                return <Icon size={36} className="text-gray-500" />;
              })()}
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {search ? 'No results found' : `Search for ${contentTypes.find(t => t.type === contentType)?.label}`}
            </h3>
            <p className="text-gray-500">
              {search
                ? 'Try different keywords'
                : 'Type above to search Modrinth'}
            </p>
          </div>
        ) : (
          <div className="p-4">
            <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
              {items.map(item => (
                <div
                  key={item.id}
                  className="group p-4 bg-[#1e1e32] rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all duration-150"
                >
                  <div className="flex items-start gap-3">
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#12121f] flex items-center justify-center shrink-0">
                        {(() => {
                          const Icon = contentTypes.find(t => t.type === item.projectType)?.icon || Box;
                          return <Icon size={24} className="text-gray-500" />;
                        })()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold text-white group-hover:text-emerald-400 transition-colors truncate">
                            {item.name}
                          </h4>
                          <p className="text-gray-500 text-sm truncate">by {item.author}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (installedContent.has(item.name)) {
                              const confirmed = window.confirm(`Delete "${item.name}" from ${selectedInstance?.name || 'this instance'}?`);
                              if (confirmed && selectedInstance && window.electron) {
                                const folder = contentType === 'mod' ? 'mods' : contentType === 'shader' ? 'shaderpacks' : 'resourcepacks';
                                window.electron.deleteContent(`${selectedInstance.id}/${folder}/${item.name}.jar`).then(() => {
                                  setInstalledContent(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(item.name);
                                    return newSet;
                                  });
                                });
                              }
                            } else {
                              handleInstallClick(item);
                            }
                          }}
                          disabled={installing === item.id}
                          type="button"
                          className={`shrink-0 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                            installedContent.has(item.name)
                              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                              : 'bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white'
                          } ${installing === item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {installedContent.has(item.name) ? (
                            <>
                              <Trash2 size={14} />
                              Delete
                            </>
                          ) : installing === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <>
                              <Download size={14} />
                              Install
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-gray-400 text-sm mt-2 line-clamp-2">{item.description}</p>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {item.loaders.slice(0, 2).map(loader => (
                          <span
                            key={loader}
                            className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-md capitalize"
                          >
                            {loader}
                          </span>
                        ))}
                        {item.categories.slice(0, 2).map(cat => (
                          <span
                            key={cat}
                            className="px-2 py-0.5 bg-white/5 text-gray-400 text-xs rounded-md"
                          >
                            {categoryLabels[cat] || cat}
                          </span>
                        ))}
                        <div className="ml-auto flex items-center gap-1.5 text-gray-500 text-xs">
                          <DownloadCloud size={12} />
                          {formatDownloads(item.downloads)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {items.length < total && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-[#1e1e32] hover:bg-[#252542] text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                  Load More
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
});
