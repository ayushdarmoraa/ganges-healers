#!/usr/bin/env python3
"""Copy a read-only source into a NEW database on an explicitly pinned rehearsal host.

Requires PostgreSQL client tools and SOURCE_DATABASE_URL,
REHEARSAL_ADMIN_DATABASE_URL, REHEARSAL_EXPECTED_HOST. Never resets, cleans,
overwrites or migrates either source or destination. Dumps contain private data;
run in a private ephemeral workspace and retain only the aggregate report.
"""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlparse


def connection(value, readonly, database=None):
    parsed = urlparse(value)
    if parsed.scheme not in ('postgres', 'postgresql') or not parsed.hostname:
        raise ValueError('A PostgreSQL connection is required')
    host = parsed.hostname.replace('-pooler.', '.')
    environment = {**os.environ, 'PGHOST': host, 'PGPORT': str(parsed.port or 5432),
                   'PGUSER': unquote(parsed.username or ''), 'PGPASSWORD': unquote(parsed.password or ''),
                   'PGDATABASE': database or parsed.path.lstrip('/'), 'PGSSLMODE': 'require',
                   'PGCONNECT_TIMEOUT': '15',
                   'PGOPTIONS': '-c default_transaction_read_only=' + ('on' if readonly else 'off')}
    return host, environment


def run(arguments, environment):
    result = subprocess.run(arguments, env=environment, capture_output=True, text=True, timeout=180)
    if result.returncode:
        # Database tools may include row values in errors. Keep raw diagnostics private.
        raise RuntimeError(arguments[0] + ' failed; no credentials or database rows were logged')
    return result.stdout.strip()


def query(environment, sql):
    return run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], environment)


def fingerprint(environment):
    tables = json.loads(query(environment, "SELECT coalesce(json_agg(tablename ORDER BY tablename), '[]') FROM pg_tables WHERE schemaname='public'"))
    if not tables:
        return {}
    statements = []
    for table in tables:
        quoted = '"' + table.replace('"', '""') + '"'
        literal = "'" + table.replace("'", "''") + "'"
        statements.append('SELECT ' + literal + ' AS table_name, count(*) AS row_count, '
                          'md5(coalesce(string_agg(h, \'\' ORDER BY h), \'\')) AS digest FROM '
                          '(SELECT md5(row_to_json(t)::text) AS h FROM public.' + quoted + ' t) rows')
    # One snapshot and one connection for all tables, including the password hashes.
    rows = json.loads(query(environment, 'SELECT json_agg(r ORDER BY table_name) FROM (' + ' UNION ALL '.join(statements) + ') r'))
    return {row['table_name']: (row['row_count'], row['digest']) for row in rows}


def main():
    source_host, source = connection(os.environ['SOURCE_DATABASE_URL'], True)
    target_host, admin = connection(os.environ['REHEARSAL_ADMIN_DATABASE_URL'], False)
    name = os.environ.get('REHEARSAL_DATABASE_NAME', 'ganges_live_rehearsal_20261104')
    if target_host != os.environ['REHEARSAL_EXPECTED_HOST'] or source_host == target_host:
        raise ValueError('Rehearsal host must be explicitly pinned and different from source')
    if not re.fullmatch(r'ganges_live_rehearsal_[0-9]{8}(?:_[a-z0-9]+)?', name):
        raise ValueError('Only an explicitly named rehearsal database can be created')
    if query(admin, "SELECT count(*) FROM pg_database WHERE datname='" + name + "'") != '0':
        raise ValueError('Destination already exists; refusing to overwrite it')
    if query(source, "SHOW transaction_read_only") != 'on':
        raise ValueError('Source must remain read-only')
    before = fingerprint(source)
    query(admin, 'CREATE DATABASE "' + name + '"')
    _, destination = connection(os.environ['REHEARSAL_ADMIN_DATABASE_URL'], False, name)
    if fingerprint(destination):
        raise ValueError('Destination is not empty')
    with tempfile.TemporaryDirectory(prefix='ganges-private-db-') as directory:
        os.chmod(directory, 0o700)
        archive = Path(directory) / 'snapshot.dump'
        run(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', str(archive)], source)
        os.chmod(archive, 0o600)
        run(['pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '--dbname', name, str(archive)], destination)
    after = fingerprint(destination)
    if before != after or before != fingerprint(source):
        raise ValueError('Fingerprint mismatch or concurrent source changes; do not cut over')
    print(json.dumps({'verified': True, 'database': name, 'tables': len(before),
                      'rows': {table: value[0] for table, value in before.items()},
                      'source_read_only': True, 'production_changed': False}, sort_keys=True))


if __name__ == '__main__':
    main()
