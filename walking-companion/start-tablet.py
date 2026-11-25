"""Start the local UNION demo from a computer on the tablet's Wi-Fi network."""
import argparse
import ipaddress
import socket
import sys

from preview import DEVICE_PORT, device_address, main


def prompt_arguments():
    address = input("输入 Mosaico 遥控屏幕显示的完整地址（直接回车则预览）\n> ").strip()
    if not address:
        return []
    device_ip = device_address(address)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((device_ip, DEVICE_PORT))
        host = route.getsockname()[0]
    if ipaddress.IPv4Address(host).is_loopback:
        raise ValueError("电脑需要连接到 Mosaico 所在的热点。")
    return ["--bind", host, "--device", address]


if __name__ == "__main__":
    if len(sys.argv) == 1:
        try:
            sys.argv.extend(prompt_arguments())
        except (argparse.ArgumentTypeError, ValueError, OSError) as error:
            raise SystemExit(str(error)) from error
    main()
