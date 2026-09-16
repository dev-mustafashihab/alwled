#!/usr/bin/env python3
"""خادم ثابت للوحة الإدارة (بلا أي تبعيات) — للتطوير والفحص البصري.

الاستخدام:
    python3 frontend/tools/serve.py [--port 5173] [--host 127.0.0.1]

ملاحظات:
- يقدّم `frontend/` فقط، ولا يوجد أي تنفيذ خلفي أو proxy.
- لا يحتوي أي سرّ: عنوان الـAPI يأتي من إعداد المتصفح أو من ?api=...
"""
from __future__ import annotations

import argparse
import functools
import http.server
import os
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
    }

    def end_headers(self):  # noqa: D102
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002
        sys.stderr.write('%s - %s\n' % (self.address_string(), format % args))


def main() -> int:
    parser = argparse.ArgumentParser(description='Static server for the alwled admin panel')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', 5173)))
    parser.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.host, args.port), handler) as httpd:
        print(f'alwled panel: http://{args.host}:{args.port}/  (root: {ROOT})', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('stopped', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
