"""Loopback DevTools transport for Windows browser tests; standard library only.

Chrome's ephemeral debugging port is discovered from the private temporary profile.
The WebSocket connects only to that port. Tests wait for real completion, including
fonts, exports and offline snapshots; they do not rely on a virtual-time timeout.
"""
import base64
import contextlib
import hashlib
import json
import os
from pathlib import Path
import queue
import secrets
import shutil
import socket
import struct
import subprocess
import threading
import tempfile
import time


@contextlib.contextmanager
def browser_profile():
    """A private profile, removed after Chrome releases its Windows file handles.

    Browser.close and waiting for the main process do not guarantee that its cache
    subprocess has released every file. Retry only Windows sharing/access errors;
    persistent locks and unrelated IO errors still fail validation.
    """
    profile = tempfile.mkdtemp(prefix='avagahana-browser-')
    try:
        yield profile
    finally:
        deadline = time.monotonic() + 10
        while True:
            try:
                shutil.rmtree(profile)
                break
            except OSError as error:
                if getattr(error, 'winerror', None) not in (5, 32, 33) or time.monotonic() >= deadline:
                    raise
                time.sleep(.1)


class WebSocket:
    def __init__(self, port, path):
        self.socket = socket.create_connection(('127.0.0.1', port), timeout=30)
        self.pending = b''
        try:
            key = base64.b64encode(secrets.token_bytes(16)).decode('ascii')
            self.socket.sendall((f'GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n'
                f'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
                'Sec-WebSocket-Version: 13\r\n\r\n').encode('ascii'))
            response = b''
            while b'\r\n\r\n' not in response:
                block = self.socket.recv(4096)
                if not block or len(response) > 65536:
                    raise RuntimeError('invalid DevTools handshake')
                response += block
            header, self.pending = response.split(b'\r\n\r\n', 1)
            accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode('ascii')).digest())
            fields = dict(line.split(b':', 1) for line in header.split(b'\r\n')[1:] if b':' in line)
            fields = {k.lower(): v.strip() for k, v in fields.items()}
            if b' 101 ' not in header.split(b'\r\n')[0] or fields.get(b'sec-websocket-accept') != accept:
                raise RuntimeError('DevTools handshake refused')
            self.socket.settimeout(None)
        except BaseException:
            self.socket.close()
            raise

    def exact(self, length):
        while len(self.pending) < length:
            chunk = self.socket.recv(max(4096, length - len(self.pending)))
            if not chunk:
                raise EOFError('DevTools connection closed')
            self.pending += chunk
        result, self.pending = self.pending[:length], self.pending[length:]
        return result

    def send(self, data, opcode=1):
        size = len(data)
        prefix = bytes([0x80 | opcode])
        if size < 126:
            prefix += bytes([0x80 | size])
        elif size < 65536:
            prefix += bytes([0x80 | 126]) + struct.pack('!H', size)
        else:
            prefix += bytes([0x80 | 127]) + struct.pack('!Q', size)
        mask = secrets.token_bytes(4)
        self.socket.sendall(prefix + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(data)))

    def receive(self):
        fragments = []
        while True:
            a, b = self.exact(2)
            size = b & 127
            if size == 126:
                size = struct.unpack('!H', self.exact(2))[0]
            elif size == 127:
                size = struct.unpack('!Q', self.exact(8))[0]
            if size > 64 * 1024 * 1024:
                raise RuntimeError('DevTools message too large')
            mask = self.exact(4) if b & 128 else None
            body = self.exact(size)
            if mask:
                body = bytes(v ^ mask[i % 4] for i, v in enumerate(body))
            opcode = a & 15
            if opcode == 8:
                raise EOFError('DevTools connection closed')
            if opcode == 9:
                self.send(body, 10)
                continue
            if opcode == 10:
                continue
            if opcode not in (0, 1):
                raise RuntimeError('unexpected DevTools frame')
            fragments.append(body)
            if sum(map(len, fragments)) > 64 * 1024 * 1024:
                raise RuntimeError('DevTools message too large')
            if a & 128:
                return json.loads(b''.join(fragments))

    def close(self):
        try:
            self.socket.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.socket.close()


@contextlib.contextmanager
def chrome_port(browser, profile):
    command = [browser, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
               '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', f'--user-data-dir={profile}']
    proc = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) if os.name == 'nt' else 0)
    connection = None
    try:
        active = Path(profile) / 'DevToolsActivePort'
        deadline = time.time() + 30
        while True:
            try:
                port, path = active.read_text().splitlines()[:2]
                connection = WebSocket(int(port), path)
                break
            except (OSError, ValueError):
                if time.time() >= deadline or proc.poll() is not None:
                    raise RuntimeError('browser did not start its local DevTools connection')
                time.sleep(.1)
        messages, events = queue.Queue(), []
        def read():
            try:
                while True:
                    messages.put(connection.receive())
            except (OSError, EOFError, RuntimeError, ValueError):
                messages.put(None)
        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        ids = iter(range(1, 1 << 30))
        def send(method, params=None, session=None, wait=30):
            mid = next(ids)
            message = {'id': mid, 'method': method, 'params': params or {}}
            if session:
                message['sessionId'] = session
            connection.send(json.dumps(message).encode('utf-8'))
            end = time.time() + wait
            while time.time() < end:
                try:
                    got = messages.get(timeout=max(.05, end - time.time()))
                except queue.Empty:
                    break
                if got is None:
                    raise RuntimeError('browser connection closed')
                if 'id' not in got:
                    events.append(got)
                elif got['id'] == mid:
                    if 'error' in got:
                        raise RuntimeError(f"{method}: {got['error']}")
                    return got.get('result', {})
            raise RuntimeError(f'{method}: no answer')
        try:
            yield send, events
        finally:
            try:
                send('Browser.close', wait=5)
            except (RuntimeError, OSError):
                pass
    finally:
        if connection:
            connection.close()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(10)
