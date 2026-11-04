"""Browser profile cleanup must wait for Windows handles without hiding failures."""
import errno
import os
import socket
import functools
import http.client
import tempfile
from pathlib import Path
import unittest
import threading
from unittest.mock import patch

import browser_connection as connection


class ProfileTests(unittest.TestCase):
    def test_profile_is_removed_on_success(self):
        with connection.browser_profile() as profile:
            path = Path(profile)
            (path / 'cache').write_text('cache', encoding='utf-8')
        self.assertFalse(path.exists())

    def test_profile_is_removed_when_test_raises(self):
        with self.assertRaisesRegex(RuntimeError, 'test failed'):
            with connection.browser_profile() as profile:
                path = Path(profile)
                raise RuntimeError('test failed')
        self.assertFalse(path.exists())

    def test_windows_sharing_violation_waits_then_removes_profile(self):
        remove = connection.shutil.rmtree
        locked = PermissionError(errno.EACCES, 'still in use')
        locked.winerror = 32
        with patch.object(connection.shutil, 'rmtree', side_effect=[locked, locked, None]) as cleanup, \
             patch.object(connection.time, 'sleep') as sleep:
            with connection.browser_profile() as profile:
                path = Path(profile)
            self.assertEqual(cleanup.call_count, 3)
            self.assertEqual(sleep.call_count, 2)
        remove(path)

    @unittest.skipUnless(os.name == 'nt', 'Windows file sharing semantics')
    def test_native_windows_file_handle_is_released_before_cleanup(self):
        handle = None
        timer = None
        try:
            with connection.browser_profile() as profile:
                path = Path(profile)
                handle = (path / 'cache').open('wb')
                handle.write(b'cache')
                handle.flush()
                timer = threading.Timer(.3, handle.close)
                timer.start()
            self.assertFalse(path.exists())
        finally:
            if timer:
                timer.join()
            if handle:
                handle.close()

    def test_persistent_lock_is_reported(self):
        remove = connection.shutil.rmtree
        locked = PermissionError(errno.EACCES, 'still in use')
        locked.winerror = 32
        with patch.object(connection.shutil, 'rmtree', side_effect=locked) as cleanup, \
             patch.object(connection.time, 'sleep'), \
             patch.object(connection.time, 'monotonic', side_effect=[0, 1, 11]):
            with self.assertRaises(PermissionError):
                with connection.browser_profile() as profile:
                    path = Path(profile)
            self.assertEqual(cleanup.call_count, 2)
        remove(path)

    def test_other_io_errors_are_not_retried(self):
        remove = connection.shutil.rmtree
        with patch.object(connection.shutil, 'rmtree', side_effect=OSError(errno.EIO, 'disk failure')) as cleanup, \
             patch.object(connection.time, 'sleep') as sleep:
            with self.assertRaises(OSError):
                with connection.browser_profile() as profile:
                    path = Path(profile)
            self.assertEqual(cleanup.call_count, 1)
            sleep.assert_not_called()
        remove(path)


class ServerTests(unittest.TestCase):
    def test_server_accepts_a_burst_of_asset_connections(self):
        from browser_tests import Quiet, BrowserServer
        # Queue connections before the accept loop runs, as happens while a
        # busy runner schedules the server thread during a browser asset burst.
        server = BrowserServer(('127.0.0.1', 0), Quiet)
        clients = []
        try:
            for _ in range(8):
                clients.append(socket.create_connection(('127.0.0.1', server.server_port), timeout=1))
            self.assertEqual(len(clients), 8)
        finally:
            for client in clients:
                client.close()
            server.server_close()

    def test_static_files_reuse_one_connection(self):
        # An HTTP/1.0 response closes every connection. Across the full export
        # suite that creates thousands of short-lived Windows sockets.
        from browser_tests import Quiet, BrowserServer
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / 'asset.txt').write_text('asset', encoding='utf-8')
            server = BrowserServer(('127.0.0.1', 0), functools.partial(Quiet, directory=folder))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            client = http.client.HTTPConnection('127.0.0.1', server.server_port)
            try:
                client.request('GET', '/asset.txt')
                response = client.getresponse()
                self.assertEqual(response.read(), b'asset')
                self.assertFalse(response.will_close)
                transport = client.sock
                self.assertIsNotNone(transport)
                client.request('GET', '/asset.txt')
                self.assertEqual(client.getresponse().read(), b'asset')
                self.assertIs(client.sock, transport)
            finally:
                client.close()
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main(verbosity=2)
