import { describe, it, expect } from 'vitest';
import { createLogger } from '../src/utils/logger.js';

describe('createLogger', () => {
  it('creates a logger with the given service name', () => {
    const logger = createLogger('test-service');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('creates loggers with different names independently', () => {
    const loggerA = createLogger('service-a');
    const loggerB = createLogger('service-b');
    expect(loggerA).not.toBe(loggerB);
  });

  it('logger has info method that can be called', () => {
    const logger = createLogger('smoke-test');
    // Should not throw
    expect(() => logger.info({ event: 'test' }, 'smoke test message')).not.toThrow();
  });

  it('logger has error method that can be called', () => {
    const logger = createLogger('smoke-test');
    expect(() => logger.error({ err: new Error('test') }, 'error message')).not.toThrow();
  });

  it('exported Logger type is compatible with pino logger', () => {
    const logger = createLogger('type-test');
    // Check that the child method exists (pino feature)
    expect(typeof logger.child).toBe('function');
  });
});
