"""Protect production boundaries without contacting a database."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / 'scripts' / 'rehearse-live-database.py'
spec = importlib.util.spec_from_file_location('database_rehearsal', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RehearsalGuards(unittest.TestCase):
    def setUp(self):
        self.environment = {
            'SOURCE_DATABASE_URL': 'postgresql://user:password@source.example/neondb',
            'REHEARSAL_ADMIN_DATABASE_URL': 'postgresql://user:password@rehearsal.example/neondb',
            'REHEARSAL_EXPECTED_HOST': 'rehearsal.example',
        }

    def reject_before_query(self, changes):
        with patch.dict(os.environ, {**self.environment, **changes}, clear=True), patch.object(module, 'query') as query:
            with self.assertRaises(ValueError):
                module.main()
            query.assert_not_called()

    def test_source_and_destination_cannot_share_a_host(self):
        self.reject_before_query({'REHEARSAL_ADMIN_DATABASE_URL': self.environment['SOURCE_DATABASE_URL'],
                                  'REHEARSAL_EXPECTED_HOST': 'source.example'})

    def test_destination_must_match_the_explicit_pin(self):
        self.reject_before_query({'REHEARSAL_EXPECTED_HOST': 'different.example'})

    def test_production_database_names_are_rejected(self):
        self.reject_before_query({'REHEARSAL_DATABASE_NAME': 'neondb'})

    def test_existing_database_is_never_overwritten(self):
        with patch.dict(os.environ, self.environment, clear=True), patch.object(module, 'query', return_value='1') as query, patch.object(module, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'already exists'):
                module.main()
            self.assertEqual(query.call_count, 1)
            self.assertTrue(query.call_args.args[1].startswith('SELECT'))
            run.assert_not_called()

    def test_source_read_only_is_verified_before_creating_a_database(self):
        with patch.dict(os.environ, self.environment, clear=True), patch.object(module, 'query', side_effect=['0', 'off']) as query:
            with self.assertRaisesRegex(ValueError, 'read-only'):
                module.main()
            self.assertTrue(all(call.args[1].startswith(('SELECT', 'SHOW')) for call in query.call_args_list))

    def test_source_connections_force_read_only_and_direct_tls(self):
        host, environment = module.connection('postgresql://user:password@ep-example-pooler.neon.tech/neondb', True)
        self.assertEqual(host, 'ep-example.neon.tech')
        self.assertEqual(environment['PGOPTIONS'], '-c default_transaction_read_only=on')
        self.assertEqual(environment['PGSSLMODE'], 'require')


if __name__ == '__main__':
    unittest.main()
