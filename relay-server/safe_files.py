"""Descriptor-relative reads and atomic writes. Roots are caller-selected authorities.

No symlink components below a root, including links back inside it. POSIX uses
no-follow directory descriptors; Windows uses native relative handles via ctypes. An account able
to rename an already-open directory can move that directory; this is not OS confinement.
"""
import contextlib
import os
import secrets
import stat
from pathlib import Path


if os.name == 'nt':
    import safe_files_windows as _windows
else:
    _windows = None


_SUPPORTED = (os.open in os.supports_dir_fd and hasattr(os, 'O_NOFOLLOW')
              and hasattr(os, 'O_DIRECTORY'))


def supported():
    return _windows is not None or _SUPPORTED


def parts_of(relative):
    text = str(relative)
    parts = text.split('/')
    if not text or any(p in ('', '.', '..') or '\\' in p or '\x00' in p for p in parts):
        raise OSError('unsafe relative file path')
    return parts


@contextlib.contextmanager
def directory(root, parts=(), create=False):
    if _windows is not None:
        with _windows.directory(root, parts, create) as handle:
            yield handle
        return
    if not supported():
        raise OSError('safe file access is unavailable on this operating system')
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    root = Path(root)
    if not root.is_absolute():
        raise OSError('safe file root must be an absolute, pre-resolved path')
    fd = os.open(root.anchor, flags)
    try:
        # The caller resolves its chosen root once; do not resolve it again after
        # an attacker could have replaced a component. Open every ancestor no-follow.
        for part in root.parts[1:]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        for part in parts:
            parts_of(part)
            if create:
                try:
                    os.mkdir(part, mode=0o700, dir_fd=fd)
                except FileExistsError:
                    pass
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        yield fd
    finally:
        os.close(fd)


def listdir(directory):
    return _windows.listdir(directory) if _windows is not None else os.listdir(directory)


def read_at(fd, name):
    if len(parts_of(name)) != 1:
        raise OSError('expected one filename')
    if _windows is not None:
        return _windows.read_at(fd, name)
    file_fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | getattr(os, 'O_NONBLOCK', 0), dir_fd=fd)
    try:
        if not stat.S_ISREG(os.fstat(file_fd).st_mode):
            raise OSError('not a regular file')
        with os.fdopen(file_fd, 'rb', closefd=False) as stream:
            return stream.read()
    finally:
        os.close(file_fd)


def read(root, relative):
    parts = parts_of(relative)
    with directory(root, parts[:-1]) as fd:
        return read_at(fd, parts[-1])


def asset(root, relative):
    """Return (bytes, final suffix), including directory indexes through the same fd."""
    parts = parts_of(relative)
    with directory(root, parts[:-1]) as parent:
        if _windows is not None:
            return _windows.asset(parent, parts[-1])
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | getattr(os, 'O_NONBLOCK', 0), dir_fd=parent)
        try:
            mode = os.fstat(fd).st_mode
            if stat.S_ISDIR(mode):
                return read_at(fd, 'index.html'), '.html'
            if not stat.S_ISREG(mode):
                raise OSError('not a regular asset')
            with os.fdopen(fd, 'rb', closefd=False) as stream:
                return stream.read(), Path(parts[-1]).suffix.lower()
        finally:
            os.close(fd)


def write(root, relative, data):
    """Replace a regular file atomically; never follow destination or temp symlinks."""
    parts = parts_of(relative)
    with directory(root, parts[:-1], create=True) as fd:
        if _windows is not None:
            return _windows.write(fd, parts[-1], data)
        try:
            mode = os.stat(parts[-1], dir_fd=fd, follow_symlinks=False).st_mode
            if not stat.S_ISREG(mode):
                raise OSError('destination must be a regular file, not a symlink')
        except FileNotFoundError:
            pass
        temp = '.write-' + secrets.token_hex(16)
        out = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        try:
            with os.fdopen(out, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, parts[-1], src_dir_fd=fd, dst_dir_fd=fd)
        finally:
            try:
                os.unlink(temp, dir_fd=fd)
            except FileNotFoundError:
                pass
