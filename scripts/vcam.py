#!/usr/bin/env python3
"""
Virtual camera helper for ChordClicks.
Reads raw RGBA video frames from stdin and pushes them to a pyvirtualcam device.

Usage:
    python vcam.py <width> <height> <fps>

Example:
    python vcam.py 1280 720 30
"""

import sys

try:
    import pyvirtualcam
    import numpy as np
except ImportError:
    sys.stderr.write("ERR: pyvirtualcam or numpy not installed. Run install-virtualcam first.\n")
    sys.exit(1)


def read_exact(stream, n, buf):
    """Fill `buf` (a bytearray of length n) from a *binary* stream. Returns False on EOF."""
    view = memoryview(buf)
    got = 0
    while got < n:
        r = stream.readinto(view[got:n])
        if not r:
            return False
        got += r
    return True


def main():
    if len(sys.argv) != 4:
        sys.stderr.write("ERR: Usage: vcam.py <width> <height> <fps>\n")
        sys.exit(1)

    try:
        width, height, fps = (int(a) for a in sys.argv[1:4])
    except ValueError:
        sys.stderr.write("ERR: width, height, and fps must be integers.\n")
        sys.exit(1)

    try:
        cam = pyvirtualcam.Camera(width=width, height=height, fps=fps, fmt=pyvirtualcam.PixelFormat.RGBA)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"ERR: {e}\n")
        sys.exit(1)

    sys.stdout.write(f"READY:{getattr(cam, 'device', 'Virtual Camera')}\n")
    sys.stdout.flush()

    frame_size = width * height * 4  # RGBA, exactly what canvas.getImageData() produces
    buf = bytearray(frame_size)
    stdin = sys.stdin.buffer  # binary! text-mode stdin corrupts video bytes on Windows

    try:
        while read_exact(stdin, frame_size, buf):
            frame = np.frombuffer(buf, dtype=np.uint8).reshape((height, width, 4))
            cam.send(frame)
            cam.sleep_until_next_frame()
    except KeyboardInterrupt:
        pass
    finally:
        cam.close()


if __name__ == "__main__":
    main()
