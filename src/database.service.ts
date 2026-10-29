import { HttpException, Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool | null;
  constructor() {
    this.pool = process.env.DATABASE_URL ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      query_timeout: 10000,
      statement_timeout: 10000,
      application_name: 'bookclub-level2',
    }) : null;
    this.pool?.on('error', () => undefined);
  }
  private unavailable() {
    return new ServiceUnavailableException({ message: '독서모임에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.pool) throw this.unavailable();
    try { return await this.pool.query<T>(sql, values); }
    catch { throw this.unavailable(); }
  }
  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw this.unavailable();
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof HttpException) throw error;
      throw this.unavailable();
    } finally { client?.release(); }
  }
  async onApplicationShutdown() { await this.pool?.end(); }
}
