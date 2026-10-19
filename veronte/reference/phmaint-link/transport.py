"""Transports for the application interface of Veronte Link (ARCHITECTURE section 9.1).

``MulticastTransport`` joins Link's multicast group and sends to Link's application port. It never uses the
autopilot-side endpoints (SIL 12345 / 56777, hardware 52000). Opening sockets sends nothing.
"""

from __future__ import annotations

import asyncio
import logging
import socket
import struct
from abc import ABC, abstractmethod
from collections.abc import Callable

log = logging.getLogger(__name__)

Handler = Callable[[bytes], None]


class TransportError(Exception):
    """The transport cannot open or cannot send; the message is shown as the reason (chip tooltip)."""


class Transport(ABC):
    name = "transport"

    def __init__(self) -> None:
        self._handler: Handler | None = None

    def set_handler(self, handler: Handler | None) -> None:
        """Called on the asyncio thread for every received datagram."""
        self._handler = handler

    def _deliver(self, datagram: bytes) -> None:
        if self._handler is not None:
            try:
                self._handler(datagram)
            except Exception:  # noqa: BLE001 - a bad datagram must not stop the receive loop
                log.exception("datagram handler failed")

    @property
    @abstractmethod
    def is_open(self) -> bool: ...

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    def send(self, datagram: bytes) -> None: ...


class OfflineTransport(Transport):
    """Profile ``offline``: no sockets, nothing in, nothing out."""

    name = "offline"

    @property
    def is_open(self) -> bool:
        return False

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    def send(self, datagram: bytes) -> None:
        raise TransportError("offline")


class LoopbackTransport(Transport):
    """In-memory transport for tests: ``sent`` records frames, ``inject`` delivers a datagram as if from Link."""

    name = "loopback"

    def __init__(self) -> None:
        super().__init__()
        self.sent: list[bytes] = []
        self._open = False

    @property
    def is_open(self) -> bool:
        return self._open

    async def start(self) -> None:
        self._open = True

    async def stop(self) -> None:
        self._open = False

    def send(self, datagram: bytes) -> None:
        if not self._open:
            raise TransportError("not open")
        self.sent.append(datagram)

    def inject(self, datagram: bytes) -> None:
        self._deliver(datagram)


class _RxProtocol(asyncio.DatagramProtocol):
    def __init__(self, deliver: Handler, on_error: Callable[[str], None]):
        self._deliver = deliver
        self._on_error = on_error

    def datagram_received(self, data: bytes, addr: tuple) -> None:  # noqa: ARG002
        self._deliver(data)

    def error_received(self, exc: Exception) -> None:
        self._on_error(str(exc))


class MulticastTransport(Transport):
    """Receive on ``<group>:rx_port`` (address reuse, membership on ``interface``), send to ``<group>:tx_port``."""

    name = "multicast"

    def __init__(self, group: str, interface: str, rx_port: int, tx_port: int):
        super().__init__()
        self.group, self.interface, self.rx_port, self.tx_port = group, interface, rx_port, tx_port
        self._rx: socket.socket | None = None
        self._tx: socket.socket | None = None
        self._transport: asyncio.DatagramTransport | None = None
        self.last_error = ""

    @property
    def is_open(self) -> bool:
        return self._transport is not None

    async def start(self) -> None:
        if self.is_open:
            return
        try:
            rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            self._rx = rx
            rx.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            rx.bind(("0.0.0.0", self.rx_port))
            mreq = struct.pack("4s4s", socket.inet_aton(self.group), socket.inet_aton(self.interface))
            rx.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            rx.setblocking(False)

            tx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            self._tx = tx
            tx.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(self.interface))
            tx.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
            tx.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)

            loop = asyncio.get_running_loop()
            self._transport, _ = await loop.create_datagram_endpoint(
                lambda: _RxProtocol(self._deliver, self._set_error), sock=rx
            )
        except OSError as exc:
            self._close_sockets()
            raise TransportError(
                f"cannot join {self.group}:{self.rx_port} on {self.interface}: {exc}"
            ) from exc
        log.info(
            "multicast transport open: %s rx %d tx %d via %s",
            self.group,
            self.rx_port,
            self.tx_port,
            self.interface,
        )

    def _set_error(self, text: str) -> None:
        self.last_error = text
        log.warning("multicast receive error: %s", text)

    def _close_sockets(self) -> None:
        for s in (self._rx, self._tx):
            if s is not None:
                try:
                    s.close()
                except OSError:
                    pass
        self._rx = self._tx = None

    async def stop(self) -> None:
        if self._transport is not None:
            self._transport.close()
            self._transport = None
        self._close_sockets()

    def send(self, datagram: bytes) -> None:
        if self._tx is None:
            raise TransportError("not open")
        try:
            self._tx.sendto(datagram, (self.group, self.tx_port))
        except OSError as exc:
            raise TransportError(f"send failed: {exc}") from exc
