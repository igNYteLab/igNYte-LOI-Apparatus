# Primary author: Will Andre Pasimio Llaneta (wpl5304)
# Project: IgNYte-FPA
# Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

import argparse
import json
import statistics
import time

import serial


def parse_args():
    parser = argparse.ArgumentParser(description="Collect TMC2209 StallGuard baseline samples.")
    parser.add_argument("--port", default="COM18", help="Serial port, for example COM18.")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate.")
    parser.add_argument("--sample-count", type=int, default=6, help="Samples per velocity segment.")
    parser.add_argument("--sample-interval", type=float, default=0.35, help="Seconds between samples.")
    parser.add_argument(
        "--move-duration",
        type=float,
        default=None,
        help="Optional seconds to run each velocity segment. Overrides sample-count timing.",
    )
    parser.add_argument(
        "--speeds",
        default="0.1,0.2,0.3",
        help="Comma-separated speed magnitudes in mm/s.",
    )
    return parser.parse_args()


def read_json_line(ser, timeout_s):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        raw = ser.readline()
        if not raw:
            continue
        line = raw.decode("utf-8", errors="replace").strip()
        if not line or not line.startswith("{"):
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    return None


def send_command(ser, command):
    ser.write((json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8"))
    ser.flush()


def wait_for_status(ser, component=None, status=None, timeout_s=3.0):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        message = read_json_line(ser, max(0.05, deadline - time.monotonic()))
        if message is None:
            continue
        if message.get("type") != "status":
            continue
        if component is not None and message.get("component") != component:
            continue
        if status is not None and message.get("status") != status:
            continue
        return message
    return None


def request_status(ser, command, status, timeout_s=3.0):
    send_command(ser, command)
    return wait_for_status(ser, component="motor", status=status, timeout_s=timeout_s)


def collect_stall_sample(ser):
    return request_status(ser, {"cmd": "motor.stall_status"}, "stall_status", timeout_s=2.0)


def summarize(segment_samples):
    values = [sample["sg_result"] for sample in segment_samples if "sg_result" in sample]
    if not values:
        return {}
    return {
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "mean": round(statistics.fmean(values), 2),
    }


def main():
    args = parse_args()
    speeds = [float(item.strip()) for item in args.speeds.split(",") if item.strip()]
    results = []

    with serial.Serial(args.port, args.baud, timeout=0.2) as ser:
        time.sleep(2.0)
        ser.reset_input_buffer()

        driver_status = request_status(ser, {"cmd": "motor.driver_status"}, "driver_status", timeout_s=4.0)
        print("driver_status:", json.dumps(driver_status, separators=(",", ":")))
        if not driver_status or not driver_status.get("connection_ok"):
            raise SystemExit("TMC2209 UART readback failed; aborting sweep.")

        configure_status = request_status(
            ser, {"cmd": "motor.driver_configure"}, "driver_status", timeout_s=4.0
        )
        print("driver_configure:", json.dumps(configure_status, separators=(",", ":")))
        if not configure_status or not configure_status.get("connection_ok"):
            raise SystemExit("TMC2209 reconfigure failed; aborting sweep.")

        enabled_status = request_status(ser, {"cmd": "motor.enable"}, "enabled", timeout_s=3.0)
        print("enabled:", json.dumps(enabled_status, separators=(",", ":")))
        if not enabled_status or not enabled_status.get("enabled"):
            raise SystemExit("Motor did not report enabled; aborting sweep.")

        try:
            for speed in speeds:
                for signed_speed in (speed, -speed):
                    print(f"segment: velocity_mm_s={signed_speed}")
                    send_command(ser, {"cmd": "motor.velocity_mm_s", "mm_s": signed_speed})
                    wait_for_status(ser, component="motor", status="command_queued", timeout_s=1.0)
                    time.sleep(0.5)

                    samples = []
                    if args.move_duration is None:
                        for _ in range(args.sample_count):
                            sample = collect_stall_sample(ser)
                            if sample is not None:
                                samples.append(sample)
                                print("sample:", json.dumps(sample, separators=(",", ":")))
                            time.sleep(args.sample_interval)
                    else:
                        segment_end = time.monotonic() + args.move_duration
                        while time.monotonic() < segment_end:
                            sample = collect_stall_sample(ser)
                            if sample is not None:
                                samples.append(sample)
                                print("sample:", json.dumps(sample, separators=(",", ":")))
                            remaining = segment_end - time.monotonic()
                            if remaining > 0:
                                time.sleep(min(args.sample_interval, remaining))

                    send_command(ser, {"cmd": "motor.stop"})
                    wait_for_status(ser, component="motor", status="command_queued", timeout_s=1.0)
                    time.sleep(0.5)

                    summary = summarize(samples)
                    summary["velocity_mm_s"] = signed_speed
                    results.append(summary)
                    print("summary:", json.dumps(summary, separators=(",", ":")))
        finally:
            send_command(ser, {"cmd": "motor.stop"})
            wait_for_status(ser, component="motor", status="command_queued", timeout_s=1.0)
            send_command(ser, {"cmd": "motor.disable"})
            disabled_status = wait_for_status(ser, component="motor", status="disabled", timeout_s=3.0)
            print("disabled:", json.dumps(disabled_status, separators=(",", ":")))

    print("results:", json.dumps(results, separators=(",", ":")))


if __name__ == "__main__":
    main()
