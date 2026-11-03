"""Windows handle-relative file I/O (ctypes only, Python 3.9+).

NtCreateFile opens single names relative to held directories. Reparse processing
is disabled, and every opened object is checked for reparse attributes. Directory
listing, data access, rename and cleanup use handles, never reconstructed paths.
See docs/security.md for the Windows API references and remaining account boundary.
"""
import contextlib
import ctypes as C
from ctypes import wintypes as W
from pathlib import Path
import re
import secrets

NTSTATUS = C.c_long
ULONG_PTR = C.c_size_t
SYNCHRONIZE = 0x100000
DELETE = 0x10000
READ_ATTRIBUTES = 0x80
TRAVERSE = 0x20
DIRECTORY = 0x10
REPARSE = 0x400
FILE_OPEN = 1
FILE_CREATE = 2
FILE_OPEN_IF = 3
SYNC_IO = 0x20
OPEN_REPARSE = 0x200000


class UnicodeString(C.Structure):
    _fields_ = [('Length', W.USHORT), ('MaximumLength', W.USHORT), ('Buffer', C.c_void_p)]


class ObjectAttributes(C.Structure):
    _fields_ = [('Length', W.ULONG), ('RootDirectory', W.HANDLE),
                ('ObjectName', C.POINTER(UnicodeString)), ('Attributes', W.ULONG),
                ('SecurityDescriptor', C.c_void_p), ('SecurityQualityOfService', C.c_void_p)]


class IOStatus(C.Structure):
    # NTSTATUS / PVOID union occupies one pointer-sized slot.
    _fields_ = [('Status', C.c_void_p), ('Information', ULONG_PTR)]


class FileInfo(C.Structure):
    _fields_ = [('Attributes', W.DWORD), ('Creation', W.FILETIME),
                ('Access', W.FILETIME), ('Write', W.FILETIME),
                ('Volume', W.DWORD), ('SizeHigh', W.DWORD), ('SizeLow', W.DWORD),
                ('Links', W.DWORD), ('IndexHigh', W.DWORD), ('IndexLow', W.DWORD)]


class DirectoryInfo(C.Structure):
    _fields_ = [('Next', W.DWORD), ('Index', W.DWORD),
                ('Creation', C.c_longlong), ('Access', C.c_longlong),
                ('Write', C.c_longlong), ('Change', C.c_longlong),
                ('End', C.c_longlong), ('Allocation', C.c_longlong),
                ('Attributes', W.DWORD), ('NameLength', W.DWORD),
                ('EaSize', W.DWORD), ('Name', W.WCHAR * 1)]


class RenameInfo(C.Structure):
    _fields_ = [('Replace', C.c_ubyte), ('RootDirectory', W.HANDLE),
                ('NameLength', W.ULONG), ('Name', W.WCHAR * 1)]


kernel = C.WinDLL('kernel32', use_last_error=True)
ntdll = C.WinDLL('ntdll')
ntdll.NtCreateFile.argtypes = [C.POINTER(W.HANDLE), W.ULONG, C.POINTER(ObjectAttributes),
    C.POINTER(IOStatus), C.c_void_p, W.ULONG, W.ULONG, W.ULONG, W.ULONG, C.c_void_p, W.ULONG]
ntdll.NtCreateFile.restype = NTSTATUS
ntdll.NtSetInformationFile.argtypes = [W.HANDLE, C.POINTER(IOStatus), C.c_void_p, W.ULONG, W.ULONG]
ntdll.NtSetInformationFile.restype = NTSTATUS
ntdll.RtlNtStatusToDosError.argtypes = [NTSTATUS]
ntdll.RtlNtStatusToDosError.restype = W.ULONG
kernel.CloseHandle.argtypes = [W.HANDLE]
kernel.CloseHandle.restype = W.BOOL
kernel.GetFileInformationByHandle.argtypes = [W.HANDLE, C.POINTER(FileInfo)]
kernel.GetFileInformationByHandle.restype = W.BOOL
kernel.GetFileInformationByHandleEx.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD]
kernel.GetFileInformationByHandleEx.restype = W.BOOL
kernel.GetFileType.argtypes = [W.HANDLE]
kernel.GetFileType.restype = W.DWORD
kernel.ReadFile.argtypes = [W.HANDLE, C.c_void_p, W.DWORD, C.POINTER(W.DWORD), C.c_void_p]
kernel.ReadFile.restype = W.BOOL
kernel.WriteFile.argtypes = kernel.ReadFile.argtypes
kernel.WriteFile.restype = W.BOOL
kernel.FlushFileBuffers.argtypes = [W.HANDLE]
kernel.FlushFileBuffers.restype = W.BOOL


