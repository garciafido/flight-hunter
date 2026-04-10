export type ProxyType = 'wireguard' | 'socks5' | 'http' | 'ssh-tunnel';

export interface ProxyAuth {
  user: string;
  password: string;
}

export interface ProxyConfig {
  id: string;
  type: ProxyType;
  label: string;
  region: string;
  host: string;
  port: number;
  auth?: ProxyAuth;
  sshKey?: string;
  active: boolean;
}
