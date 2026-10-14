"""Build and serve the frontend simulation locally, without model credentials."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlsplit

from build_preview import build, DEST, ROOT


class PreviewHandler(SimpleHTTPRequestHandler):
    build_lock = Lock()
    source_signature = None

    @classmethod
    def rebuild_if_changed(cls):
        sources = sorted((ROOT / 'frontend').glob('*')) + [ROOT / 'preview/adapter.js', ROOT / 'data/guide.json']
        signature = tuple((str(path), path.stat().st_mtime_ns, path.stat().st_size) for path in sources if path.is_file())
        with cls.build_lock:
            if signature != cls.source_signature:
                build()
                cls.source_signature = signature

    def do_GET(self):
        if urlsplit(self.path).path in ('/', '/index.html'):
            self.rebuild_if_changed()
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8790)
    args = parser.parse_args()
    PreviewHandler.rebuild_if_changed()
    handler = partial(PreviewHandler, directory=str(DEST))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError as error:
        parser.exit(1, f'无法启动端口 {args.port}：{error}。请关闭已有预览，或使用 --port 8791。\n')
    print(f'前端模拟预览：http://127.0.0.1:{args.port}', flush=True)
    print('修改 frontend/ 或 preview/ 后刷新页面即可更新。Ctrl+C 停止服务。', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
