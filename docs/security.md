# Local operation and data boundaries

Avagahana's relay is a local single-user tool. It binds to `127.0.0.1`, so other
machines cannot connect directly. Keep it local: proxying or tunnelling the port
requires a separate design for authentication, authorization and deployment isolation.
Host and Origin checks remain enabled, but they do not authenticate local clients.
Other programs/users able to connect locally can read maps/events, point open pages,
participate in renders and invoke enabled controls. `--no-open` and `--no-shutdown`
remove only those two capabilities; they do not make map reads private.

Python runs with the launching account's filesystem, process and inherited environment
permissions. File checks govern normal application operations, not the permissions
of a compromised process. Loopback binding does not restrict outbound connections.
No virtual environment, container, dedicated account or interpreter download is needed.
A virtual environment would isolate dependencies, not operating-system permissions.

## Files and themes

The maps root is chosen explicitly and resolved once. It may itself be a symlink.
Below that root, `.themes/`, theme JSON and fonts must be ordinary directories/files:
no symlinks, even links that point back inside the maps root. HTTP font reads and
snapshot font packing use the same reader. Theme generation uses contained,
exclusive temporary files and atomic replacement; linked destinations are refused.
Static assets use their separately configured roots, with the same final-file checks
for a direct asset and a directory's `index.html`.

These operations use platform-specific handles. macOS/Linux use descriptor-relative,
no-follow opens. Windows uses native `NtCreateFile` relative to held directory handles,
opens reparse points without traversing them and rejects their attributes. Directory
listing, reads, atomic rename and temporary-file cleanup use handles as well. Windows
symbolic links, junctions, alternate streams and device aliases cannot redirect theme
operations. No package installation or administrator access is needed for normal use.

The native Windows calls are exposed through standard-library `ctypes`. References:
[relative opens](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile),
[directory enumeration](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex),
and [relative rename](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information).
An unavailable operation or a filesystem that cannot honor these requirements reports
an error; there is no unchecked path-based fallback. Windows remains a supported
relay platform and is included in the Python 3.9/3.15 validation matrix.

On POSIX, a concurrent process with permission to rename an already-open directory
can relocate it while its handle remains valid. Windows handles deny deletion/sharing
needed to replace an opened directory. Operations remain attached to that
opened directory rather than following a replacement link. This is not confinement
against another process controlling the account or changing filesystem mount points.

CLI arguments `--out`, `--before`, `--since`, `--draft` and source font paths are
intentional user-selected file authorities outside the maps root. Theme contents
cannot choose an output destination. Do not run Avagahana as a privileged account.

Themes have defined fields and [targeted CSS hooks](theme-styling.md). Imported data
is normalized, including the source retained for snapshots. Printing constructs its
document with DOM nodes; text is never interpolated as HTML. CSP provides an
additional browser boundary; static embedding must also work without relying on it.

## Copies of data

Snapshots can contain the map, an earlier version, a comparison baseline and fonts.
Sharing one shares those inputs. Exported pictures contain the displayed labels.
Browser local storage includes hashes, truncated labels and remembered map structure;
picked-folder handles are remembered in IndexedDB subject to browser permissions.
Earlier versions and draft map text can be sent to local event subscribers.

## Python compatibility

The commands require Python 3.9 or later and use only the standard library. Tests run
on 3.9 and 3.15. Prefer a patched, maintained Python release for normal use: upstream
3.9 maintenance has ended. Compatibility with 3.9 does not claim continued upstream
security maintenance or particular distributor backports. Installing a newer Python
alongside Apple's development-tools copy is sufficient; leave Apple's copy intact.
