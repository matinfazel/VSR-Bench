import argparse
import asyncio
import fractions
import json
import logging
import ssl
import uuid
from typing import Optional, Callable
import av 
from av.video.reformatter import VideoReformatter
import aiohttp_cors
from aiohttp import web
import aiortc
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaPlayer

logger = logging.getLogger("pc")
try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
except ModuleNotFoundError as e:
    logger.warning("Could not find uvloop; installing it is recommended for performance improvements")

pcs = set()

aiortc.codecs.h264.MIN_BITRATE = 1_000_000
aiortc.codecs.h264.MAX_BITRATE = 10_000_000
aiortc.codecs.h264.DEFAULT_BITRATE = 5_000_000

class VideoReducerTrack(MediaStreamTrack):
    """ 
    A video stream track that reduces resolution and caps the frame rate of another video track.
    """

    kind = "video"

    time_epsilon = 0.01

    def __init__(self, track: MediaStreamTrack, maximum_fps=60, maximum_height=1080):
        super().__init__() 
        assert (track.kind == "video")
        self.track = track
        self.maximum_fps = maximum_fps
        self.maximum_height = maximum_height
        self.last_frame_time = 0
        self.__reformatter = [VideoReformatter(), VideoReformatter()]
        self.__next_reformatter = 0
        self.onFrameSent: Optional[Callable] = None
        self.__loop = asyncio.get_event_loop()
        self.__next_frame = None
        self.__recv_lock = asyncio.Lock()

    @staticmethod
    def round_to_even(n):
        return int(round(float(n) / 2) * 2)

    def __reformat(self, frame, w: int, h: int, r=0):
        return self.__reformatter[r].reformat(frame, width=w, height=h, format="yuv420p", interpolation="FAST_BILINEAR")

    async def __prepare_next_frame(self):
        async with self.__recv_lock:
            while True:
                frame = await self.track.recv()
                frame_time = frame.time
                if fractions.Fraction(1, self.maximum_fps) - (frame_time - self.last_frame_time) <= self.time_epsilon:
                    break

            self.last_frame_time = frame_time

            r = self.__next_reformatter
            self.__next_reformatter = (self.__next_reformatter + 1) % len(self.__reformatter)

        h = self.round_to_even(min(self.maximum_height, frame.height))
        w = self.round_to_even(float(h) / frame.height * frame.width)

        new_frame = await self.__loop.run_in_executor(
            None, self.__reformat, frame, w, h, r
        )
        return new_frame


    async def recv(self):
        if self.__next_frame is None:
            self.__next_frame = asyncio.ensure_future(self.__prepare_next_frame())

        next_frame = self.__next_frame

        self.__next_frame = asyncio.ensure_future(self.__prepare_next_frame())

        frame = await next_frame

        if self.onFrameSent:
            self.onFrameSent(frame)

        return frame

    def stop(self) -> None:
        super().stop()
        self.track.stop()

async def offer(request):
    """
    Handle an incoming WebRTC offer from the client, set up
    a peer connection, and stream video from the configured source.
    """

    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    pc_id = "PeerConnection(%s)" % uuid.uuid4()
    pcs.add(pc)

    def log_info(msg, *args):
        logger.info(pc_id + " " + msg, *args)

    log_info("Created for %s", request.remote)

    player = MediaPlayer(params['PlayFile'], loop=False)#
    
    reduced_video_track: Optional[VideoReducerTrack] = None

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        log_info("Connection state is %s", pc.connectionState)

        if pc.connectionState == "failed" or pc.connectionState == "closed":
            logger.info('Closing connection')
            await pc.close()
            pcs.discard(pc)

    @pc.on("track")
    def on_track(track):
        log_info("Track %s received", track.kind)

        @track.on("ended")
        async def on_ended():
            log_info("Track %s ended", track.kind)            

    await pc.setRemoteDescription(offer)

    if player and player.video:
        reduced_video_track = VideoReducerTrack(player.video)
        pc.addTrack(reduced_video_track)

    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type="application/json",
        text=json.dumps(
            {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
        ),
    )

async def on_shutdown(app):
    """
    Close all peer connections on shutdown.
    """
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="WebRTC video sender using aiortc"
    )
    parser.add_argument("--cert-file", help="SSL certificate file (for HTTPS)")
    parser.add_argument("--key-file", help="SSL key file (for HTTPS)")
    parser.add_argument(
        "--host", default="0.0.0.0", help="Host for HTTP server (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", type=int, default=8080, help="Port for HTTP server (default: 8080)"
    )
    parser.add_argument("--verbose", "-v", action="count")
    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)
    av.logging.set_level(av.logging.ERROR)

    if args.cert_file:
        ssl_context = ssl.SSLContext()
        ssl_context.load_cert_chain(args.cert_file, args.key_file)
    else:
        ssl_context = None

    app = web.Application()
    app.on_shutdown.append(on_shutdown)
    offer_route = app.router.add_post('/offer', offer, name='offer')

    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
                allow_credentials=True,
                expose_headers="*",
                allow_headers="*",
            )
    })
    for route in list(app.router.routes()):
        cors.add(route)
    web.run_app(
        app, access_log=None, host=args.host, port=args.port, ssl_context=ssl_context)