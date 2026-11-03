"""Synthetic regressions for theme/print and filesystem trust boundaries."""
import contextlib
import io
import json
import shutil
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import safe_files
import theme_style
from runtime import require_python
from serve_maps import read_themes, theme_file
from pack import folder_theme

ROOT = Path(__file__).resolve().parent.parent


class StyleTests(unittest.TestCase):
    def test_shared_style_fixtures(self):
        fixtures = json.loads((ROOT / 'format/style-samples.json').read_text())
        for sample in fixtures['css']:
            problems = []
            actual = theme_style.write_css(theme_style.parse_css(sample['input'], lambda c, m: problems.append(c)))
            self.assertEqual(actual, sample['output'], sample['input'])
            self.assertEqual(sorted(set(problems)), sample['codes'], sample['input'])
        for text, expected in fixtures['colours']:
            self.assertEqual(bool(theme_style.is_colour(text)), expected, text)
        for text, expected in fixtures['shadows']:
            self.assertEqual(bool(theme_style.is_shadow(text)), expected, text)

    def test_relay_import_does_not_require_viewer_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('serve_maps.py', 'runtime.py', 'safe_files.py', 'safe_files_windows.py', 'theme_style.py'):
                shutil.copy(ROOT / 'relay-server' / name, Path(tmp) / name)
            result = subprocess.run([sys.executable, '-c', 'import serve_maps; print(serve_maps.VERSION)'], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_runtime_guard(self):
        for shape, prefix in [('status', 'STATUS=failed ERROR='), ('json', '{"error":')]:
            output = io.StringIO()
            with contextlib.redirect_stdout(output), self.assertRaises(SystemExit):
                require_python(shape, (3, 8))
            self.assertTrue(output.getvalue().startswith(prefix))
        require_python(version=(3, 9))


@unittest.skipUnless(safe_files.supported(), 'safe no-follow file operations unavailable')
class FileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.maps = self.base / 'maps'
        self.folder = self.maps / '.themes'
        self.folder.mkdir(parents=True)
        self.outside = self.base / 'outside.json'
        self.outside.write_text('{"secret":"outside marker"}')
        self.theme = {'name': 'Brand', 'appearances': {'light': {'bg': '#fff', 'ink': '#000', 'category': ['#000']}}}

    def write_theme(self, **extra):
        data = dict(self.theme, **extra)
        (self.folder / 'brand.json').write_text(json.dumps(data))

    def test_json_link_and_unknown_fields_never_escape(self):
        (self.folder / 'linked.json').symlink_to(self.outside)
        self.write_theme(secret='opaque marker', source={'secret': 'hidden marker'}, css='body{color:red}')
        got = read_themes(self.maps)
        text = json.dumps(got)
        for marker in ['outside marker', 'opaque marker', 'hidden marker']:
            self.assertNotIn(marker, text)
        self.assertEqual([t['id'] for t in got['themes']], ['brand'])
        self.assertTrue(got['problems'])

    def test_directory_link_including_back_inside_is_refused(self):
        self.folder.rmdir()
        real = self.maps / 'real'
        real.mkdir()
        (real / 'brand.json').write_text(json.dumps(self.theme))
        self.folder.symlink_to(real, target_is_directory=True)
        self.assertEqual(read_themes(self.maps)['themes'], [])
        self.assertIsNone(theme_file(self.maps, 'font.woff2'))

    def test_font_link_refused_in_reader_and_packer(self):
        (self.folder / 'font.woff2').symlink_to(self.outside)
        self.write_theme(font={'family': 'Brand', 'file': 'font.woff2'})
        self.assertIsNone(theme_file(self.maps, 'font.woff2'))
        theme, fonts = folder_theme(self.maps, 'brand')
        self.assertEqual(fonts, [])
        self.assertNotIn('outside marker', json.dumps(theme))
        # Safe ordinary fonts remain usable through both paths.
        (self.folder / 'font.woff2').unlink()
        (self.folder / 'font.woff2').write_bytes(b'font bytes')
        self.assertEqual(theme_file(self.maps, 'font.woff2'), b'font bytes')
        self.assertTrue(folder_theme(self.maps, 'brand')[1])

    def test_output_links_never_change_outside_files(self):
        for name in ['brand.json', 'font.woff2']:
            (self.folder / name).symlink_to(self.outside)
            with self.assertRaises(OSError):
                safe_files.write(self.maps, '.themes/' + name, b'replaced')
        self.assertEqual(self.outside.read_text(), '{"secret":"outside marker"}')
        safe_files.write(self.maps, '.themes/new.json', b'valid')
        self.assertEqual(safe_files.read(self.maps, '.themes/new.json'), b'valid')

    def test_generate_theme_refuses_json_and_font_destination_links(self):
        command = [sys.executable, str(ROOT / 'relay-server/themes.py'), 'derive', '--accent', '#0f766e', '--write', '--maps-dir', str(self.maps)]
        (self.folder / 'brand.json').symlink_to(self.outside)
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        (self.folder / 'brand.json').unlink()
        font = self.base / 'font.woff2'
        font.write_bytes(b'font input')
        (self.folder / 'font.woff2').symlink_to(self.outside)
        result = subprocess.run(command + ['--font', str(font)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(self.outside.read_text(), '{"secret":"outside marker"}')

    def test_static_final_index_and_direct_links_refused(self):
        assets = self.base / 'assets'
        (assets / 'page').mkdir(parents=True)
        (assets / 'page/index.html').symlink_to(self.outside)
        (assets / 'direct.html').symlink_to(self.outside)
        for path in ['page', 'page/index.html', 'direct.html']:
            with self.assertRaises(OSError):
                safe_files.asset(assets, path)
        (assets / 'page/index.html').unlink()
        (assets / 'page/index.html').write_bytes(b'<p>valid</p>')
        self.assertEqual(safe_files.asset(assets, 'page'), (b'<p>valid</p>', '.html'))

    @unittest.skipIf(os.name == 'nt', 'POSIX syscall race; native handle races tested separately')
    def test_swap_directory_before_open_cannot_redirect_read_or_write(self):
        outside_dir = self.base / 'outside'
        outside_dir.mkdir()
        (outside_dir / 'brand.json').write_bytes(b'protected')
        real_open = os.open
        for action in ['read', 'write']:
            moved = self.maps / 'old-themes'
            def swap(name, flags, *args, **kwargs):
                if name == '.themes' and not moved.exists():
                    self.folder.rename(moved)
                    self.folder.symlink_to(outside_dir, target_is_directory=True)
                return real_open(name, flags, *args, **kwargs)
            with patch.object(os, 'open', swap), self.assertRaises(OSError):
                if action == 'read':
                    safe_files.read(self.maps, '.themes/brand.json')
                else:
                    safe_files.write(self.maps, '.themes/brand.json', b'changed')
            self.folder.unlink()
            moved.rename(self.folder)
        self.assertEqual((outside_dir / 'brand.json').read_bytes(), b'protected')

    @unittest.skipIf(os.name == 'nt', 'POSIX syscall race; native handle races tested separately')
    def test_swap_final_destination_before_replace_cannot_follow_it(self):
        target = self.folder / 'brand.json'
        target.write_bytes(b'old')
        replace = os.replace
        def swap(src, dst, **kwargs):
            target.unlink()
            target.symlink_to(self.outside)
            return replace(src, dst, **kwargs)
        with patch.object(os, 'replace', swap):
            safe_files.write(self.maps, '.themes/brand.json', b'new')
        self.assertFalse(target.is_symlink())
        self.assertEqual(target.read_bytes(), b'new')
        self.assertEqual(self.outside.read_text(), '{"secret":"outside marker"}')

    def test_selected_root_may_be_a_link(self):
        link = self.base / 'chosen'
        link.symlink_to(self.maps, target_is_directory=True)
        self.write_theme()
        self.assertEqual(len(read_themes(link.resolve())['themes']), 1)


@unittest.skipUnless(os.name == 'nt', 'Windows native-handle regressions')
class WindowsFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.maps = self.base / 'maps'
        self.folder = self.maps / '.themes'
        self.folder.mkdir(parents=True)
        self.outside = self.base / 'outside'
        self.outside.mkdir()
        (self.outside / 'brand.json').write_bytes(b'protected outside bytes')

    def junction(self, link, target):
        result = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_native_read_list_and_atomic_replace_without_posix_primitives(self):
        self.assertTrue(safe_files.supported())
        self.assertIsNotNone(safe_files._windows)
        safe_files.write(self.maps, '.themes/brand.json', b'first')
        safe_files.write(self.maps, '.themes/brand.json', b'second')
        self.assertEqual(safe_files.read(self.maps, '.themes/brand.json'), b'second')
        with safe_files.directory(self.maps, ('.themes',)) as parent:
            self.assertEqual(safe_files.listdir(parent), ['brand.json'])
        data = b'01234567' * 150000
        safe_files.write(self.maps, '.themes/Unicode-\u96ea.woff2', data)
        self.assertEqual(safe_files.read(self.maps, '.themes/Unicode-\u96ea.woff2'), data)
        self.assertEqual(sorted(p.name for p in self.folder.iterdir()), ['Unicode-\u96ea.woff2', 'brand.json'])

    def test_junctions_back_inside_and_outside_are_refused(self):
        self.folder.rmdir()
        inside = self.maps / 'actual'
        inside.mkdir()
        for target in (inside, self.outside):
            self.junction(self.folder, target)
            try:
                with self.assertRaises(OSError):
                    safe_files.read(self.maps, '.themes/brand.json')
                with self.assertRaises(OSError):
                    safe_files.write(self.maps, '.themes/brand.json', b'changed')
                self.assertEqual(read_themes(self.maps)['themes'], [])
            finally:
                os.rmdir(self.folder)
        self.assertEqual((self.outside / 'brand.json').read_bytes(), b'protected outside bytes')

    def test_junction_swap_before_open_does_not_redirect(self):
        native = safe_files._windows
        real_open = native._open
        moved = self.maps / 'original'
        def swap(parent, name, *args, **kwargs):
            if name == '.themes' and not moved.exists():
                self.folder.rename(moved)
                self.junction(self.folder, self.outside)
            return real_open(parent, name, *args, **kwargs)
        try:
            with patch.object(native, '_open', swap), self.assertRaises(OSError):
                safe_files.write(self.maps, '.themes/brand.json', b'changed')
        finally:
            if moved.exists():
                os.rmdir(self.folder)
                moved.rename(self.folder)
        self.assertEqual((self.outside / 'brand.json').read_bytes(), b'protected outside bytes')

    def test_held_directory_cannot_be_replaced(self):
        (self.folder / 'brand.json').write_bytes(b'original')
        with safe_files.directory(self.maps, ('.themes',)) as parent:
            with self.assertRaises(OSError):
                self.folder.rename(self.maps / 'moved')
            self.assertEqual(safe_files.read_at(parent, 'brand.json'), b'original')

    def test_final_link_swap_cannot_redirect_atomic_replace(self):
        native = safe_files._windows
        target = self.folder / 'brand.json'
        target.write_bytes(b'old')
        replace = native._replace
        def swap(handle, parent, name):
            target.unlink()
            target.symlink_to(self.outside / 'brand.json')
            return replace(handle, parent, name)
        with patch.object(native, '_replace', swap):
            try:
                safe_files.write(self.maps, '.themes/brand.json', b'new')
            except OSError:
                pass
        self.assertEqual((self.outside / 'brand.json').read_bytes(), b'protected outside bytes')
        self.assertFalse(any(p.name.startswith('.write-') for p in self.folder.iterdir()))
        if not target.is_symlink():
            self.assertEqual(target.read_bytes(), b'new')

    def test_streams_and_device_aliases_are_not_file_names(self):
        for name in ('brand.json:stream', 'NUL', 'CON.txt', 'COM1', 'space. ', 'space.'):
            with self.assertRaises(OSError):
                safe_files.write(self.maps, '.themes/' + name, b'no')

    def test_windows_abi_layout(self):
        native = safe_files._windows
        self.assertEqual(native.DirectoryInfo.Name.offset, 68)
        self.assertEqual(native.RenameInfo.Name.offset, 20 if native.C.sizeof(native.W.HANDLE) == 8 else 12)


class HTTPBoundaryTests(unittest.TestCase):
    def test_static_roots_apply_the_same_final_file_policy(self):
        from test_server import Running
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            maps = base / 'maps'; maps.mkdir()
            atlas = base / 'atlas'; viewer = base / 'viewer'
            outside = base / 'outside.html'; outside.write_bytes(b'outside marker')
            for root in (atlas, viewer):
                (root / 'bad').mkdir(parents=True)
                (root / 'good').mkdir()
                (root / 'bad/index.html').symlink_to(outside)
                (root / 'direct.html').symlink_to(outside)
                (root / 'good/index.html').write_bytes(b'normal index')
            server = Running(maps_dir=maps, atlas_dir=atlas, viewer_dir=viewer)
            try:
                for prefix in ('/', '/map-viewer/'):
                    for name in ('bad', 'bad/', 'bad/index.html', 'bad%2Findex.html', 'direct.html'):
                        self.assertEqual(server.request('GET', prefix + name)[0], 404, prefix + name)
                    for name in ('good', 'good/', 'good/index.html'):
                        status, _, body = server.request('GET', prefix + name)
                        self.assertEqual((status, body), (200, b'normal index'))
            finally:
                server.stop()

    def test_theme_api_never_returns_linked_json_or_font_bytes(self):
        from test_server import Running
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            maps = base / 'maps'; (maps / '.themes').mkdir(parents=True)
            outside = base / 'outside.json'; outside.write_bytes(b'{"secret":"outside marker"}')
            (maps / '.themes/leak.json').symlink_to(outside)
            (maps / '.themes/leak.woff2').symlink_to(outside)
            server = Running(maps_dir=maps)
            try:
                status, body = server.json('GET', '/api/themes')
                self.assertEqual(status, 200)
                self.assertTrue(body['problems'])
                self.assertNotIn('outside marker', json.dumps(body))
                self.assertEqual(server.request('GET', '/api/theme-file?f=leak.woff2')[0], 404)
            finally:
                server.stop()


if __name__ == '__main__':
    unittest.main(verbosity=2)
