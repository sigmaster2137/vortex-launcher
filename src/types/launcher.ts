export interface MinecraftAccount {
  id: string;
  username: string;
  uuid: string;
  avatar: string;
  type: 'offline' | 'microsoft';
  accessToken?: string;
}

export interface MinecraftInstance {
  id: string;
  name: string;
  version: string;
  modloader: 'vanilla' | 'fabric' | 'forge' | 'quilt';
  icon: string;
  lastPlayed: string;
  playTime: number;
}

export interface JavaRuntime {
  path: string;
  version: string;
  architecture: 'x64' | 'x86';
}

export interface LauncherSettings {
  javaPath: string;
  javaArgs: string;
  memory: number;
  width: number;
  height: number;
  fullscreen: boolean;
  background?: string;
}

export type ViewType = 'instances' | 'browse' | 'accounts' | 'settings';
