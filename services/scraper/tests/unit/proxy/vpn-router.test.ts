import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VpnRouter } from '../../../src/proxy/vpn-router.js';

const makeProxy = (overrides: Partial<{
  id: string;
  type: string;
  region: string;
  host: string;
  port: number;
  auth: unknown;
  active: boolean;
  label: string;
  lastCheck: Date | null;
  lastStatus: string | null;
}> = {}) => ({
  id: 'proxy-1',
  type: 'socks5',
  region: 'CL',
  host: '127.0.0.1',
  port: 1080,
  auth: null,
  active: true,
  label: 'test',
  lastCheck: null,
  lastStatus: null,
  ...overrides,
});

const makePrisma = (proxies: ReturnType<typeof makeProxy>[]) => ({
  proxy: {
    findMany: vi.fn().mockResolvedValue(proxies),
  },
});

describe('VpnRouter', () => {
  describe('getProxy', () => {
    it('returns null when no active proxies exist', async () => {
      const prisma = makePrisma([]);
      const router = new VpnRouter(prisma as never);
      const result = await router.getProxy('CL');
      expect(result).toBeNull();
    });

    it('returns a proxy when one is available', async () => {
      const proxy = makeProxy();
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const result = await router.getProxy('CL');
      expect(result).not.toBeNull();
      expect(result?.host).toBe('127.0.0.1');
      expect(result?.port).toBe(1080);
    });

    it('rotates through multiple proxies', async () => {
      const p1 = makeProxy({ id: 'p1', host: '10.0.0.1' });
      const p2 = makeProxy({ id: 'p2', host: '10.0.0.2' });
      const prisma = makePrisma([p1, p2]);
      const router = new VpnRouter(prisma as never);

      const first = await router.getProxy('CL');
      const second = await router.getProxy('CL');
      expect(first?.host).toBe('10.0.0.1');
      expect(second?.host).toBe('10.0.0.2');
    });

    it('wraps rotation index back to 0 after all proxies used', async () => {
      const p1 = makeProxy({ id: 'p1', host: '10.0.0.1' });
      const p2 = makeProxy({ id: 'p2', host: '10.0.0.2' });
      const prisma = makePrisma([p1, p2]);
      const router = new VpnRouter(prisma as never);

      await router.getProxy('CL'); // index 0 → p1
      await router.getProxy('CL'); // index 1 → p2
      const third = await router.getProxy('CL'); // index 2 % 2 = 0 → p1
      expect(third?.host).toBe('10.0.0.1');
    });

    it('maintains separate rotation indices per region', async () => {
      const clProxy = makeProxy({ id: 'cl', host: 'cl-host', region: 'CL' });
      const arProxy = makeProxy({ id: 'ar', host: 'ar-host', region: 'AR' });
      const prisma = {
        proxy: {
          findMany: vi.fn().mockImplementation(({ where }: { where: { region: string } }) => {
            if (where.region === 'CL') return Promise.resolve([clProxy]);
            if (where.region === 'AR') return Promise.resolve([arProxy]);
            return Promise.resolve([]);
          }),
        },
      };
      const router = new VpnRouter(prisma as never);
      const cl = await router.getProxy('CL');
      const ar = await router.getProxy('AR');
      expect(cl?.host).toBe('cl-host');
      expect(ar?.host).toBe('ar-host');
    });

    it('returns auth when proxy has auth', async () => {
      const proxy = makeProxy({ auth: { user: 'u', password: 'p' } });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const result = await router.getProxy('CL');
      expect(result?.auth).toEqual({ user: 'u', password: 'p' });
    });
  });

  describe('getProxyUrl', () => {
    it('returns null when no proxy is available', async () => {
      const prisma = makePrisma([]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBeNull();
    });

    it('returns socks5 URL without auth', async () => {
      const proxy = makeProxy({ type: 'socks5', host: '127.0.0.1', port: 1080, auth: null });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBe('socks5://127.0.0.1:1080');
    });

    it('returns socks5 URL with auth', async () => {
      const proxy = makeProxy({
        type: 'socks5',
        host: '127.0.0.1',
        port: 1080,
        auth: { user: 'user', password: 'pass' },
      });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBe('socks5://user:pass@127.0.0.1:1080');
    });

    it('returns http URL without auth', async () => {
      const proxy = makeProxy({ type: 'http', host: '10.0.0.1', port: 8080, auth: null });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBe('http://10.0.0.1:8080');
    });

    it('returns http URL with auth', async () => {
      const proxy = makeProxy({
        type: 'http',
        host: '10.0.0.1',
        port: 8080,
        auth: { user: 'u', password: 'p' },
      });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBe('http://u:p@10.0.0.1:8080');
    });

    it('returns host:port for wireguard type', async () => {
      const proxy = makeProxy({ type: 'wireguard', host: 'wg.example.com', port: 51820, auth: null });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBe('wg.example.com:51820');
    });

    it('returns host:port for ssh-tunnel type', async () => {
      const proxy = makeProxy({ type: 'ssh-tunnel', host: 'ssh.example.com', port: 22, auth: null });
      const prisma = makePrisma([proxy]);
      const router = new VpnRouter(prisma as never);
      const url = await router.getProxyUrl('CL');
      expect(url).toBe('ssh.example.com:22');
    });
  });
});
