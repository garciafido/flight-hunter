import type { PrismaClient } from '@flight-hunter/shared/db';

export class VpnRouter {
  private readonly rotationIndex = new Map<string, number>();

  constructor(private readonly prisma: PrismaClient) {}

  async getProxy(region: string): Promise<{
    id: string;
    type: string;
    host: string;
    port: number;
    auth: { user: string; password: string } | null;
  } | null> {
    const proxies = await this.prisma.proxy.findMany({
      where: { region, active: true },
    });

    if (proxies.length === 0) {
      return null;
    }

    const current = this.rotationIndex.get(region) ?? 0;
    const index = current % proxies.length;
    this.rotationIndex.set(region, index + 1);

    const proxy = proxies[index];
    const auth = proxy.auth as { user: string; password: string } | null;

    return {
      id: proxy.id,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      auth,
    };
  }

  async getProxyUrl(region: string): Promise<string | null> {
    const proxy = await this.getProxy(region);
    if (!proxy) return null;

    const { type, host, port, auth } = proxy;

    if (type === 'socks5') {
      if (auth) {
        return `socks5://${auth.user}:${auth.password}@${host}:${port}`;
      }
      return `socks5://${host}:${port}`;
    }

    if (type === 'http') {
      if (auth) {
        return `http://${auth.user}:${auth.password}@${host}:${port}`;
      }
      return `http://${host}:${port}`;
    }

    // wireguard, ssh-tunnel, or other — return without scheme auth
    return `${host}:${port}`;
  }
}