def _check(status):
    if status < 0:
        raise C.WinError(ntdll.RtlNtStatusToDosError(status))


def _leaf(name):
    # Single NT names only; reject DOS aliases, streams and Win32-normalized names.
    if (not isinstance(name, str) or not name or name in ('.', '..')
            or any(c in name for c in '\\/:\x00*?"<>|') or name[-1] in ' .'
            or re.fullmatch(r'(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', name, re.I)):
        raise OSError('unsafe Windows filename')
    return name


class Handle:
    def __init__(self, value):
        self.value = value
        try:
            info = FileInfo()
            if not kernel.GetFileInformationByHandle(value, C.byref(info)):
                raise C.WinError(C.get_last_error())
            if info.Attributes & REPARSE:
                raise OSError('reparse points, symbolic links and junctions are not allowed')
            if kernel.GetFileType(value) != 1:  # FILE_TYPE_DISK
                raise OSError('not a disk file or directory')
            self.is_directory = bool(info.Attributes & DIRECTORY)
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.value is not None:
            kernel.CloseHandle(self.value)
            self.value = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def _open(parent, name, access, disposition=FILE_OPEN, directory=False, file=False):
    if parent is not None:
        _leaf(name)
    encoded = name.encode('utf-16-le', 'surrogatepass')
    if len(encoded) > 65532:
        raise OSError('Windows filename is too long')
    buffer = C.create_string_buffer(encoded + b'\x00\x00')
    unicode = UnicodeString(len(encoded), len(encoded) + 2, C.cast(buffer, C.c_void_p))
    # OBJ_DONT_REPARSE on relative lookups; the volume name itself uses the OS's
    # DOS-device mapping. All components below the volume are separate opens.
    attributes = ObjectAttributes(C.sizeof(ObjectAttributes), parent.value if parent else None,
        C.pointer(unicode), 0x40 | (0x1000 if parent else 0), None, None)
    options = SYNC_IO | OPEN_REPARSE | (1 if directory else 0) | (0x40 if file else 0)
    result, status = W.HANDLE(), IOStatus()
    _check(ntdll.NtCreateFile(C.byref(result), access | SYNCHRONIZE | READ_ATTRIBUTES,
        C.byref(attributes), C.byref(status), None, 0x80, 3, disposition, options, None, 0))
    # Share read/write, but not deletion: an opened directory/file cannot be
    # renamed out from under this operation. Final destination replacement is
    # performed through the newly created file's own DELETE-capable handle.
    return Handle(result.value)


def _volume(anchor):
    if anchor.startswith('\\\\?\\UNC\\'):
        return '\\??\\UNC\\' + anchor[8:]
    if anchor.startswith('\\\\?\\'):
        anchor = anchor[4:]
    if re.fullmatch(r'[a-zA-Z]:\\', anchor):
        return '\\??\\' + anchor
    if anchor.startswith('\\\\'):
        return '\\??\\UNC\\' + anchor[2:]
    raise OSError('expected an absolute Windows drive or UNC root')


@contextlib.contextmanager
def directory(root, parts=(), create=False):
    root = Path(root)
    if not root.is_absolute():
        raise OSError('safe file root must be an absolute, pre-resolved path')
    held = []
    try:
        parent = _open(None, _volume(root.anchor), 1 | TRAVERSE, directory=True)
        held.append(parent)
        for part in root.parts[1:]:
            parent = _open(parent, part, 1 | TRAVERSE, directory=True)
            held.append(parent)
        for part in parts:
            parent = _open(parent, part, 1 | TRAVERSE,
                           FILE_OPEN_IF if create else FILE_OPEN, directory=True)
            held.append(parent)
        yield parent
    finally:
        for handle in reversed(held):
            handle.close()


def listdir(parent):
    names = []
    first = True
    while True:
        buffer = C.create_string_buffer(65536)
        # FileFullDirectoryRestartInfo / FileFullDirectoryInfo (Windows 8+).
        if not kernel.GetFileInformationByHandleEx(parent.value, 15 if first else 14, buffer, len(buffer)):
            error = C.get_last_error()
            if error == 18:  # ERROR_NO_MORE_FILES
                return names
            raise C.WinError(error)
        first = False
        at = 0
        while True:
            info = DirectoryInfo.from_buffer(buffer, at)
            start = at + DirectoryInfo.Name.offset
            end = start + info.NameLength
            if end > len(buffer) or info.NameLength % 2:
                raise OSError('invalid directory entry')
            name = buffer.raw[start:end].decode('utf-16-le', 'surrogatepass')
            if name not in ('.', '..'):
                names.append(name)
            if not info.Next:
                break
            if info.Next < DirectoryInfo.Name.offset or at + info.Next >= len(buffer):
                raise OSError('invalid directory entry offset')
            at += info.Next


def _read(handle):
    if handle.is_directory:
        raise OSError('not a regular file')
    chunks = []
    buffer = C.create_string_buffer(1024 * 1024)
    count = W.DWORD()
    while True:
        if not kernel.ReadFile(handle.value, buffer, len(buffer), C.byref(count), None):
            raise C.WinError(C.get_last_error())
        if not count.value:
            return b''.join(chunks)
        chunks.append(buffer.raw[:count.value])


def read_at(parent, name):
    with _open(parent, name, 1, file=True) as handle:
        return _read(handle)


def asset(parent, name):
    with _open(parent, name, 1) as handle:
        if handle.is_directory:
            return read_at(handle, 'index.html'), '.html'
        return _read(handle), Path(name).suffix.lower()


def _replace(handle, parent, name):
    _leaf(name)
    encoded = name.encode('utf-16-le', 'surrogatepass')
    buffer = C.create_string_buffer(C.sizeof(RenameInfo) + len(encoded))
    info = RenameInfo.from_buffer(buffer)
    info.Replace = 1
    info.RootDirectory = parent.value
    info.NameLength = len(encoded)
    C.memmove(C.addressof(buffer) + RenameInfo.Name.offset, encoded, len(encoded))
    status = IOStatus()
    _check(ntdll.NtSetInformationFile(handle.value, C.byref(status), buffer, len(buffer), 10))


def write(parent, name, data):
    _leaf(name)
    try:
        with _open(parent, name, READ_ATTRIBUTES, file=True):
            pass
    except FileNotFoundError:
        pass
    temp = '.write-' + secrets.token_hex(16)
    with _open(parent, temp, 2 | DELETE, FILE_CREATE, file=True) as handle:
        committed = False
        try:
            for at in range(0, len(data), 1024 * 1024):
                chunk = data[at:at + 1024 * 1024]
                written = W.DWORD()
                buffer = C.create_string_buffer(chunk)
                if not kernel.WriteFile(handle.value, buffer, len(chunk), C.byref(written), None):
                    raise C.WinError(C.get_last_error())
                if written.value != len(chunk):
                    raise OSError('incomplete Windows file write')
            if not kernel.FlushFileBuffers(handle.value):
                raise C.WinError(C.get_last_error())
            _replace(handle, parent, name)
            committed = True
        finally:
            if not committed:
                # Delete the exact temp object by its handle, even if a directory
                # entry changed. Never reopen a temporary pathname for cleanup.
                delete, status = C.c_ubyte(1), IOStatus()
                _check(ntdll.NtSetInformationFile(handle.value, C.byref(status), C.byref(delete), 1, 13))
